import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBookingRequest, parseCliArgs } from './auto_book.js';
import {
  BookingSubmissionError, ensureAuthenticatedBuskingDetailsPage, getBookingSnapshot,
  launchPersistentBrowser, selectBookingDate, setBookingLocation, waitForBookingControls,
} from './nac_booking_browser.js';
import { loadAllBallotingHistory, loadBallotingSlots, openBallotingModal, readBallotingHistory, selectBallotingSlot, submitBalloting, waitForBallotingDates } from './nac_balloting_browser.js';
import { expandTimeRangeToSlotKeys, normalizeLocationLookupKey, parseTimeRangeArg, resolveLocationRecord, toDateKey } from './nac_common.js';
import { runBookingQueue, stopBookingQueue, summarizeBookingRun, validateBookingPlan } from './nac_booking_queue.js';

export function buildBallotingPlan(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Expected a JSON config object.');
  if (config.ballots && config.bookings) throw new Error('Use either "ballots" or "bookings", not both.');
  const entries = config.ballots ?? config.bookings;
  if (!Array.isArray(entries) || !entries.length) throw new Error('Config requires a non-empty "ballots" (or "bookings") array.');
  if (config.stop_on_failure != null && typeof config.stop_on_failure !== 'boolean') throw new Error('stop_on_failure must be boolean.');
  const requests = entries.flatMap((entry, index) => {
    if (entry?.time && (String(entry.time).split(/[-–—]/).length !== 2 || !parseTimeRangeArg(entry.time))) {
      throw new Error(`Invalid balloting time in entry #${index + 1}.`);
    }
    const request = normalizeBookingRequest(entry, index);
    const date = toDateKey(request.date);
    if (!date) throw new Error(`Invalid balloting date: ${request.date}`);
    return expandTimeRangeToSlotKeys(request.from, request.to).map((key) => {
      const [from, to] = key.split('-');
      return { ...request, label: `${request.label} ${key}`, date, from, to };
    });
  });
  validateBookingPlan(requests);
  return { stopOnFailure: config.stop_on_failure ?? false, requests };
}

export async function runBallotingFlow(page, location, request, control) {
  const form = await openBallotingModal(page);
  await waitForBallotingDates(page);
  const initial = await getBookingSnapshot(page);
  const sameLocation = normalizeLocationLookupKey(initial?.locationText) === normalizeLocationLookupKey(location.name);
  if (!sameLocation) {
    await setBookingLocation(page, { locationId: location.location_id, locationName: location.name });
    await waitForBallotingDates(page);
  }
  const prepared = control.preparedBalloting;
  const reuseSlots = form.reused && prepared?.page === page && sameLocation && initial?.dateKey === request.date &&
    prepared.locationId === location.location_id && prepared.date === request.date;
  await selectBookingDate(page, request.date);
  if (!reuseSlots) await loadBallotingSlots(page, request.from, request.to);
  control.preparedBalloting = { page, locationId: location.location_id, date: request.date };
  await selectBallotingSlot(page, request.from, request.to);
  const snapshot = await getBookingSnapshot(page);
  if (snapshot?.dateKey !== request.date) throw new Error('Balloting date changed during preparation.');
  if (control.stopped) throw new BookingSubmissionError('Queue stopped before balloting submission.', 'not-submitted');
  return submitBalloting(page, {
    locationName: location.name, date: request.date, from: request.from, to: request.to,
  }, { ...control.submissionOptions, logPrefix: request.label, isStopped: () => control.stopped });
}

export async function attemptPriorityBallot(page, request, {
  control, resolve = resolveLocationRecord, ballot = runBallotingFlow,
}) {
  const errors = [];
  for (const entry of request.locationPriority) {
    if (control.stopped) return { request, success: false, outcome: 'not-submitted' };
    let location;
    try {
      location = await resolve(entry);
      const result = await ballot(page, location, request, control);
      if (result.outcome === 'rejected') {
        errors.push({ locationName: location.name, stage: 'submission-rejected', error: result.textSnippet });
        continue;
      }
      if (!result.success || result.outcome !== 'confirmed') throw new BookingSubmissionError('Balloting submission success was not confirmed.');
      return { request, location, success: true, outcome: 'confirmed', pendingVerified: false, timings: result.timings, errors };
    } catch (error) {
      errors.push({ locationName: location?.name, stage: 'balloting-flow', error: error.message, timings: error.timings });
      if (error.stopQueue) {
        const result = { request, location, success: error.outcome === 'confirmed', outcome: error.outcome, stopQueue: true, errors,
          pendingVerified: false,
        };
        stopBookingQueue(control, result);
        return result;
      }
      console.log(`[${request.label}] Preparation failed: ${error.message}. Trying the next location.`);
    }
  }
  return { request, success: false, outcome: 'failed', errors };
}

