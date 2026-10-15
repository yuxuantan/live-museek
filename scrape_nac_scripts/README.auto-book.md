# NAC auto-booking

Run the configured bookings in one tab using the persisted NAC login:

```bash
npm run nac:auto-book -- --config=./scrape_nac_scripts/auto_book.actual.json
```

This command **submits real bookings**. One worker is the default because
two-tab operation has produced repeated UI timeouts in live use. Availability
checks still run in parallel. Explicit `--concurrency=1` also selects this mode.
`--concurrency=2` is retained as an experimental opt-in; remove that option from
existing commands to use the default. Accepted worker counts are 1 and 2.
Each tab processes one request at a time, taking the next
request from the configuration when it finishes. Completion order can differ
from configuration order; the final results retain configuration order.

An existing authenticated page is reused at startup. The script waits for its
booking controls to become ready instead of navigating to the same page again.
The landing page after Singpass login is reused in the same way.

With the experimental two-worker option, after login the first tab starts booking while the second
tab opens and loads. Each tab takes work as soon as it is ready; there is no
wait for all tabs to load. If the additional tab cannot load, the ready tab
continues processing the queue and the final `workerErrors` summary records
the startup failure. A tab that finishes loading after the queue has stopped
does not start a booking.

The script rejects duplicate or overlapping date/time requests before launching
Chrome, including overlaps at different locations. Adjacent time ranges are
allowed. Each request's location priorities remain ordered: a lower priority
cannot win simply because its availability check finished first.

Up to four availability checks run together across the workers, with a
15-second timeout covering the response body. Location resolution is cached
within the run. Availability is checked again through the booking interface
before selecting slots; a precheck does not reserve them.

## Confirmation and stopping

Success requires a new or changed visible notification explicitly stating that
the booking succeeded, such as “Your booking has been created successfully.”
Old page text, generic “Success” messages, HTTP success alone, and a closed
booking modal are not confirmation. The observer is installed before Submit
and waits for either a confirmation prompt or the result, so immediate success
does not incur a five-second wait for a nonexistent prompt.

An explicit failure such as “Event creation not successful” is acknowledged
using that popup's OK button. After the popup disappears, the tab reuses the
booking form and tries the next location in priority
order. If no locations remain, the request is recorded as failed and the next
configured date/time is attempted when `stop_on_failure` is false. A failed
candidate is not automatically resubmitted at the same location.

Submission waits have no time limit by default. After 15 seconds, and every
15 seconds thereafter, the script reports the pending stage and elapsed time.
A slow response, failed network request, or unrecognized notification leaves the
observer running and the remaining bookings queued. It never clicks Submit again.
Late explicit success resumes the queue after popup cleanup; late explicit
rejection allows the next candidate to be tried.

The confirmation prompt and final result have independent optional limits:

```bash
npm run nac:auto-book -- --config=./scrape_nac_scripts/auto_book.actual.json \
  --confirmation-timeout-ms=30000 --submission-timeout-ms=120000
```

`--confirmation-timeout-ms` limits the wait after Submit for either the optional
Yes prompt or a direct result. `--submission-timeout-ms` starts a new result wait
after clicking Yes. Both default to `0`, meaning keep waiting; they are separate
from navigation and availability timeouts. Setting a finite limit opts into
stopping with an unknown outcome if that phase expires. The normal command above
without these options keeps pending bookings queued indefinitely.

Page closure, navigation, browser disconnection, a page crash, loss of the feedback
observer, or a booking-page request returning HTTP 401/403 ends observation and
stops new work with an unknown outcome. A second submission already in flight is
allowed to finish and report its outcome. Inspect the per-booking results and NAC
booking history before rerunning; the script does not deduplicate bookings across
separate runs.

After success, the script clicks the SweetAlert backdrop itself and waits for
the popup and backdrop to disappear. It does not click SweetAlert's success OK
button: NAC's handler for that button reloads the page. For other popup types,
it uses an outside click or scoped OK/Close. The form can stay open:
the next request explicitly sets its location and date, reloads availability,
and selects only its requested time range, unchecking old slots. Neither
success nor rejection triggers a page reload or full form reset.

Popup dismissal has no timeout by default. If confirmed feedback stays open,
the script prints a waiting message after five seconds and keeps the remaining
requests queued. You can dismiss the popup manually; the queue resumes when
it closes. The confirmed booking is never resubmitted. Closing the browser or
otherwise losing the page can still end the run, while preserving the confirmed
outcome. Do not rebook confirmed requests.
`unknown` means the booking may have succeeded. `not-submitted` and `not-started`
identify work stopped before submission or before assignment respectively.

`stop_on_failure` still controls failures during preparation or availability
checking. Loss of outcome observation or an explicitly configured submission
timeout stops the queue regardless of this setting; a pending result alone keeps
it waiting. Failures produce a nonzero exit code after the per-booking summary.

When the queue stops, the console prints `Queue stopped by "..."` with the
original cause immediately. The final `stopReason` preserves that first cause,
even if another worker is cancelled later. The summary counts confirmed,
failed, and skipped requests separately; unstarted bookings appear under
`skipped`, without a repeated error for each one. A skipped request does not
mean NAC rejected it. To diagnose a stopped run, inspect `stopReason` and the
attempted booking in `results`.

The logs identify Submit and Yes clicks, explicit success/rejection detection,
and popup cleanup separately. Submission results include `timings` with millisecond
offsets from submission observation, popup cleanup duration, total submission-flow
duration, and observed request timings. Timings are also retained on submission
errors and rejected candidates.

For same-origin `/Busking/` POST and other mutating fetch/XHR requests, logs report
request start, response headers/status, body completion, and network failure.
Paths exclude query strings, and no request/response bodies are logged. These
are booking-page network observations, not proof that a booking succeeded.
They help distinguish network waiting from time spent rendering feedback or
clearing a popup; they cannot by themselves establish server load. Observation
ends when that submission flow finishes, so a still-pending response may lack
a body-completion timestamp.

Preparation, per-booking, and total queue durations are also printed.
The remaining login polling is separate from
booking readiness; booking actions use interface conditions instead of fixed
pauses. UI conditions use timer-based polling rather than animation frames.
Date-picker opening, date-field updates, and popup-dismissal failures are
labelled separately so a timeout identifies the operation that failed.

## Validation

```bash
npm run test:booking
npm run test:booking:browser
```

The browser suite launches disposable local Chrome pages and blocks their
network requests. It does not use the saved NAC session or make bookings.
It covers success arriving after the former 15-second deadline, delayed rejection,
independent prompt/result deadlines, page loss, local HTTP response timing,
immediate/optional confirmation, stale and negative feedback, cleanup failure,
stopping, and independent outcomes in two tabs. HTTP timing tests use only a local
fixture server; all other network requests are blocked. Unit tests
cover queue concurrency, overlap rejection, priorities, and submission failures.

NAC's live success-message wording and simultaneous submissions on the same
account have not been exercised by these tests. Unrecognized feedback remains
pending by default; use one worker if NAC does not support simultaneous account
requests. Actual speedup depends on NAC response times.
