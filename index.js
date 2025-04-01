const path = require("node:path");
const fs = require("node:fs");
const { Worker } = require("node:worker_threads");
const dotenv = require("dotenv").config();

const express = require("express");
const protobufjs = require("protobufjs");
const unzipper = require("unzipper");
const Database = require("better-sqlite3");
const csvParser = require("csv-parser");
require("colour");

const db = new Database(path.join(__dirname, "gtfs", "gtfs.db"));
db.pragma("journal_mode = WAL");

const { tables, indexes } = require(path.join(__dirname, "scripts", "tables.js"));

const gtfsFilePath = path.join(__dirname, "gtfs", "gtfs.json");
const gtfsFile = JSON.parse(
    fs.readFileSync(gtfsFilePath, {
        encoding: "utf8",
        flag: "r",
    }) || "{}"
);
if (!gtfsFile.version) gtfsFile.version = {};
if (!gtfsFile.lastUpdated) gtfsFile.lastUpdated = {};

const { PORT } = process.env;

const log = {
    INITIALISE: "[INITIALISE]".blue,
    UPDATING: "[UPDATING]".yellow,
    FINISHED: "[FINISHED]".green,
    GTFS: "GTFS ".magenta,
    GTFSR: "GTFSR".magenta,
};

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function comma(val) {
    return String(val).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

class Endpoint {
    constructor({ name, endpointName, urls, method, headers, protobuf, protoType }) {
        this.apiName = name;
        this.name = `${name}_${endpointName}`;
        this.urls = urls;
        this.method = method || "GET";
        this.headers = headers;
        this.protobuf = protobuf || null;
        this.protoType = protoType || null;
        this.lookup = undefined;
    }

    async init() {
        console.log(`${log.INITIALISE} '${this.name}' endpoint`);

        const root = await protobufjs.load(this.protobuf);
        this.lookup = root.lookupType(this.protoType);

        if (this.urls.gtfsSchedule) {
            await this.updateGTFS();
        }

        if (this.urls.gtfsrTripUpdates && this.urls.gtfsrVehiclePositions) {
            await this.updateGTFSR();
        }
    }

    async createAndUpdateTable(name, columns, filePath) {
        return new Promise((resolve, reject) => {
            if (columns.length === 0) resolve();

            const tableName = `${this.name}_${gtfsFile.version[this.apiName][this.name]}_${name}`;
            const columnDef = columns.map((col) => col.join(" ")).join(", ");
            db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnDef});`);
            db.exec(`DELETE FROM ${tableName};`);

            const insertStatement = db.prepare(
                `INSERT INTO ${tableName} (${columns.map((col) => `${col[0]}`).join(", ")}) VALUES (${columns.map(() => `?`).join(", ")});`
            );
            const rows = [];
            const transaction = db.transaction(() => {
                rows.forEach((row) => insertStatement.run(...columns.map((col) => row[col[0].trim()])));
            });

            const readStream = fs.createReadStream(filePath).pipe(
                csvParser({
                    mapHeaders: ({ header }) => header.trim(),
                })
            );
            readStream.on("data", (row) => {
                rows.push(row);
                if (rows.length >= 500) {
                    transaction();
                    rows.length = 0;
                }
            });
            readStream.on("end", () => {
                if (rows.length > 0) {
                    transaction();
                }
            });
            readStream.on("error", (error) => {
                reject(error);
            });

            const index = indexes[name];
            if (index) {
                db.exec(`DROP INDEX IF EXISTS "${index.idx}";`);
                db.exec(`CREATE INDEX IF NOT EXISTS "${index.idx}" ON "${tableName}"("${index.column}");`);
            }

            const oldTableName = `${this.name}_${gtfsFile.version[this.apiName][this.name] - 1}_${name}`;
            db.exec(`DROP TABLE IF EXISTS "${oldTableName}";`);

            resolve();
        });
    }

    async updateGTFS() {
        if (!this.urls.gtfsSchedule) return;

        console.log(`${log.UPDATING} ${log.GTFS} '${this.name}' endpoint`);

        const response0 = await fetch(this.urls.gtfsSchedule, {
            method: "HEAD",
            headers: this.headers.gtfs,
        });
        let lastModified = response0.headers.get("last-modified");
        lastModified = Date.parse(lastModified);
        if (!response0.ok || !lastModified) {
            throw new Error(`HTTP request failed with status ${response0.status}` + JSON.stringify(response0));
        }

        if (!gtfsFile.lastUpdated[this.apiName]) gtfsFile.lastUpdated[this.apiName] = {};

        if (gtfsFile.lastUpdated[this.apiName][this.name] === lastModified) {
            return console.log(`${log.FINISHED} ${log.GTFS} '${this.name}' endpoint`);
        }

        const response1 = await fetch(this.urls.gtfsSchedule, {
            method: this.method,
            headers: this.headers.gtfs,
        });

        const blob = await response1.blob();

        const zipFilePath = path.join(__dirname, "gtfs", `${this.name}_${Date.now()}.zip`);
        fs.closeSync(fs.openSync(zipFilePath, "w"));
        const reader = blob.stream().getReader();
        const writableStream = fs.createWriteStream(zipFilePath);
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                writableStream.close();
                break;
            }
            writableStream.write(value);
        }

        const unzipDirPath = zipFilePath.slice(0, -4);
        fs.mkdirSync(unzipDirPath, {
            recursive: true,
        });
        const directory = await unzipper.Open.file(zipFilePath);
        await directory.extract({ path: unzipDirPath });

        const thisTables = tables(this.name);

        if (gtfsFile.version[this.apiName] === undefined) gtfsFile.version[this.apiName] = {};
        if (gtfsFile.version[this.apiName][this.name] === undefined) gtfsFile.version[this.apiName][this.name] = -1;
        gtfsFile.version[this.apiName][this.name]++;

        const promises = thisTables.map(async ({ name, columns }) => {
            const filePath = path.join(unzipDirPath, `${name}.txt`);
            if (fs.existsSync(filePath)) {
                return this.createAndUpdateTable(name, columns, filePath);
            }
            return Promise.resolve();
        });

        await Promise.all(promises);

        await wait(100);

        fs.unlinkSync(zipFilePath);
        fs.rmSync(unzipDirPath, { recursive: true, force: true }, (error) => {
            if (error) {
                throw new Error(error);
            }
        });

        gtfsFile.lastUpdated[this.apiName][this.name] = lastModified;
        fs.writeFileSync(gtfsFilePath, JSON.stringify(gtfsFile, null, 2));

        console.log(`${log.FINISHED} ${log.GTFS} '${this.name}' endpoint`);
    }

    async fetchGTFSR(url) {
        try {
            const response = await fetch(url, {
                method: this.method,
                headers: this.headers.gtfsr,
            });
            if (!response.ok) {
                throw new Error(`HTTP request failed with status ${response.status}` + JSON.stringify(response));
            }
            const buffer = await response.arrayBuffer();
            const decoded = this.lookup.decode(new Uint8Array(buffer));
            return decoded;
        } catch (error) {
            console.error(error);
        }
    }

    async updateGTFSR() {
        if (!this.urls.gtfsrTripUpdates || !this.urls.gtfsrVehiclePositions) return;

        console.log(`${log.UPDATING} ${log.GTFSR} '${this.name}' endpoint`);

        try {
            const [TripUpdates, VehiclePositions] = await Promise.all([
                await this.fetchGTFSR(this.urls.gtfsrTripUpdates),
                await this.fetchGTFSR(this.urls.gtfsrVehiclePositions),
            ]);

            const worker = new Worker(path.join(__dirname, "scripts", "GTFSR-thread.js"), {
                workerData: { name: this.endpointName, version: gtfsFile.version[this.name], TripUpdates, VehiclePositions },
            });
            worker.on("message", (message) => {
                // console.log(message);
                console.log(`${log.FINISHED} ${log.GTFSR} '${this.name}' endpoint`);
            });
            worker.on("error", (error) => {
                console.error(error);
            });
        } catch (error) {
            console.error(error);
        }
    }
}

class API {
    constructor({ name, headers, protobuf, protoType, endpoints }) {
        this.name = name || "API";
        this.headers = headers || {};
        this.protobuf = protobuf || null;
        this.protoType = protoType || null;
        this.autoUpdateGTFSinterval = null;
        this.autoUpdateGTFSRinterval = null;

        this.endpoints = [];
        for (let i = 0; i < endpoints.length; i++) {
            if (!endpoints[i].name) endpoints[i].name = this.name;
            if (!endpoints[i].headers) endpoints[i].headers = this.headers;
            if (!endpoints[i].protobuf) endpoints[i].protobuf = this.protobuf;
            if (!endpoints[i].protoType) endpoints[i].protoType = this.protoType;
            const endpoint = new Endpoint(endpoints[i]);
            endpoint.init();

            this.endpoints.push(endpoint);
        }
    }

    updateGTFS() {
        const startTime = Date.now();
        console.log(`${log.UPDATING} ${log.GTFS} '${this.name}' API`);
        for (let i = 0; i < this.endpoints.length; i++) {
            this.endpoints[i].updateGTFS();
        }
        console.log(`${log.FINISHED} ${log.GTFS} '${this.name}' API in ${(comma(Date.now() - startTime) + "ms").blue}`);
        return this;
    }

    updateGTFSR() {
        const startTime = Date.now();
        console.log(`${log.UPDATING} ${log.GTFSR} '${this.name}' API`);
        for (let i = 0; i < this.endpoints.length; i++) {
            this.endpoints[i].updateGTFSR();
        }
        console.log(`${log.FINISHED} ${log.GTFSR} '${this.name}' API in ${(comma(Date.now() - startTime) + "ms").blue}`);
        return this;
    }

    autoUpdateGTFS(period = 8 * 60 * 60 * 1000) {
        if (period === null) {
            clearInterval(this.autoUpdateGTFSinterval);
            this.autoUpdateGTFSinterval = null;
            return this;
        }
        if (this.autoUpdateGTFSinterval !== null) {
            this.autoUpdateGTFS(null);
            this.autoUpdateGTFS(period);
            return this;
        }
        this.autoUpdateGTFSinterval = setInterval(() => {
            this.updateGTFS();
        }, period);
        return this;
    }

    autoUpdateGTFSR(period = 60 * 1000) {
        if (period === null) {
            clearInterval(this.autoUpdateGTFSRinterval);
            this.autoUpdateGTFSRinterval = null;
            return this;
        }
        if (this.autoUpdateGTFSRinterval !== null) {
            this.autoUpdateGTFSR(null);
            this.autoUpdateGTFSR(period);
            return this;
        }
        this.autoUpdateGTFSRinterval = setInterval(() => {
            this.updateGTFSR();
        }, period);
        return this;
    }
}

// const app = express();

// // e.g. /api/NSW/sydneytrains/trips
// app.get("/api/:apiName/:endpointName/:tableName", (req, res) => {
//     const { apiName, endpointName, tableName } = req.params;
//     const query = req.query;
//     const { limit, offset } = query;

//     return res.sendStatus(200);
// });

// app.listen(PORT, "127.0.0.1", async () => {
//     console.log(`${log.INITIALISE} Server on port ${PORT}`);
// });

// https://opendata.transport.nsw.gov.au/data/organization/transport-opendata-hub
const NEW_SOUTH_WALES = new API({
    name: "NSW",
    headers: {
        gtfs: {
            accept: "application/octet-stream",
            authorization: `apikey ${process.env.NSW_APIKEY}`,
        },
        gtfsr: {
            accept: "application/x-google-protobuf",
            authorization: `apikey ${process.env.NSW_APIKEY}`,
        },
    },
    protobuf: path.join(__dirname, "protobuf", "NSW_1007_extension.proto"),
    protoType: "transit_realtime.FeedMessage",
    endpoints: [
        {
            endpointName: "sydneytrains",
            urls: {
                gtfsSchedule: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains",
                gtfsrTripUpdates: "https://api.transport.nsw.gov.au/v2/gtfs/realtime/sydneytrains",
                gtfsrVehiclePositions: "https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/sydneytrains",
            },
        },
        // {
        //     endpointName: "metro",
        //     urls: {
        //         gtfsSchedule: "https://api.transport.nsw.gov.au/v2/gtfs/schedule/metro",
        //         gtfsrTripUpdates: "https://api.transport.nsw.gov.au/v2/gtfs/realtime/metro",
        //         gtfsrVehiclePositions: "https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/metro",
        //     },
        // },
        // ...[
        //     "buses",
        //     "nswtrains",
        //     "lightrail/cbdandsoutheast",
        //     "lightrail/innerwest",
        //     "lightrail/newcastle",
        //     "lightrail/parramatta",
        //     "ferries/sydneyferries",
        //     "regionbuses/centralwestandorana",
        //     "regionbuses/centralwestandorana2",
        //     "regionbuses/newenglandnorthwest",
        //     "regionbuses/northcoast",
        //     "regionbuses/northcoast2",
        //     "regionbuses/northcoast3",
        //     "regionbuses/riverinamurray",
        //     "regionbuses/riverinamurray2",
        //     "regionbuses/southeasttablelands",
        //     "regionbuses/southeasttablelands2",
        //     "regionbuses/sydneysurrounds",
        //     "regionbuses/newcastlehunter",
        //     "regionbuses/farwest",
        // ].map((name) => {
        //     {
        //         return {
        //             endpointName: name.replaceAll("/", ""),
        //             urls: {
        //                 gtfsSchedule: `https://api.transport.nsw.gov.au/v1/gtfs/schedule/${name}`,
        //                 gtfsrTripUpdates: `https://api.transport.nsw.gov.au/v1/gtfs/realtime/${name}`,
        //                 gtfsrVehiclePositions: `https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/${name}`,
        //             },
        //         };
        //     }
        // }),
    ],
})
    .autoUpdateGTFS(2 * 60 * 60 * 1000)
    .autoUpdateGTFSR(20 * 1000);

