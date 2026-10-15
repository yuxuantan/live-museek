import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BookingSubmissionError,
  DEFAULT_MANUAL_LOGIN_TIMEOUT_MS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  DEFAULT_USER_DATA_DIR,
  ensureAuthenticatedBuskingDetailsPage,
  extractRenderedSlotRows,
  getBookingSnapshot,
  installNacPageHelpers,
  launchPersistentBrowser,
  loadSlotsForSelectedDate,
  openBookingModal,
  selectBookingDate,
  selectBookingTimeRange,
  setBookingLocation,
  submitBooking,
  waitForBookingControls,
} from './nac_booking_browser.js';
import {
  BUSKING_DETAILS_URL,
  formatDateForNac,
  normalizeText,
  parseTimeRangeArg,
  resolveLocationRecord,
} from './nac_common.js';
import {
  evaluateAvailabilityForRange,
  fetchLocationAvailability,
} from './nac_availability_client.js';

import { createLimiter, runBookingQueue, stopBookingQueue, summarizeBookingRun, validateBookingPlan } from './nac_booking_queue.js';

function parseBooleanFlag(rawArg) {
  const [, rawValue = 'true'] = rawArg.split('=');
  return !['false', '0', 'no'].includes(String(rawValue).trim().toLowerCase());
}

