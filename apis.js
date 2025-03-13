const path = require("path");
const { API } = require("./index.js");

// // https://opendata.transport.nsw.gov.au/data/organization/transport-opendata-hub
// const NEW_SOUTH_WALES = new API({
//     name: "NSW",
//     headers: {
//         gtfs: {
//             accept: "application/octet-stream",
//             authorization: `apikey ${process.env.NSW_APIKEY}`,
//         },
//         gtfsr: {
//             accept: "application/x-google-protobuf",
//             authorization: `apikey ${process.env.NSW_APIKEY}`,
//         },
//     },
//     protobuf: path.join(__dirname, "protobuf", "NSW_1007_extension.proto"),
//     protoType: "transit_realtime.FeedMessage",
//     endpoints: [
//         {
//             endpointName: "sydneytrains",
//             urls: {
//                 gtfsSchedule: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains",
//                 gtfsrTripUpdates: "https://api.transport.nsw.gov.au/v2/gtfs/realtime/sydneytrains",
//                 gtfsrVehiclePositions: "https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/sydneytrains",
//             },
//         },
//         {
//             endpointName: "metro",
//             urls: {
//                 gtfsSchedule: "https://api.transport.nsw.gov.au/v2/gtfs/schedule/metro",
//                 gtfsrTripUpdates: "https://api.transport.nsw.gov.au/v2/gtfs/realtime/metro",
//                 gtfsrVehiclePositions: "https://api.transport.nsw.gov.au/v2/gtfs/vehiclepos/metro",
//             },
//         },
//         ...[
//             "buses",
//             "nswtrains",
//             "lightrail/cbdandsoutheast",
//             "lightrail/innerwest",
//             "lightrail/newcastle",
//             "lightrail/parramatta",
//             "ferries/sydneyferries",
//             "regionbuses/centralwestandorana",
//             "regionbuses/centralwestandorana2",
//             "regionbuses/newenglandnorthwest",
//             "regionbuses/northcoast",
//             "regionbuses/northcoast2",
//             "regionbuses/northcoast3",
//             "regionbuses/riverinamurray",
//             "regionbuses/riverinamurray2",
//             "regionbuses/southeasttablelands",
//             "regionbuses/southeasttablelands2",
//             "regionbuses/sydneysurrounds",
//             "regionbuses/newcastlehunter",
//             "regionbuses/farwest",
//         ].map((name) => {
//             {
//                 return {
//                     endpointName: name.replaceAll("/", ""),
//                     urls: {
//                         gtfsSchedule: `https://api.transport.nsw.gov.au/v1/gtfs/schedule/${name}`,
//                         gtfsrTripUpdates: `https://api.transport.nsw.gov.au/v1/gtfs/realtime/${name}`,
//                         gtfsrVehiclePositions: `https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/${name}`,
//                     },
//                 };
//             }
//         }),
//     ],
// })
//     .autoUpdateGTFS(2 * 60 * 60 * 1000)
//     .autoUpdateGTFSR(20 * 1000);

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
