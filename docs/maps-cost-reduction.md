# Google Maps cost reduction

LiveMuseek retains Google Maps and Google Geocoding. The fixes target redundant requests; no provider migration, database migration, or coordinate backfill is required.

## What changed

1. The scheduled directory scraper checks saved location IDs first. If there are no new locations, it exits without geocoding. If one location is new, it looks up only that location, not the whole directory.
2. Each new location and its coordinates are saved immediately, before image downloads and before processing the next location. If later work fails, a retry skips the rows already saved. Existing rows and their performance relationships are never deleted or replaced by this scraper.
3. Location refreshes reuse valid saved coordinates when the address is unchanged (ignoring casing and extra whitespace). Only new addresses, changed addresses, or missing/invalid coordinates need a lookup. Schedule changes alone do not trigger geocoding. Simultaneous identical lookups share one request within the same server process.
4. The events page starts with an event/location list. Google Maps loads only after **Show map** is clicked. Hiding and reopening it retains the same map instance; switching filters updates markers without recreating the map. Navigating away and returning can still create another map load.
5. Get directions links open Google Maps without making a routing API call.

Google errors do not erase valid coordinates for an unchanged address. A changed address whose lookup fails has no coordinates, so an old pin is not incorrectly displayed. Locations without coordinates remain available in the list and can be retried through their location refresh control. There is no automatic full-directory re-geocoding job.

## Configuration

- Keep `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for the browser map.
- Set `GOOGLE_MAPS_API_KEY` for server geocoding and as a GitHub Actions repository secret. The scheduled workflow passes this secret to the scraper. Prefer a separate server key restricted to Geocoding API. The local/server resolver can also use the existing public-key variable if a server key is absent, but a browser-restricted key may be rejected by the geocoding service.
- The previously hardcoded key has not been restored. Missing or rejected credentials leave new locations without coordinates; schedule/list functionality continues.
- No changes to production credentials, billing, or deployment are made by these source edits. Deploy the app and workflow changes for them to take effect.

The OneMap adapter, Leaflet dependency, OneMap backfill command, and pending schema migration have been removed. Existing lat/lng values are used directly. If the earlier migration was applied independently, its extra columns are unused and do not need to be dropped for this version to work.

## Expected request pattern

| Operation | Google geocoding calls |
| --- | --- |
| Scheduled scan, no new locations | 0 |
| Scheduled scan, one new location | 1 lookup attempt |
| Refresh unchanged address with valid coordinates | 0 |
| Refresh changed address or missing coordinates | 1 lookup attempt |
| Retry after a later location/image failure | No repeat lookup for locations already saved |

The SDK can retry eligible transport/server failures. A failure before a successful database write can still cause a lookup on the next attempt. This change does not claim exactly-once requests across processes or network failures.

## Verification and billing

Run `npm run test:maps` for mocked-network regression tests covering lookup reuse, changed/missing coordinates, duplicate in-flight requests, errors, directory growth, per-location progress, and historical booking preservation. Run `npm run build` for compilation and lint/type checks. Browser checks should confirm that list browsing makes no Maps requests, the first Show map initializes one map, and filter/hide/show changes do not create another instance.

The workflow is scheduled every 30 minutes, but a no-change scan makes no geocoding requests. Compare Geocoding and Dynamic Maps usage after deployment to confirm the reduction. Actual savings depend on directory changes, refresh activity, and map visits.

Coordinate reuse is an application optimization, not a grant of indefinite storage rights. Google's coordinate-caching terms still apply; this patch preserves the existing database and does not introduce a new retention policy.

References: [Google Maps billing](https://developers.google.com/maps/documentation/javascript/usage-and-billing), [Google Maps service terms, Geocoding API section](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Google Maps directions URLs](https://developers.google.com/maps/documentation/urls/get-started).
