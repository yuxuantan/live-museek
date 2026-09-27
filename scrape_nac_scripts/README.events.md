# Scheduled event scraping

Run the browser fixtures and database-write guard tests with `npm run test:events`.
The browser tests use intercepted requests and a local streaming HTTP fixture;
they do not contact NAC or Supabase.

To check the location previously associated with heap failures without changing the database:

```sh
node scrape_nac_scripts/scrape_perf.js --dry-run --location-id=50781054-7da9-427a-b76a-090113f0e463
```

The scraper validates the directory and each location page after `domcontentloaded`.
Navigation gets at most three attempts per tab. Each location gets at most three
fresh-tab attempts, sharing one five-minute budget across attempts and backoff.
Each attempt permits at most 250 pagination requests and 10,000 event cards. Pagination waits up
to 30 seconds for the matching response headers, 60 seconds for its body download
to finish, and then 15 seconds for the updated DOM,
within the remaining location budget. It rejects stalled/repeated results,
HTTP errors, unexpected page content, and malformed event rows.

Each location uses a separate tab, closed in `finally`. Images, fonts, and media
are blocked. Only profile links, date text, and time text cross into Node; full
page HTML and Cheerio trees are no longer allocated by this scraper. Progress
logs include location, pagination count, event count, and Node heap usage.
Failures identify response, download, or rendering stages. Request failures and
uncaught page errors include location/attempt context; intentionally blocked
media requests are excluded from failure logs. Incomplete attempts are discarded.

All selected locations must finish before database writes begin. An empty
overall result also aborts the refresh. Dry runs and filtered runs suppress
writes, unless the existing `--allow-partial-write` option explicitly enables a
filtered write. Completed historical performances remain excluded from deletion.
The existing database delete and insert remain separate operations; these
scraping guards do not make database publication transactional.

The Actions workflow runs these tests before scraping, uses `npm ci`, prevents
overlapping scraper workflow runs, and limits the entire job to two hours.
