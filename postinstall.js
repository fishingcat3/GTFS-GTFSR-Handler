const fs = require("node:fs");
const path = require("node:path");

fs.writeFileSync(path.join(__dirname, ".env"), "");

fs.mkdirSync(path.join(__dirname, "gtfs"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "gtfs", "gtfs.db"), "");
fs.writeFileSync(path.join(__dirname, "gtfs", "gtfs.json"), "{}");
fs.writeFileSync(path.join(__dirname, "gtfs", "gtfs.jsonr"), "{}");
