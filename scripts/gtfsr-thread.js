const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");

const { apiName, name, version, TripUpdates, VehiclePositions } = workerData;

const TripUpdateResponse = TripUpdates.response || TripUpdates.entity || [];
const TripUpdateHeaders = TripUpdates.header;
const VehiclePositionResponse = VehiclePositions.response || VehiclePositions.entity || [];
const VehiclePositionHeaders = VehiclePositions.header;

if (!TripUpdateHeaders || !VehiclePositionHeaders) {
    throw new Error("Invalid GTFSR data provided");
}

for (let i = 0; i < TripUpdateResponse.length; i++) {
    const Vehicle = {};

    const FeedEntity = TripUpdateResponse[i];
    const TripUpdate = FeedEntity.tripUpdate;
    TripUpdate.feedEntityId = FeedEntity.id;

    let VehiclePosition = null;
    for (let j = 0; j < VehiclePositionResponse.length; j++) {
        if (VehiclePositionResponse[j]?.vehicle?.trip?.tripId === TripUpdate?.trip?.tripId) {
            VehiclePosition = VehiclePositionResponse[j];
            break;
        }
    }

    // VehiclePosition may return as null (no vehicle pos found)

    // console.log(TripUpdate, VehiclePosition);

    if (VehiclePosition === null) {
        // console.log(TripUpdate);
    }

    VehiclePositionResponse[i] = VehiclePosition;
}

// console.log(TripUpdateResponse.map((x) => x?.tripUpdate?.trip?.tripId));
// parentPort.postMessage(VehiclePositionResponse);
parentPort.postMessage({});
