import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SINGAPORE_TIMEZONE,
  formatDateForNac,
  listLocations,
  parseDateString,
  toDateKey,
  toSingaporeDateKey,
} from './nac_common.js';
import { fetchLocationAvailability } from './nac_availability_client.js';
import { createScraperSupabaseClient } from './supabase_client.js';

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), '.local/nac-slot-universe-snapshot.json');

function parseCliArgs(argv) {
  const args = {
    date: '',
    fromDate: '',
    toDate: '',
    concurrency: DEFAULT_CONCURRENCY,
    output: DEFAULT_OUTPUT_PATH,
    help: false,
  };

  for (const rawArg of argv) {
    if (rawArg === '--help' || rawArg === '-h') {
      args.help = true;
      continue;
    }

    if (rawArg.startsWith('--date=')) {
      args.date = rawArg.substring('--date='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--from-date=')) {
      args.fromDate = rawArg.substring('--from-date='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--to-date=')) {
      args.toDate = rawArg.substring('--to-date='.length).trim();
      continue;
    }

    if (rawArg.startsWith('--concurrency=')) {
      const value = Number.parseInt(rawArg.substring('--concurrency='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        args.concurrency = value;
      }
      continue;
    }

    if (rawArg.startsWith('--output=')) {
      const outputPath = rawArg.substring('--output='.length).trim();
      if (outputPath) {
        args.output = path.resolve(process.cwd(), outputPath);
      }
      continue;
    }

    throw new Error(`Unsupported argument: ${rawArg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run nac:slot-universe --
  npm run nac:slot-universe -- --date=29/03/2026
  npm run nac:slot-universe -- --from-date=2026-03-29 --to-date=2026-04-15

Default window:
  Uses today's date in Singapore time as the start date.
  If the start date is after the 15th, the window ends on the 15th of the next month.
  Otherwise, the window ends on the last day of the same month.

Universe formula:
  slot universe = NAC available now + Supabase booked slots

Optional:
  --date=<DD/MM/YYYY|YYYY-MM-DD>
      Override the start date used for the default rolling window.

  --from-date=<DD/MM/YYYY|YYYY-MM-DD>
  --to-date=<DD/MM/YYYY|YYYY-MM-DD>
      Use an explicit inclusive date range instead of the default rolling window.

  --concurrency=<number>
      Number of NAC availability requests to run in parallel per date.
      Default: ${DEFAULT_CONCURRENCY}

  --output=<path>
      JSON snapshot output path.
      Default: ${DEFAULT_OUTPUT_PATH}
`.trim());
}

function validateArgs(args) {
  const hasExplicitFrom = Boolean(args.fromDate);
  const hasExplicitTo = Boolean(args.toDate);

  if (hasExplicitFrom !== hasExplicitTo) {
    throw new Error('Use both --from-date and --to-date together.');
  }

  if ((hasExplicitFrom || hasExplicitTo) && args.date) {
    throw new Error('Use either --date or --from-date/--to-date, not both.');
  }
}

async function mapWithConcurrency(items, concurrency, iteratee) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function makeLocalDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  next.setHours(12, 0, 0, 0);
  return next;
}

function endOfMonth(date) {
  return makeLocalDate(date.getFullYear(), date.getMonth() + 1, 0);
}

function fifteenthOfNextMonth(date) {
  return makeLocalDate(date.getFullYear(), date.getMonth() + 1, 15);
}

function enumerateDateKeysInclusive(startDate, endDate) {
  const dateKeys = [];
  for (let cursor = new Date(startDate); cursor <= endDate; cursor = addDays(cursor, 1)) {
    dateKeys.push(toDateKey(cursor));
  }
  return dateKeys;
}

function resolveDateWindow(args) {
  if (args.fromDate && args.toDate) {
    const startDate = parseDateString(args.fromDate);
    const endDate = parseDateString(args.toDate);
    if (!startDate || !endDate) {
      throw new Error(`Invalid explicit date range: ${args.fromDate} -> ${args.toDate}`);
    }

    if (endDate.getTime() < startDate.getTime()) {
      throw new Error('The explicit date range must end on or after the start date.');
    }

    return {
      anchorDateKey: toDateKey(startDate),
      startDateKey: toDateKey(startDate),
      endDateKey: toDateKey(endDate),
      dateKeys: enumerateDateKeysInclusive(startDate, endDate),
      selectionRule: 'explicit-range',
    };
  }

  const anchorDateKey = toDateKey(args.date || toSingaporeDateKey(new Date()));
  const anchorDate = parseDateString(anchorDateKey);
  if (!anchorDate) {
    throw new Error(`Invalid date: ${args.date}`);
  }

  const endDate =
    anchorDate.getDate() > 15
      ? fifteenthOfNextMonth(anchorDate)
      : endOfMonth(anchorDate);
  const selectionRule =
    anchorDate.getDate() > 15
      ? 'through-fifteenth-of-next-month'
      : 'through-end-of-current-month';

  return {
    anchorDateKey,
    startDateKey: anchorDateKey,
    endDateKey: toDateKey(endDate),
    dateKeys: enumerateDateKeysInclusive(anchorDate, endDate),
    selectionRule,
  };
}

function getSingaporeDateTimeParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SINGAPORE_TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
  };
}

function toSingaporeTimeLabel(value) {
  const parts = getSingaporeDateTimeParts(value);
  if (!parts) {
    return '';
  }

  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function timeLabelToMinutes(value) {
  const match = String(value ?? '').match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToSlotBoundaryLabel(minutes) {
  if (minutes === 24 * 60) {
    return '00:00';
  }

  const normalizedMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalizedMinutes / 60);
  const remainingMinutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

function expandBookedTimeRangeToSlotKeys(from, to, { allowMidnightEnd = false } = {}) {
  const startMinutes = timeLabelToMinutes(from);
  let endMinutes = timeLabelToMinutes(to);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    throw new Error(`Invalid time range: ${from}-${to}`);
  }

  if (allowMidnightEnd && to === '00:00' && endMinutes <= startMinutes) {
    endMinutes = 24 * 60;
  }

  if (endMinutes <= startMinutes) {
    throw new Error(`Invalid time range: ${from}-${to}`);
  }

  if (startMinutes % 60 !== 0 || endMinutes % 60 !== 0) {
    throw new Error(`Only whole-hour booking ranges are supported: ${from}-${to}`);
  }

  const slotKeys = [];
  for (let cursor = startMinutes; cursor < endMinutes; cursor += 60) {
    slotKeys.push(`${minutesToSlotBoundaryLabel(cursor)}-${minutesToSlotBoundaryLabel(cursor + 60)}`);
  }

  return slotKeys;
}

function getSingaporeDayUtcRange(dateInput) {
  const date = parseDateString(dateInput);
  if (!date) {
    throw new Error(`Invalid date: ${dateInput}`);
  }

  return {
    startUtc: new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), -8, 0, 0, 0)),
    endUtc: new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + 1, -8, 0, 0, 0)),
  };
}

