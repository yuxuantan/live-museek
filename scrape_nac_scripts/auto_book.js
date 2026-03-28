import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
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
} from './nac_booking_browser.js';
import {
  formatDateForNac,
  normalizeText,
  parseTimeRangeArg,
  resolveLocationRecord,
} from './nac_common.js';
import {
  evaluateAvailabilityForRange,
  fetchLocationAvailability,
} from './nac_availability_client.js';

function parseBooleanFlag(rawArg) {
  const [, rawValue = 'true'] = rawArg.split('=');
  return !['false', '0', 'no'].includes(String(rawValue).trim().toLowerCase());
}

function parseCliArgs(argv) {
  const args = {
    configFile: '',
    date: '',
    from: '',
    to: '',
    locationId: '',
    locationName: '',
    headless: false,
    keepOpen: true,
    keepOpenExplicitlySet: false,
    loginOnly: false,
    manualLoginTimeoutMs: DEFAULT_MANUAL_LOGIN_TIMEOUT_MS,
    navigationTimeoutMs: DEFAULT_NAVIGATION_TIMEOUT_MS,
    userDataDir: DEFAULT_USER_DATA_DIR,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || '',
    help: false,
  };

  for (const rawArg of argv) {
    if (rawArg === '--help' || rawArg === '-h') {
      args.help = true;
      continue;
    }

    if (rawArg === '--login-only') {
      args.loginOnly = true;
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

function normalizeBookingRequest(rawRequest, index) {
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

async function runBookingFlow(page, location, request) {
  await installNacPageHelpers(page);
  await openBookingModal(page);

  const initialSnapshot = await getBookingSnapshot(page);
  if (!initialSnapshot?.found) {
    throw new Error('Booking modal opened, but its fields could not be read.');
  }

  console.log(`Initial modal location: ${initialSnapshot.locationText || '(unknown)'}`);
  await setBookingLocation(page, {
    locationId: location.location_id,
    locationName: location.name,
  });

  const locationSnapshot = await getBookingSnapshot(page);
  console.log(`Selected booking location: ${locationSnapshot?.locationText || location.name}`);

  await selectBookingDate(page, request.date);
  const dateSnapshot = await getBookingSnapshot(page);
  console.log(`Selected booking date: ${dateSnapshot?.dateValue || request.date}`);

  await loadSlotsForSelectedDate(page);
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
  console.log(`Selected booking time range: ${normalizeText(request.from)}-${normalizeText(request.to)}`);

  const submitResult = await submitBooking(page);
  if (!submitResult.success) {
    throw new Error(
      `Booking submit did not confirm success. Modal still open=${submitResult.modalStillOpen}. Page text: ${submitResult.textSnippet}`
    );
  }

  console.log(
    `Booking submitted for ${location.name} on ${formatDateForNac(request.date)} at ${request.from}-${request.to}.`
  );
}

async function attemptPriorityBooking(page, request, args) {
  const attemptErrors = [];

  for (const [priorityIndex, locationEntry] of request.locationPriority.entries()) {
    const location = await resolveLocationRecord(locationEntry);
    console.log(
      `Attempting ${request.label} priority #${priorityIndex + 1}: ${location.name} (${location.location_id})`
    );

    try {
      await precheckAvailability(location, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Skipping ${location.name}: ${message}`);
      attemptErrors.push({
        locationName: location.name,
        locationId: location.location_id,
        stage: 'availability-precheck',
        error: message,
      });
      continue;
    }

    try {
      await runBookingFlow(page, location, request);
      return {
        success: true,
        request,
        location,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Booking attempt failed for ${location.name}: ${message}`);
      attemptErrors.push({
        locationName: location.name,
        locationId: location.location_id,
        stage: 'booking-flow',
        error: message,
      });
    }
  }

  return {
    success: false,
    request,
    errors: attemptErrors,
  };
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
  await ensureDirectoryExists(args.userDataDir);
  console.log(`Using persisted NAC browser profile: ${args.userDataDir}`);
  const bookingPlan = args.loginOnly ? { stopOnFailure: true, requests: [] } : await buildBookingRequests(args);

  const browser = await launchPersistentBrowser(args);

  try {
    const page = await ensureAuthenticatedBuskingDetailsPage(browser, args);
    await installNacPageHelpers(page);
    console.log(`NAC session is ready at ${page.url()}`);

    if (args.loginOnly) {
      console.log('Login-only mode complete.');
      return;
    }

    const results = [];
    for (const request of bookingPlan.requests) {
      console.log(
        `Starting booking request "${request.label}" for ${formatDateForNac(request.date)} ${request.from}-${request.to}`
      );
      const result = await attemptPriorityBooking(page, request, args);
      results.push(result);

      if (result.success) {
        console.log(
          `Completed booking request "${request.label}" with ${result.location.name} (${result.location.location_id}).`
        );
      } else {
        console.log(`Booking request "${request.label}" failed for all candidate locations.`);
        if (bookingPlan.stopOnFailure) {
          throw new Error(
            `Stopping after failed booking request "${request.label}": ${result.errors.map((entry) => `${entry.locationName}: ${entry.error}`).join(' | ')}`
          );
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          results: results.map((result) =>
            result.success
              ? {
                  label: result.request.label,
                  success: true,
                  date: result.request.date,
                  from: result.request.from,
                  to: result.request.to,
                  locationName: result.location.name,
                  locationId: result.location.location_id,
                }
              : {
                  label: result.request.label,
                  success: false,
                  date: result.request.date,
                  from: result.request.from,
                  to: result.request.to,
                  errors: result.errors,
                }
          ),
        },
        null,
        2
      )
    );
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
