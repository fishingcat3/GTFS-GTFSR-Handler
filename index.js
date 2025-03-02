const path = require("node:path");
const { fileURLtoPath } = require("node:url");
const fs = require("node:fs");
const dotenv = require("dotenv").config();

const express = require("express");
const protobufjs = require("protobufjs");
const unzipper = require("unzipper");
const Database = require("better-sqlite3");
const csvParser = require("csv-parser");

const db = new Database(path.join(__dirname, "gtfs", "gtfs.db"));
db.pragma("journal_mode = WAL");

const { tables } = require(path.join(__dirname, "scripts", "tables.js"));

const { PORT } = process.env;
const { NSW_APIKEY } = process.env;

class Endpoint {
    constructor({
        name,
        endpointName,
        urls,
        method,
        headers,
        protobuf,
        protoType,
    }) {
        this.name = `${name}_${endpointName}`;
        this.urls = urls;
        this.method = method || "GET";
        this.headers = headers;
        this.protobuf = protobuf || null;
        this.protoType = protoType || null;
        this.lookup = undefined;
    }

    async init() {
        const root = await protobufjs.load(this.protobuf);
        this.lookup = root.lookupType(this.protoType);

        await this.updateGTFS();
    }

    async updateGTFS() {
        const response0 = await fetch(this.urls.gtfsSchedule, {
            method: "HEAD",
            mode: "cors",
            headers: this.headers.gtfs,
        });
        let lastModified = response0.headers.get("last-modified");
        lastModified = Date.parse(lastModified);
        if (!response0.ok || !lastModified) {
            throw new Error(
                `HTTP request failed with status ${response0.status}` +
                    JSON.stringify(response0)
            );
        }

        const gtfsLastUpdated = JSON.parse(
            fs.readFileSync(path.join(__dirname, "gtfs", "gtfs.json"), {
                encoding: "utf8",
                flag: "r",
            }) || "{}"
        );
        if (!gtfsLastUpdated.lastUpdated) gtfsLastUpdated.lastUpdated = {};

        if (gtfsLastUpdated.lastUpdated[this.name] == lastModified) return;

        console.log("UPDATING GTFS " + this.name);
        const response1 = await fetch(this.urls.gtfsSchedule, {
            method: this.method,
            mode: "cors",
            headers: this.headers.gtfs,
        });

        console.log("AWAIT BLOB " + this.name);
        const blob = await response1.blob();

        console.log("READ & UNZIP ZIP " + this.name);
        const zipFilePath = path.join(
            __dirname,
            "gtfs",
            `${this.name}_${Date.now()}.zip`
        );
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

        const unzipDirPath = path.join(
            __dirname,
            "gtfs",
            `${this.name}_${Date.now()}`
        );
        fs.mkdirSync(unzipDirPath, {
            recursive: true,
        });
        const directory = await unzipper.Open.file(zipFilePath);
        await directory.extract({ path: unzipDirPath });

        new Promise((resolve, reject) => {
            try {
                const thisTables = tables(this.name);
                const createdTables = [];
                for (let i = 0; i < thisTables.length; i++) {
                    const { name, columns } = thisTables[i];
                    const filePath = path.join(unzipDirPath, `${name}.txt`);
                    if (fs.existsSync(filePath)) {
                        const tableName = `${this.name}_${name}`;
                        const columnDef = columns
                            .map((col) => col.join(" "))
                            .join(", ");
                        db.exec(
                            `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDef});`
                        );
                        db.exec(`DELETE FROM ${tableName};`);
                        createdTables.push(`${tableName}`);

                        const insertStatement = db.prepare(
                            `INSERT INTO ${tableName} (${columns
                                .map((col) => `${col[0]}`)
                                .join(", ")}) VALUES (${columns
                                .map(() => `?`)
                                .join(", ")});`
                        );
                        const rows = [];
                        const transaction = db.transaction(() => {
                            rows.forEach((row) =>
                                insertStatement.run(
                                    ...columns.map((col) => row[col[0].trim()])
                                )
                            );
                        });

                        new Promise((resolve, reject) => {
                            fs.createReadStream(filePath)
                                .pipe(
                                    csvParser({
                                        mapHeaders: ({ header }) =>
                                            header.trim(),
                                    })
                                )
                                .on("data", (row) => {
                                    rows.push(row);
                                    if (rows.length >= 500) {
                                        transaction();
                                        rows.length = 0;
                                    }
                                })
                                .on("end", () => {
                                    if (rows.length > 0) {
                                        transaction();
                                    }
                                    resolve();
                                })
                                .on("error", (error) => {
                                    reject(error);
                                });
                        });

                        const indexes = [
                            {
                                table: `${tableName}_agency`,
                                idx: "idx_agency_id",
                                column: "agency_id",
                            },
                            {
                                table: `${tableName}_routes`,
                                idx: "idx_route_id",
                                column: "route_id",
                            },
                            {
                                table: `${tableName}_notes`,
                                idx: "idx_note_id",
                                column: "note_id",
                            },
                            {
                                table: `${tableName}_trips`,
                                idx: "idx_trip_id",
                                column: "trip_id",
                            },
                            {
                                table: `${tableName}_shapes`,
                                idx: "idx_shape_id",
                                column: "shape_id",
                            },
                        ];
                        db.transaction(() => {
                            for (let i = 0; i < indexes.length; i++) {
                                const index = indexes[i];
                                if (createdTables.includes(index.table)) {
                                    db.exec(
                                        `DROP INDEX IF EXISTS "${index.idx}";`
                                    );
                                    db.exec(
                                        `CREATE INDEX IF NOT EXISTS "${index.idx}" ON "${index.table}"("${index.column}");`
                                    );
                                }
                            }
                        })();
                    }
                }
            } catch (error) {
                reject(error);
            }
            resolve();
        }).catch((error) => {
            console.error(error);
        });

        fs.unlinkSync(zipFilePath);
        fs.rmSync(unzipDirPath, { recursive: true, force: true }, (error) => {
            if (error) {
                console.error(error);
            }
        });

        gtfsLastUpdated.lastUpdated[this.name] = lastModified;
        fs.writeFileSync(
            path.join(__dirname, "gtfs", "gtfs.json"),
            JSON.stringify(gtfsLastUpdated, null, 2)
        );
    }

