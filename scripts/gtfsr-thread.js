const path = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");

const { TripUpdates, VehiclePositions } = workerData;

const TripUpdateResponse = TripUpdates.response;
const TripUpdateHeaders = TripUpdates.header;
const VehiclePositionResponse = VehiclePositions.response;
const VehiclePositionHeaders = VehiclePositions.header;

for (let i = 0; i < TripUpdateResponse.length; i++) {
    const Vehicle = {};

    const FeedEntity = TripUpdateResponse[i];
    const TripUpdate = FeedEntity.tripUpdate;
    TripUpdate.feedEntityId = FeedEntity.id;

    let VehiclePosition = null;
    for (let j = 0; j < VehiclePositionResponse.length; j++) {
        if (VehiclePositionResponse[j] === TripUpdate.trip.tripId) {
            VehiclePosition = VehiclePositionResponse[j];
            break;
        }
    }

    // VehiclePosition may return as null (no vehicle pos found)

    // console.log(TripUpdate, VehiclePosition);

    VehiclePositionResponse[i] = VehiclePosition;
}

parentPort.postMessage({});
