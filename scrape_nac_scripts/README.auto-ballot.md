# NAC auto-balloting

Preview a config without opening Chrome, contacting NAC, or submitting anything:

```bash
npm run nac:auto-ballot -- --config=./scrape_nac_scripts/auto_ballot.example.json --dry-run
```

Submit the configured ballots:

```bash
npm run nac:auto-ballot -- --config=./scrape_nac_scripts/auto_ballot.example.json
```

**Without `--dry-run` or `--login-only`, this command submits real ballots.**
It uses the booking bot's persisted Singpass session and one tab. Close the
booking bot before starting balloting with the same browser profile.

The input has the same fields as `auto_book.actual.json`: `stop_on_failure`,
`label`, `date`, `time` (or `from`/`to`) and ordered `location_priority` entries
with `location_name`/`location_id`. Use a top-level `ballots` array, or keep
the existing `bookings` key to reuse a booking config unchanged:

```bash
npm run nac:auto-ballot -- --config=./scrape_nac_scripts/auto_book.actual.json --dry-run
```

The command determines the operation; `bookings` in a balloting config still
means submit ballots. Dates accept `YYYY-MM-DD` or `DD/MM/YYYY`. Each range
must use whole hours. `19:00-22:00` produces three separate submissions,
selecting one radio button each: `19:00-20:00`, `20:00-21:00`, `21:00-22:00`.
Duplicate or overlapping requests are rejected before Chrome opens.

For each hour, locations are tried in priority order. The bot opens **Submit
Balloting**, sets the location and date, loads the timeslot table and selects
exactly one enabled radio button. Success requires a fresh explicit ballot
success popup. The bot dismisses it by clicking the space outside the popup;
it never clicks its success OK button. The slot form stays open, and the loaded
table is reused for the next hour at the same date and location.

An unavailable slot or preparation error allows the next location to be tried.
A definite, dismissed submission rejection also allows the next location.
Successful submission ends that hour's attempt; there is no PENDING-tile check
between submissions. The bot still waits for each submission's success or
rejection popup before sending the next ballot, so an uncertain submission is
never retried or overlapped with another.

After all submission attempts finish, the bot performs **one final history
check**. It refreshes the details page once to show the newly submitted ballots,
then clicks **Load More until the end**, waiting for each history page to load.
Only after history is fully expanded does it read the tiles once and compare
all submitted slots by location, date and time against their **PENDING** status.
It does not stop pagination early when the requested slots first appear.

The tile layout in the supplied screenshots omits the year. The bot matches
weekday/day/month against the submitted full date and checks the year when a
tile displays it. Final verification confirms matching pending applications;
it does not prove they are new relative to earlier runs or awarded bookings.

Submission waits are indefinite by default, with progress messages. It never
retries Submit. Unknown outcomes and page/session loss stop remaining work,
even if `stop_on_failure` is false. A success popup that cannot be dismissed
keeps the queue waiting; it can be dismissed manually. Finite waits are optional:

```bash
npm run nac:auto-ballot -- --config=./scrape_nac_scripts/auto_ballot.example.json \
  --confirmation-timeout-ms=30000 --submission-timeout-ms=120000
```

The submission limit applies to the result after Yes. The navigation timeout
bounds each final history-loading step. If Load More stalls, the bot reports
verification as incomplete and does not treat partially loaded history as a
complete check. Missing or non-PENDING slots are listed in `verification.missing`;
failed history loading is reported in `verification.error`. Neither causes
submission retries. Inspect NAC history before rerunning, because the bot does
not deduplicate across runs.

The JSON summary separates confirmed submissions from final `pendingVerified`
results and includes the final verification totals, failures, skipped work and
first stop reason. Submission outcomes remain recorded even if final history
verification fails. When a run stops early, it checks the submissions already
attempted if the page is still available. `stop_on_failure` controls fully failed
hours; submission uncertainty always stops new work. `--keep-open=false` closes
Chrome after the run and its final verification finish.
Run `npm run nac:auto-ballot -- --help` for single-request and browser options.

Local checks (disposable browser fixtures; no saved session or live submissions):

```bash
npm run test:balloting
npm run test:balloting:browser
npm run test:booking
npm run test:booking:browser
```

NAC's public balloting JavaScript was inspected for selectors, row markup,
date-loading behavior and success handling. The authenticated balloting UI and
real submissions have not been exercised. Unrecognized feedback waits instead
of being guessed successful.