    // fetchGTFSR(this.urls.gtfsrTripUpdates);
    // fetchGTFSR(this.urls.gtfsrVehiclePositions);

    async fetchGTFSR(url) {
        try {
            const response = await fetch(url, {
                method: this.method,
                mode: "cors",
                headers: this.headers.gtfsr,
            });
            if (!response.ok) {
                throw new Error(
                    `HTTP request failed with status ${response.status}` +
                        JSON.stringify(response)
                );
            }
            const buffer = await response.arrayBuffer();
            const decoded = this.lookup.decode(new Uint8Array(buffer));
            return decoded;
        } catch (error) {
            console.error(error);
        }
    }
}

class API {
    constructor({ name, headers, protobuf, protoType, endpoints }) {
        this.name = name || "API" + Math.floor(Math.random() * 1000);
        this.headers = headers || {};
        this.protobuf = protobuf || null;
        this.protoType = protoType || null;

        this.endpoints = [];
        for (let i = 0; i < endpoints.length; i++) {
            if (!endpoints[i].name) endpoints[i].name = this.name;
            if (!endpoints[i].headers) endpoints[i].headers = this.headers;
            if (!endpoints[i].protobuf) endpoints[i].protobuf = this.protobuf;
            if (!endpoints[i].protoType)
                endpoints[i].protoType = this.protoType;
            const endpoint = new Endpoint(endpoints[i]);
            endpoint.init();

            this.endpoints.push(endpoint);
        }
    }
}

const NSW = new API({
    name: "NSW",
    headers: {
        gtfs: {
            accept: "application/octet-stream",
            authorization: `apikey ${NSW_APIKEY}`,
        },
        gtfsr: {
            accept: "application/x-google-protobuf",
            authorization: `apikey ${NSW_APIKEY}`,
        },
    },
    protobuf: path.join(__dirname, "protobuf", "1007_extension.proto"),
    protoType: "transit_realtime.FeedMessage",
    endpoints: [
        {
            endpointName: "sydneytrains",
            urls: {
                gtfsSchedule:
                    "https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains",
                gtfsrTripUpdates:
                    "https://api.transport.nsw.gov.au/v2/gtfs/realtime/sydneytrains",
                gtfsrVehiclePositions:
                    "https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/sydneytrains",
            },
        },
        // {
        //     endpointName: "nswtrains",
        //     urls: {
        //         gtfsSchedule:
        //             "https://api.transport.nsw.gov.au/v1/gtfs/schedule/nswtrains",
        //         gtfsrTripUpdates:
        //             "https://api.transport.nsw.gov.au/v1/gtfs/realtime/nswtrains",
        //         gtfsrVehiclePositions:
        //             "https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/nswtrains",
        //     },
        // },
    ],
});

const app = express();

app.get("/api", (req, res) => {
    return res.sendStatus(200);
});

app.listen(PORT, "127.0.0.1", async () => {
    console.log(`Server is running on port ${PORT}`);
});
