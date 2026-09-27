# Scheduled event scraping

Run the browser fixtures and database-write guard tests with `npm run test:events`.
The browser tests use intercepted requests and a local streaming HTTP fixture;
they do not contact NAC or Supabase.

To check the location previously associated with heap failures without changing the database:

```sh
node scrape_nac_scripts/scrape_perf.js --dry-run --location-id=50781054-7da9-427a-b76a-090113f0e463
```

The scraper validates the directory and each location page after `domcontentloaded`.
Navigation gets at most three attempts per tab, and at most three fresh tabs per
location for page-loading failures. All work shares a five-minute location budget.

Pagination requests NAC's same-origin `/events/more?skip=...&take=...` endpoint
using the browser session. A stalled or failed batch is aborted and retried at the
same cursor, up to three attempts, with backoff. Previously validated batches stay
in memory; an exhausted batch never triggers a restart from the first page.
Only complete, validated JSON-encoded HTML fragments advance the cursor. The
terminal response must be a JSON-encoded empty string. Error pages, malformed
JSON, repeated batches, and invalid events abort the refresh.

Pagination deliberately omits `X-Requested-With: XMLHttpRequest`: NAC includes
base64 profile photos when that header is present. A normal GET returns the same
event fields with image URLs, avoiding multi-megabyte photo payloads.

Each request has a 30-second response-header timeout and 60-second body timeout,
clipped to the remaining location budget. Responses are capped at 2 MiB, with at
most 250 pagination batches per tab (up to three request attempts each) and
10,000 events per location. Fragments are
parsed in an inert template inside Chromium, so their images and scripts do not
load. Only event fields are returned to Node, and the page DOM does not grow.

Tabs close in `finally`. Images, fonts, and media are blocked. Progress logs show
location, page count, event count, and Node heap usage. Failure logs show cursor,
attempt, HTTP status, bytes received, and whether the failure occurred while
receiving headers, downloading, or parsing. The final error preserves the last
failure as its cause when the budget prevents another retry.

All selected locations must finish before database writes begin. An empty
overall result also aborts the refresh. Dry runs and filtered runs suppress
writes, unless the existing `--allow-partial-write` option explicitly enables a
filtered write. Completed historical performances remain excluded from deletion.
The existing database delete and insert remain separate operations; these
scraping guards do not make database publication transactional.

The Actions workflow runs these tests before scraping, uses `npm ci`, prevents
overlapping scraper workflow runs, and limits the entire job to two hours.