function sortSlotRows(rows) {
  return [...rows].sort((left, right) => {
    if (left.from !== right.from) {
      return left.from.localeCompare(right.from);
    }

    if (left.to !== right.to) {
      return left.to.localeCompare(right.to);
    }

    return left.key.localeCompare(right.key);
  });
}

function slotKeyToRow(slotKey) {
  const [from = '', to = ''] = String(slotKey ?? '').split('-');
  if (!from || !to) {
    return null;
  }

  return {
    from,
    to,
    key: `${from}-${to}`,
  };
}

function dedupeSlotRows(rows) {
  const byKey = new Map();
  for (const row of rows ?? []) {
    if (!row?.key || byKey.has(row.key)) {
      continue;
    }

    byKey.set(row.key, row);
  }

  return sortSlotRows([...byKey.values()]);
}

function createRate(numerator, denominator) {
  if (!denominator) {
    return null;
  }

  return numerator / denominator;
}

function buildBookedSlotKeysForPerformance(performance, targetDateKey, targetRange) {
  const startDate = new Date(performance.start_datetime);
  const endDate = new Date(performance.end_datetime);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }

  const clampedStart = new Date(Math.max(startDate.getTime(), targetRange.startUtc.getTime()));
  const clampedEnd = new Date(Math.min(endDate.getTime(), targetRange.endUtc.getTime()));
  if (clampedEnd.getTime() <= clampedStart.getTime()) {
    return [];
  }

  if (
    toSingaporeDateKey(clampedStart) !== targetDateKey ||
    toSingaporeDateKey(new Date(clampedEnd.getTime() - 1)) !== targetDateKey
  ) {
    return [];
  }

  const from = toSingaporeTimeLabel(clampedStart);
  const to = toSingaporeTimeLabel(clampedEnd);
  if (!from || !to) {
    return [];
  }

  try {
    return expandBookedTimeRangeToSlotKeys(from, to, {
      allowMidnightEnd: clampedEnd.getTime() === targetRange.endUtc.getTime(),
    });
  } catch (error) {
    console.warn(
      `Skipping non-hour-aligned performance for ${performance.location_id} ${performance.start_datetime}-${performance.end_datetime}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return [];
  }
}

async function listBookedPerformancesByLocationForDate(dateInput) {
  const targetDateKey = toDateKey(dateInput);
  if (!targetDateKey) {
    throw new Error(`Invalid date: ${dateInput}`);
  }

  const targetRange = getSingaporeDayUtcRange(dateInput);
  const supabase = createScraperSupabaseClient();
  const { data, error } = await supabase
    .from('performances')
    .select('busker_id, location_id, start_datetime, end_datetime')
    .lt('start_datetime', targetRange.endUtc.toISOString())
    .gt('end_datetime', targetRange.startUtc.toISOString());

  if (error) {
    throw new Error(`Failed to read booked performances from Supabase: ${error.message || error}`);
  }

  const byLocationId = new Map();

  for (const performance of data ?? []) {
    const locationId = String(performance.location_id ?? '').trim();
    if (!locationId) {
      continue;
    }

    const slotKeys = buildBookedSlotKeysForPerformance(performance, targetDateKey, targetRange);
    const existing = byLocationId.get(locationId) ?? [];
    existing.push({
      buskerId: performance.busker_id,
      startDatetime: performance.start_datetime,
      endDatetime: performance.end_datetime,
      slotKeys,
    });
    byLocationId.set(locationId, existing);
  }

  return byLocationId;
}

function buildDailySnapshotForLocation(location, availability, bookedPerformances, sourceDateKey, sourceDateNac) {
  const availableRows = dedupeSlotRows(
    availability.rows
      .filter((row) => !row.isNotAvailable)
      .map((row) => ({ from: row.from, to: row.to, key: row.key }))
  );
  const unavailableRows = dedupeSlotRows(
    availability.rows
      .filter((row) => row.isNotAvailable)
      .map((row) => ({
        from: row.from,
        to: row.to,
        key: row.key,
        message: row.message,
      }))
  );

  const bookedSlotKeys = [...new Set((bookedPerformances ?? []).flatMap((performance) => performance.slotKeys ?? []))].sort();
  const bookedSlotRows = dedupeSlotRows(bookedSlotKeys.map((slotKey) => slotKeyToRow(slotKey)).filter(Boolean));

  const bookedSlotKeySet = new Set(bookedSlotKeys);
  const blockedRows = dedupeSlotRows(
    unavailableRows
      .filter((row) => !bookedSlotKeySet.has(row.key))
      .map((row) => ({ from: row.from, to: row.to, key: row.key, message: row.message }))
  );

  const slotUniverseRows = dedupeSlotRows([
    ...availableRows,
    ...bookedSlotRows,
  ]);

  const slotCount = slotUniverseRows.length;
  const availableSlotCount = availableRows.length;
  const bookedSlotCount = bookedSlotRows.length;
  const blockedSlotCount = blockedRows.length;
  const visibleSlotCount = slotCount + blockedSlotCount;

  return {
    locationId: location.location_id,
    locationName: location.name,
    sourceDate: sourceDateNac,
    sourceDateKey,
    universeDerivation: 'nac-available-now-plus-supabase-booked-slots',
    requestUrl: availability.url,
    slotCount,
    availableSlotCount,
    bookedSlotCount,
    blockedSlotCount,
    unavailableSlotCount: unavailableRows.length,
    visibleSlotCount,
    bookingRate: createRate(bookedSlotCount, slotCount),
    availabilityRate: createRate(availableSlotCount, slotCount),
    blockedVisibleRate: createRate(blockedSlotCount, visibleSlotCount),
    slotUniverseKeys: slotUniverseRows.map((row) => row.key),
    slotUniverseRows,
    availableSlotKeys: availableRows.map((row) => row.key),
    bookedSlotKeys,
    bookedSlotRows,
    bookedPerformanceCount: bookedPerformances?.length ?? 0,
    bookedPerformances: bookedPerformances ?? [],
    blockedSlotKeys: blockedRows.map((row) => row.key),
    blockedSlotRows: blockedRows,
    unavailableSlotKeys: unavailableRows.map((row) => row.key),
    unavailableRows,
  };
}

function createEmptyAggregate(location, dateKeys) {
  return {
    locationId: location.location_id,
    locationName: location.name,
    daysTracked: dateKeys.length,
    daysWithUniverse: 0,
    daysWithBookings: 0,
    totalUniverseSlots: 0,
    totalAvailableSlots: 0,
    totalBookedSlots: 0,
    totalBlockedSlots: 0,
    totalVisibleSlots: 0,
    bookingRate: null,
    availabilityRate: null,
    blockedVisibleRate: null,
    byDate: {},
  };
}

function accumulateIntoAggregate(aggregateEntry, dailySnapshot) {
  aggregateEntry.byDate[dailySnapshot.sourceDateKey] = {
    slotCount: dailySnapshot.slotCount,
    availableSlotCount: dailySnapshot.availableSlotCount,
    bookedSlotCount: dailySnapshot.bookedSlotCount,
    blockedSlotCount: dailySnapshot.blockedSlotCount,
    bookingRate: dailySnapshot.bookingRate,
    availableSlotKeys: dailySnapshot.availableSlotKeys,
    bookedSlotKeys: dailySnapshot.bookedSlotKeys,
    blockedSlotKeys: dailySnapshot.blockedSlotKeys,
    slotUniverseKeys: dailySnapshot.slotUniverseKeys,
  };

  aggregateEntry.totalUniverseSlots += dailySnapshot.slotCount;
  aggregateEntry.totalAvailableSlots += dailySnapshot.availableSlotCount;
  aggregateEntry.totalBookedSlots += dailySnapshot.bookedSlotCount;
  aggregateEntry.totalBlockedSlots += dailySnapshot.blockedSlotCount;
  aggregateEntry.totalVisibleSlots += dailySnapshot.visibleSlotCount;

  if (dailySnapshot.slotCount > 0) {
    aggregateEntry.daysWithUniverse += 1;
  }

  if (dailySnapshot.bookedSlotCount > 0) {
    aggregateEntry.daysWithBookings += 1;
  }
}

function finalizeAggregate(aggregateEntry) {
  return {
    ...aggregateEntry,
    bookingRate: createRate(aggregateEntry.totalBookedSlots, aggregateEntry.totalUniverseSlots),
    availabilityRate: createRate(aggregateEntry.totalAvailableSlots, aggregateEntry.totalUniverseSlots),
    blockedVisibleRate: createRate(aggregateEntry.totalBlockedSlots, aggregateEntry.totalVisibleSlots),
  };
}

function buildDateSummary(dateKey, dateResults, sourceDateNac) {
  const successfulResults = dateResults.filter((result) => result.ok);
  const failedResults = dateResults.filter((result) => !result.ok);

  const totalUniverseSlots = successfulResults.reduce((sum, result) => sum + result.snapshot.slotCount, 0);
  const totalBookedSlots = successfulResults.reduce((sum, result) => sum + result.snapshot.bookedSlotCount, 0);
  const totalAvailableSlots = successfulResults.reduce((sum, result) => sum + result.snapshot.availableSlotCount, 0);
  const totalBlockedSlots = successfulResults.reduce((sum, result) => sum + result.snapshot.blockedSlotCount, 0);

  return {
    dateKey,
    sourceDate: sourceDateNac,
    locationCount: dateResults.length,
    successCount: successfulResults.length,
    failureCount: failedResults.length,
    locationsWithUniverse: successfulResults.filter((result) => result.snapshot.slotCount > 0).length,
    totalUniverseSlots,
    totalBookedSlots,
    totalAvailableSlots,
    totalBlockedSlots,
    overallBookingRate: createRate(totalBookedSlots, totalUniverseSlots),
  };
}

function buildRankingRows(aggregateByLocationId) {
  return Object.values(aggregateByLocationId)
    .filter((entry) => entry.totalUniverseSlots > 0)
    .sort((left, right) => {
      const leftRate = left.bookingRate ?? Number.NEGATIVE_INFINITY;
      const rightRate = right.bookingRate ?? Number.NEGATIVE_INFINITY;
      if (rightRate !== leftRate) {
        return rightRate - leftRate;
      }

      if (right.totalBookedSlots !== left.totalBookedSlots) {
        return right.totalBookedSlots - left.totalBookedSlots;
      }

      if (right.totalUniverseSlots !== left.totalUniverseSlots) {
        return right.totalUniverseSlots - left.totalUniverseSlots;
      }

      return left.locationName.localeCompare(right.locationName);
    })
    .map((entry, index) => ({
      rank: index + 1,
      locationId: entry.locationId,
      locationName: entry.locationName,
      bookingRate: entry.bookingRate,
      totalBookedSlots: entry.totalBookedSlots,
      totalUniverseSlots: entry.totalUniverseSlots,
      totalAvailableSlots: entry.totalAvailableSlots,
      totalBlockedSlots: entry.totalBlockedSlots,
      daysWithUniverse: entry.daysWithUniverse,
      daysTracked: entry.daysTracked,
    }));
}

async function writeSnapshot(outputPath, snapshot) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printHelp();
    return;
  }

  validateArgs(args);

  const window = resolveDateWindow(args);
  const locations = await listLocations();
  const aggregateByLocationId = Object.fromEntries(
    locations.map((location) => [location.location_id, createEmptyAggregate(location, window.dateKeys)])
  );
  const datesByKey = {};
  const dateSummariesByKey = {};

  console.log(
    `Snapshotting NAC slot universes for ${locations.length} locations from ${formatDateForNac(window.startDateKey)} to ${formatDateForNac(window.endDateKey)} (${window.dateKeys.length} days) using NAC available slots + Supabase booked slots...`
  );

  for (const [dateIndex, dateKey] of window.dateKeys.entries()) {
    const sourceDateNac = formatDateForNac(dateKey);
    console.log(`[${dateIndex + 1}/${window.dateKeys.length}] Processing ${sourceDateNac}...`);

    const bookedPerformancesByLocation = await listBookedPerformancesByLocationForDate(dateKey);
    const dateResults = await mapWithConcurrency(locations, args.concurrency, async (location) => {
      try {
        const availability = await fetchLocationAvailability(location.location_id, dateKey);
        const bookedPerformances = bookedPerformancesByLocation.get(location.location_id) ?? [];
        const snapshot = buildDailySnapshotForLocation(
          location,
          availability,
          bookedPerformances,
          dateKey,
          sourceDateNac
        );

        return {
          ok: true,
          locationId: location.location_id,
          locationName: location.name,
          snapshot,
        };
      } catch (error) {
        return {
          ok: false,
          locationId: location.location_id,
          locationName: location.name,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const successfulResults = dateResults.filter((result) => result.ok);
    const failedResults = dateResults.filter((result) => !result.ok);

    for (const result of successfulResults) {
      accumulateIntoAggregate(aggregateByLocationId[result.locationId], result.snapshot);
    }

    datesByKey[dateKey] = {
      dateKey,
      sourceDate: sourceDateNac,
      locationsById: Object.fromEntries(
        successfulResults.map((result) => [result.locationId, result.snapshot])
      ),
      failedLocations: failedResults.map((result) => ({
        locationId: result.locationId,
        locationName: result.locationName,
        error: result.error,
      })),
    };

    dateSummariesByKey[dateKey] = buildDateSummary(dateKey, dateResults, sourceDateNac);
  }

  const finalizedAggregateByLocationId = Object.fromEntries(
    Object.entries(aggregateByLocationId).map(([locationId, entry]) => [locationId, finalizeAggregate(entry)])
  );
  const rankingByBookingRate = buildRankingRows(finalizedAggregateByLocationId);

  const globalStats = {
    locationCount: locations.length,
    datesTracked: window.dateKeys.length,
    locationsWithUniverse: rankingByBookingRate.length,
    totalUniverseSlots: rankingByBookingRate.reduce((sum, entry) => sum + entry.totalUniverseSlots, 0),
    totalBookedSlots: rankingByBookingRate.reduce((sum, entry) => sum + entry.totalBookedSlots, 0),
    totalAvailableSlots: rankingByBookingRate.reduce((sum, entry) => sum + entry.totalAvailableSlots, 0),
    totalBlockedSlots: rankingByBookingRate.reduce((sum, entry) => sum + entry.totalBlockedSlots, 0),
  };
  globalStats.overallBookingRate = createRate(globalStats.totalBookedSlots, globalStats.totalUniverseSlots);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    universeDerivation: 'nac-available-now-plus-supabase-booked-slots',
    window,
    globalStats,
    rankings: {
      byBookingRate: rankingByBookingRate,
    },
    aggregateByLocationId: finalizedAggregateByLocationId,
    dateSummariesByKey,
    datesByKey,
  };

  await writeSnapshot(args.output, snapshot);

  console.log(`Saved slot universe snapshot to ${args.output}`);
  console.log(`Tracked ${window.dateKeys.length} dates across ${locations.length} locations.`);
  console.table(
    rankingByBookingRate.slice(0, 20).map((entry) => ({
      Rank: entry.rank,
      Location: entry.locationName,
      BookingRate: entry.bookingRate == null ? '' : `${(entry.bookingRate * 100).toFixed(1)}%`,
      Booked: entry.totalBookedSlots,
      Universe: entry.totalUniverseSlots,
      Available: entry.totalAvailableSlots,
      Blocked: entry.totalBlockedSlots,
      DaysWithUniverse: entry.daysWithUniverse,
    }))
  );
}

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const currentFilePath = fileURLToPath(import.meta.url);

if (executedPath === currentFilePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