export async function verifyBallotingRun(page, results, {
  timeoutMs = 60_000,
  refresh = async (page) => {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await waitForBookingControls(page, timeoutMs, { mode: 'balloting' });
  },
  loadAll = loadAllBallotingHistory,
  read = readBallotingHistory,
} = {}) {
  const submitted = results.filter((result) => result.location && (result.success || result.outcome === 'unknown'));
  if (!submitted.length) return { success: true, expected: 0, pending: 0, missing: [], skipped: 'no-submissions' };
  try {
    console.log(`All submission attempts finished. Refreshing history and loading every page before checking ${submitted.length} ballot(s).`);
    await refresh(page);
    const history = await loadAll(page, { timeoutMs });
    if (!history.complete) throw new Error('Balloting history was not fully loaded.');
    const expected = submitted.map((result) => ({
      label: result.request.label, date: result.request.date, from: result.request.from,
      to: result.request.to, locationName: result.location.name,
    }));
    const checks = await read(page, expected);
    if (checks.length !== submitted.length) throw new Error('Balloting history returned an incomplete verification result.');
    checks.forEach((check, index) => {
      submitted[index].pendingVerified = check.pendingVerified;
      if (check.status) submitted[index].status = check.status;
    });
    const missing = checks.filter((check) => !check.pendingVerified);
    return { success: missing.length === 0, expected: checks.length, pending: checks.length - missing.length, missing, pagesLoaded: history.pagesLoaded };
  } catch (error) {
    return { success: false, expected: submitted.length, pending: 0, error: error.message };
  }
}

export async function runBallotingPlan(page, plan, {
  control = {}, resolve = resolveLocationRecord, ballot = runBallotingFlow,
  verify = verifyBallotingRun, verificationOptions,
} = {}) {
  const results = await runBookingQueue({
    requests: plan.requests, pages: [page], stopOnFailure: plan.stopOnFailure, control,
    attempt: (page, request) => attemptPriorityBallot(page, request, { control, resolve, ballot }),
  });
  const verification = await verify(page, results, verificationOptions);
  return { results, verification };
}

function help() {
  console.log(`Usage:
  npm run nac:auto-ballot -- --config=./scrape_nac_scripts/auto_ballot.example.json
  npm run nac:auto-ballot -- --config=./scrape_nac_scripts/auto_book.actual.json --dry-run
  npm run nac:auto-ballot -- --location-name="AMK HUB" --date=2026-11-16 --time=19:00-22:00

Config accepts "ballots" or the existing "bookings" array, stop_on_failure,
date, time (or from/to) and ordered location_priority. Ranges become separate
hourly radio-button submissions. Success popups are dismissed by an outside click.
The slot form stays open; PENDING tiles are checked once after all submissions,
after refreshing history and clicking Load More until the end.
Only one tab is supported. No booking-availability precheck is performed.

--dry-run validates and prints the plan without opening Chrome or using the network.
--login-only reuses/creates the persisted Singpass session without submitting.
--user-data-dir=<path>  --executable-path=<path>  --headless[=true|false]
--keep-open[=true|false] (default true)
--manual-login-timeout-ms=<ms>  --navigation-timeout-ms=<ms>
--confirmation-timeout-ms=<ms>  --submission-timeout-ms=<ms>
Submission waits default to 0 (indefinite); uncertainty stops the queue, with no retry.
Without --dry-run or --login-only, this command SUBMITS REAL BALLOTS.`);
}

export async function main(rawArgs = process.argv.slice(2)) {
  const dryRun = rawArgs.includes('--dry-run');
  const args = parseCliArgs(rawArgs.filter((arg) => arg !== '--dry-run'));
  if (args.help) { help(); return; }
  if (args.concurrency !== 1) throw new Error('Balloting supports --concurrency=1 only.');
  if (dryRun && args.loginOnly) throw new Error('Use --dry-run or --login-only separately.');
  const config = args.loginOnly ? null : args.configFile
    ? JSON.parse(await fs.readFile(args.configFile, 'utf8'))
    : { ballots: [{ date: args.date, from: args.from, to: args.to, location_priority: [{ location_id: args.locationId, location_name: args.locationName }] }] };
  const plan = args.loginOnly ? { requests: [] } : buildBallotingPlan(config);
  if (dryRun) { console.log(JSON.stringify(plan, null, 2)); return plan; }
  await fs.mkdir(args.userDataDir, { recursive: true });
  const browser = await launchPersistentBrowser(args);
  try {
    const page = await ensureAuthenticatedBuskingDetailsPage(browser, { ...args, formMode: 'balloting' });
    if (args.loginOnly) { console.log('Balloting login-only mode complete.'); return; }
    const control = {
      stopped: false,
      submissionOptions: { confirmationTimeoutMs: args.confirmationTimeoutMs, resultTimeoutMs: args.submissionTimeoutMs },
      onStop: (reason) => console.error(`Balloting queue stopped by "${reason.label}" (${reason.outcome}): ${reason.error}`),
    };
    const cache = new Map();
    const resolve = (entry) => {
      const key = JSON.stringify(entry);
      if (!cache.has(key)) cache.set(key, resolveLocationRecord(entry));
      return cache.get(key);
    };
    const started = Date.now();
    const { results, verification } = await runBallotingPlan(page, plan, {
      control, resolve, verificationOptions: { timeoutMs: args.navigationTimeoutMs },
    });
    const summary = summarizeBookingRun(results, { durationMs: Date.now() - started, workerErrors: [], stopReason: control.stopReason });
    summary.verification = verification;
    summary.counts.pendingVerified = results.filter((result) => result.pendingVerified).length;
    console.log(JSON.stringify(summary, null, 2));
    if (!verification.success || results.some((result) => !result.success || result.stopQueue)) {
      throw new Error('Balloting run needs review. Inspect per-slot results and NAC history before rerunning; do not resubmit confirmed or unknown ballots.');
    }
    return summary;
  } finally {
    if (args.keepOpen) await browser.disconnect();
    else await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