export function parseCliArgs(argv) {
  const args = {
    configFile: '',
    date: '',
    from: '',
    to: '',
    locationId: '',
    locationName: '',
    headless: false,
    concurrency: 1,
    keepOpen: true,
    keepOpenExplicitlySet: false,
    loginOnly: false,
    manualLoginTimeoutMs: DEFAULT_MANUAL_LOGIN_TIMEOUT_MS,
    navigationTimeoutMs: DEFAULT_NAVIGATION_TIMEOUT_MS,
    confirmationTimeoutMs: 0,
    submissionTimeoutMs: 0,
    userDataDir: DEFAULT_USER_DATA_DIR,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || '',
    help: false,
  };

  for (const rawArg of argv) {
    if (rawArg.startsWith('--confirmation-timeout-ms=') || rawArg.startsWith('--submission-timeout-ms=')) {
      const flag = rawArg.slice(0, rawArg.indexOf('='));
      const rawValue = rawArg.slice(flag.length + 1);
      const value = Number(rawValue);
      if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(value)) {
        throw new Error(`${flag} must be a non-negative integer; 0 waits indefinitely.`);
      }
      args[flag === '--confirmation-timeout-ms' ? 'confirmationTimeoutMs' : 'submissionTimeoutMs'] = value;
      continue;
    }
    if (rawArg === '--help' || rawArg === '-h') {
      args.help = true;
      continue;
    }

    if (rawArg === '--login-only') {
      args.loginOnly = true;
      continue;
    }

    if (rawArg.startsWith('--concurrency=')) {
      const value = rawArg.substring('--concurrency='.length);
      if (!['1', '2'].includes(value)) throw new Error('--concurrency must be 1 or 2.');
      args.concurrency = Number(value);
      continue;
    }

    if (rawArg.startsWith('--config=')) {
      const value = rawArg.substring('--config='.length).trim();
      if (value) {
        args.configFile = path.resolve(value);
      }
      continue;
    }

    if (rawArg === '--keep-open' || rawArg.startsWith('--keep-open=')) {
      args.keepOpen = parseBooleanFlag(rawArg);
      args.keepOpenExplicitlySet = true;
      continue;
    }

    if (rawArg === '--headless' || rawArg.startsWith('--headless=')) {
      args.headless = parseBooleanFlag(rawArg);
      continue;
    }

    if (rawArg.startsWith('--date=')) {
      args.date = rawArg.substring('--date='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--time=')) {
      const timeRange = parseTimeRangeArg(rawArg.substring('--time='.length));
      if (!timeRange) {
        throw new Error(`Invalid --time value: ${rawArg.substring('--time='.length)}`);
      }
      args.from = timeRange.from;
      args.to = timeRange.to;
      continue;
    }

    if (rawArg.startsWith('--from=')) {
      args.from = rawArg.substring('--from='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--to=')) {
      args.to = rawArg.substring('--to='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--location-id=')) {
      args.locationId = rawArg.substring('--location-id='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--location-name=')) {
      args.locationName = rawArg.substring('--location-name='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--manual-login-timeout-ms=')) {
      const value = Number.parseInt(rawArg.substring('--manual-login-timeout-ms='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        args.manualLoginTimeoutMs = value;
      }
      continue;
    }

    if (rawArg.startsWith('--navigation-timeout-ms=')) {
      const value = Number.parseInt(rawArg.substring('--navigation-timeout-ms='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        args.navigationTimeoutMs = value;
      }
      continue;
    }

    if (rawArg.startsWith('--user-data-dir=')) {
      const value = rawArg.substring('--user-data-dir='.length).trim();
      if (value) {
        args.userDataDir = path.resolve(value);
      }
      continue;
    }

    if (rawArg.startsWith('--executable-path=')) {
      args.executablePath = rawArg.substring('--executable-path='.length).trim();
      continue;
    }

    throw new Error(`Unsupported argument: ${rawArg}`);
  }

  if (args.loginOnly && !args.keepOpenExplicitlySet) {
    args.keepOpen = true;
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run nac:auto-book -- --location-name="SCAPE" --date=29/03/2026 --time=10:00-12:00
  npm run nac:auto-book -- --config=./scrape_nac_scripts/auto_book.example.json

Config mode:
  --config=<path>
      JSON file containing multiple booking requests. Each request can define
      its own time range and ordered location priority list.

Required:
  --date=<DD/MM/YYYY|YYYY-MM-DD>
  --time=<HH:MM-HH:MM>
    or:
  --from=<HH:MM> --to=<HH:MM>

Location:
  --location-id=<uuid>
    or
  --location-name=<name>

Session / browser options:
  --concurrency=<1|2>
      Number of booking tabs sharing one login. Defaults to 1.
      Two-tab booking is experimental; use --concurrency=2 only to opt in.
      Overlapping requests are rejected before browser startup.

  --login-only
      Validate or create the NAC session, then stop before booking.

  --user-data-dir=<path>
      Browser profile directory used to persist NAC cookies/session.
      Default: ${DEFAULT_USER_DATA_DIR}

  --executable-path=<path>
      Optional Chrome/Chromium binary.

  --headless[=true|false]
      Defaults to false. Headless mode only works when a reusable NAC session
      already exists in the saved browser profile.

  --keep-open
      Leave the browser window open after the script finishes.
      Defaults to true unless --keep-open=false is passed.

  --manual-login-timeout-ms=<ms>
  --navigation-timeout-ms=<ms>

  --confirmation-timeout-ms=<ms>
      Maximum wait after Submit for a confirmation prompt or direct result.
      Default: 0 (keep waiting, with progress logs every 15 seconds).

  --submission-timeout-ms=<ms>
      Separate maximum result wait after clicking Yes. Default: 0 (keep waiting).
      A finite timeout leaves the outcome unknown and stops the queue for review.
`.trim());
}

function validateArgs(args) {
  if (args.loginOnly) {
    return;
  }

  if (args.configFile) {
    return;
  }

  if (!args.date) {
    throw new Error('Missing required --date argument.');
  }

  if (!args.from || !args.to) {
    throw new Error('Missing required time range. Use --time or both --from and --to.');
  }

  if (!args.locationId && !args.locationName) {
    throw new Error('A location must be provided with --location-id or --location-name.');
  }
}

async function ensureDirectoryExists(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function loadBookingConfig(configFile) {
  const raw = await fs.readFile(configFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid booking config in ${configFile}. Expected a JSON object.`);
  }

  const bookings = Array.isArray(parsed.bookings) ? parsed.bookings : [];
  if (bookings.length === 0) {
    throw new Error(`Invalid booking config in ${configFile}. "bookings" must be a non-empty array.`);
  }

  return {
    stopOnFailure: Boolean(parsed.stop_on_failure),
    bookings,
  };
}

function normalizeLocationPriorityEntry(entry) {
  if (typeof entry === 'string' && entry.trim()) {
    return {
      locationId: '',
      locationName: entry.trim(),
    };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const locationId = String(entry.location_id ?? entry.locationId ?? '').trim();
  const locationName = String(entry.location_name ?? entry.locationName ?? '').trim();
  if (!locationId && !locationName) {
    return null;
  }

  return {
    locationId,
    locationName,
  };
}

export function normalizeBookingRequest(rawRequest, index) {
  if (!rawRequest || typeof rawRequest !== 'object') {
    throw new Error(`Invalid booking entry at index ${index}. Expected an object.`);
  }

  const timeRange = rawRequest.time ? parseTimeRangeArg(rawRequest.time) : null;
  const from = timeRange?.from ?? rawRequest.from ?? '';
  const to = timeRange?.to ?? rawRequest.to ?? '';
  const locationPriority = Array.isArray(rawRequest.location_priority ?? rawRequest.locationPriority)
    ? (rawRequest.location_priority ?? rawRequest.locationPriority)
        .map(normalizeLocationPriorityEntry)
        .filter(Boolean)
    : [];

  if (!rawRequest.date) {
    throw new Error(`Booking entry #${index + 1} is missing "date".`);
  }

  if (!from || !to) {
    throw new Error(`Booking entry #${index + 1} is missing a valid time range.`);
  }

  if (locationPriority.length === 0) {
    throw new Error(`Booking entry #${index + 1} must define a non-empty location_priority array.`);
  }

  return {
    label: String(rawRequest.label ?? rawRequest.name ?? `booking-${index + 1}`),
    date: String(rawRequest.date),
    from: String(from),
    to: String(to),
    locationPriority,
  };
}

function buildSingleBookingRequest(args) {
  return {
    label: 'single-booking',
    date: args.date,
    from: args.from,
    to: args.to,
    locationPriority: [
      {
        locationId: args.locationId,
        locationName: args.locationName,
      },
    ],
  };
}

async function precheckAvailability(location, request) {
  const availability = await fetchLocationAvailability(location.location_id, request.date);
  const evaluation = evaluateAvailabilityForRange(availability.rows, request.from, request.to);

  if (!evaluation.allAvailable) {
    throw new Error(
      `Requested booking range is not fully available for ${location.name} on ${formatDateForNac(request.date)}. ` +
        `missing=${evaluation.missingSlotKeys.join(', ') || 'none'} unavailable=${evaluation.unavailableRows.map((row) => row.key).join(', ') || 'none'}`
    );
  }

  console.log(
    `Precheck passed for ${location.name} on ${formatDateForNac(request.date)}: ${evaluation.targetSlotKeys.join(', ')}`
  );
}

async function runBookingFlow(page, location, request, control) {
  const started = Date.now();
  await installNacPageHelpers(page);
  await openBookingModal(page);

  const initialSnapshot = await getBookingSnapshot(page);
  if (!initialSnapshot?.found) {
    throw new Error('Booking modal opened, but its fields could not be read.');
  }

  console.log(`[${request.label}] Initial modal location: ${initialSnapshot.locationText || '(unknown)'}`);
  await setBookingLocation(page, {
    locationId: location.location_id,
    locationName: location.name,
  });

  const locationSnapshot = await getBookingSnapshot(page);
  console.log(`[${request.label}] Selected booking location: ${locationSnapshot?.locationText || location.name}`);

  await selectBookingDate(page, request.date);
  const dateSnapshot = await getBookingSnapshot(page);
  console.log(`[${request.label}] Selected booking date: ${dateSnapshot?.dateValue || request.date}`);

  await loadSlotsForSelectedDate(page, request.from, request.to);
  const renderedRows = await extractRenderedSlotRows(page);
  console.table(
    renderedRows.map((row) => ({
      Slot: row.slot,
      From: row.from,
      To: row.to,
      Selectable: row.selectable,
      Status: row.status || '',
    }))
  );

  await selectBookingTimeRange(page, request.from, request.to);
  console.log(`[${request.label}] Selected booking time range: ${normalizeText(request.from)}-${normalizeText(request.to)}`);

  console.log(`[${request.label}] Prepared booking in ${Date.now() - started}ms.`);
  if (control.stopped) throw new BookingSubmissionError('Queue stopped before submission.', 'not-submitted');
  const submitResult = await submitBooking(page, {
    ...control.submissionOptions,
    logPrefix: `[${request.label} ${request.date}]`,
    isStopped: () => control.stopped,
  });
  if (submitResult.outcome === 'rejected') {
    return submitResult;
  }
  if (!submitResult.success) {
    throw new BookingSubmissionError(
      `Booking submit did not confirm success. Modal still open=${submitResult.modalStillOpen}. Page text: ${submitResult.textSnippet}`
    );
  }
  console.log(`[${request.label}] Confirmed booking: feedback after ${submitResult.timings.feedbackMs}ms, popup cleanup ${submitResult.timings.popupCleanupMs}ms, total ${submitResult.timings.totalMs}ms.`);

  console.log(
    `Booking submitted for ${location.name} on ${formatDateForNac(request.date)} at ${request.from}-${request.to}.`
  );
  return submitResult;
}

export async function attemptPriorityBooking(page, request, {
  control,
  limit,
  resolve = resolveLocationRecord,
  precheck = precheckAvailability,
  book = runBookingFlow,
}) {
  const attemptErrors = [];
  // Start bounded speculative checks together; consume results in priority order.
  // Catch each result immediately so unused lower priorities cannot reject unhandled.
  const candidates = request.locationPriority.map((entry) => limit(async () => {
    if (control.stopped) throw new Error('Queue stopped.');
    const location = await resolve(entry);
    if (control.stopped) throw new Error('Queue stopped.');
    await precheck(location, request);
    return location;
  }).then((location) => ({ location }), (error) => ({ error })));

  for (const [priorityIndex, candidate] of candidates.entries()) {
    const { location, error } = await candidate;
    if (control.stopped) {
      return { success: false, request, outcome: 'not-submitted', skippedBecause: 'queue-stopped' };
    }
    if (error) {
      attemptErrors.push({ priority: priorityIndex + 1, stage: 'availability-precheck', error: error.message });
      continue;
    }
    console.log(`[${request.label}] Attempting priority #${priorityIndex + 1}: ${location.name}`);
    try {
      const result = await book(page, location, request, control);
      if (result?.outcome === 'rejected') {
        attemptErrors.push({ locationName: location.name, stage: 'submission-rejected', error: result.textSnippet, timings: result.timings });
        console.log(`[${request.label}] NAC rejected ${location.name}: ${result.textSnippet}. Trying the next candidate.`);
        continue;
      }
      return {
        success: true, outcome: 'confirmed', request, location, timings: result?.timings,
        ...(attemptErrors.length ? { errors: attemptErrors } : {}),
      };
    } catch (error) {
      attemptErrors.push({ locationName: location.name, stage: 'booking-flow', error: error.message, timings: error.timings });
      if (error.stopQueue) {
        if (error.outcome === 'not-submitted' && control.stopped) {
          return { success: false, request, outcome: 'not-submitted', skippedBecause: 'queue-stopped' };
        }
        const result = { success: error.outcome === 'confirmed', stopQueue: true, outcome: error.outcome, request, location, errors: attemptErrors, timings: error.timings };
        stopBookingQueue(control, result);
        return result;
      }
      // Errors after Submit stop above. Explicit, cleaned-up rejections are
      // returned by book() and advance to the next candidate separately.
      console.log(`[${request.label}] Preparation failed for ${location.name}: ${error.message}`);
    }
  }
  return { success: false, outcome: 'failed', request, errors: attemptErrors };
}

async function buildBookingRequests(args) {
  if (!args.configFile) {
    return {
      stopOnFailure: true,
      requests: [buildSingleBookingRequest(args)],
    };
  }

  const config = await loadBookingConfig(args.configFile);
  return {
    stopOnFailure: config.stopOnFailure,
    requests: config.bookings.map(normalizeBookingRequest),
  };
}

export async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printHelp();
    return;
  }

  validateArgs(args);
  const bookingPlan = args.loginOnly ? { stopOnFailure: true, requests: [] } : await buildBookingRequests(args);
  validateBookingPlan(bookingPlan.requests);
  await ensureDirectoryExists(args.userDataDir);
  console.log(`Using persisted NAC browser profile: ${args.userDataDir}`);

  const browser = await launchPersistentBrowser(args);

  try {
    const page = await ensureAuthenticatedBuskingDetailsPage(browser, args);
    await installNacPageHelpers(page);
    console.log(`NAC session is ready at ${page.url()}`);

    if (args.loginOnly) {
      console.log('Login-only mode complete.');
      return;
    }

    const pages = [page];
    if (args.concurrency === 2 && bookingPlan.requests.length > 1) {
      pages.push(null); // This worker opens its tab while the first worker books.
    }
    const control = {
      stopped: false,
      submissionOptions: {
        confirmationTimeoutMs: args.confirmationTimeoutMs,
        resultTimeoutMs: args.submissionTimeoutMs,
      },
      onStop: (reason) => console.error(`Queue stopped by "${reason.label}" (${reason.outcome}): ${reason.error}`),
    };
    const limit = createLimiter(4);
    const locationCache = new Map();
    const resolve = (entry) => {
      const key = JSON.stringify(entry);
      if (!locationCache.has(key)) locationCache.set(key, resolveLocationRecord(entry));
      return locationCache.get(key);
    };
    console.log(`Starting ${pages.length} booking worker(s) independently; at most 4 availability checks at once.`);
    const started = Date.now();
    const workerErrors = [];
    const results = await runBookingQueue({
      requests: bookingPlan.requests, pages, stopOnFailure: bookingPlan.stopOnFailure, control, workerErrors,
      preparePage: async (workerPage, worker) => {
        if (!workerPage) {
          console.log(`[worker ${worker}] Opening booking tab.`);
          workerPage = await browser.newPage();
          await workerPage.goto(BUSKING_DETAILS_URL, { waitUntil: 'domcontentloaded', timeout: args.navigationTimeoutMs });
          if (!workerPage.url().toLowerCase().includes('/busking/busker/details')) {
            throw new Error('Additional booking tab did not inherit an authenticated NAC session.');
          }
          await waitForBookingControls(workerPage, args.navigationTimeoutMs);
        }
        console.log(`[worker ${worker}] Tab ready after ${Date.now() - started}ms.`);
        return workerPage;
      },
      attempt: (workerPage, request, worker) => {
        console.log(`[worker ${worker}] Starting "${request.label}" ${request.date} ${request.from}-${request.to}`);
        return attemptPriorityBooking(workerPage, request, { control, limit, resolve });
      },
    });
    const summary = summarizeBookingRun(results, {
      durationMs: Date.now() - started, workerErrors, stopReason: control.stopReason,
    });
    console.log(JSON.stringify(summary, null, 2));
    if (results.some((result) => !result.success || result.stopQueue)) {
      const cause = control.stopReason
        ? ` Queue stopped by "${control.stopReason.label}": ${control.stopReason.error}` : '';
      throw new Error(
        `Booking run needs review: ${summary.counts.confirmed} confirmed, ${summary.counts.failed} failed, ` +
        `${summary.counts.skipped} skipped.${cause} Review per-booking outcomes before rerunning; do not resubmit confirmed bookings.`
      );
    }
  } finally {
    if (args.keepOpen) {
      await browser.disconnect();
    } else {
      await browser.close();
    }
  }
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const currentFilePath = fileURLToPath(import.meta.url);

if (executedPath === currentFilePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