// // https://translink.com.au/about-translink/open-data/gtfs-rt
// const QUEENSLAND = new API({
//     name: "QLD",
//     headers: {
//         gtfs: {
//             accept: "application/octet-stream",
//         },
//         gtfsr: {
//             accept: "application/x-google-protobuf",
//         },
//     },
//     protobuf: path.join(__dirname, "protobuf", "QLD_gtfs-realtime.proto"),
//     protoType: "GTFSv2.Realtime.FeedMessage",
//     endpoints: ["seq", "cns", "nsi", "mhb", "bow", "inn"].map((name) => {
//         return {
//             endpointName: name.toLowerCase(),
//             urls: {
//                 gtfsSchedule: `https://gtfsrt.api.translink.com.au/GTFS/${name.toUpperCase()}_GTFS.zip`,
//                 gtfsrTripUpdates: `https://gtfsrt.api.translink.com.au/api/realtime/${name.toUpperCase()}/TripUpdates`,
//                 gtfsrVehiclePositions: `https://gtfsrt.api.translink.com.au/api/realtime/${name.toUpperCase()}/VehiclePositions`,
//             },
//         };
//     }),
// })
//     .autoUpdateGTFS(2 * 60 * 60 * 1000)
//     .autoUpdateGTFSR(20 * 1000);

// // https://gtfs.adelaidemetro.com.au/#/
// const SOUTH_AUSTRALIA = new API({
//     name: "SA",
//     headers: {
//         gtfs: {
//             accept: "application/octet-stream",
//         },
//         gtfsr: {
//             accept: "application/x-google-protobuf",
//         },
//     },
//     protobuf: path.join(__dirname, "protobuf", "SA_adelaidemetro_gtfsr.proto"),
//     protoType: "transit_realtime.FeedMessage",
//     endpoints: [
//         {
//             endpointName: "adelaidemetro",
//             urls: {
//                 gtfsSchedule: "https://gtfs.adelaidemetro.com.au/v1/static/latest/google_transit.zip",
//                 gtfsrTripUpdates: "https://gtfs.adelaidemetro.com.au/v1/realtime/trip_updates",
//                 gtfsrVehiclePositions: "https://gtfs.adelaidemetro.com.au/v1/realtime/vehicle_positions",
//             },
//         },
//     ],
// })
//     .autoUpdateGTFS(2 * 60 * 60 * 1000)
//     .autoUpdateGTFSR(20 * 1000);
