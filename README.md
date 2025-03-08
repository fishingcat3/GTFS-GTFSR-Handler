# GTFS-Handler

**Work in Progress**

-   Service alerts not implemented yet
-   Actually saving the GTFSR data so it can be monitored isn't implemented yet

1. Run `npm install`
2. The `.env` file requires the following variables:
    - PORT (not used yet)
    - NSW_APIKEY ([Transport Open Data Hub User Guide](https://opendata.transport.nsw.gov.au/developers/userguide), API key required for NSW
      API)

You can choose to enable different APIs by commenting or removing the comments at the bottom of `./index.js`
