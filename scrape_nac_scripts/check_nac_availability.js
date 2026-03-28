import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatDateForNac,
  listLocations,
  normalizeText,
  parseTimeRangeArg,
} from './nac_common.js';
import {
  evaluateAvailabilityForRange,
  fetchLocationAvailability,
} from './nac_availability_client.js';

function parseCliArgs(argv) {
  const args = {
    date: '',
    from: '',
    to: '',
    concurrency: 10,
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

    if (rawArg.startsWith('--concurrency=')) {
      const value = Number.parseInt(rawArg.substring('--concurrency='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        args.concurrency = value;
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
  npm run nac:availability -- --date=29/03/2026 --time=10:00-12:00

Required:
  --date=<DD/MM/YYYY|YYYY-MM-DD>
  --time=<HH:MM-HH:MM>
    or:
  --from=<HH:MM> --to=<HH:MM>

Optional:
  --concurrency=<number>
      Number of NAC availability requests to run in parallel.
      Default: 10
`.trim());
}

function validateArgs(args) {
  if (!args.date) {
    throw new Error('Missing required --date argument.');
  }

  if (!args.from || !args.to) {
    throw new Error('Missing required time range. Use --time or both --from and --to.');
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

export async function main(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  if (args.help) {
    printHelp();
    return;
  }

  validateArgs(args);
  const locations = await listLocations();
  console.log(
    `Checking NAC availability for ${locations.length} locations on ${formatDateForNac(args.date)} at ${normalizeText(args.from)}-${normalizeText(args.to)}...`
  );

  const results = await mapWithConcurrency(locations, args.concurrency, async (location) => {
    try {
      const availability = await fetchLocationAvailability(location.location_id, args.date);
      const evaluation = evaluateAvailabilityForRange(availability.rows, args.from, args.to);
      return {
        locationId: location.location_id,
        locationName: location.name,
        allAvailable: evaluation.allAvailable,
        matchedSlots: evaluation.availableRows.map((row) => row.key),
        missingSlots: evaluation.missingSlotKeys,
        unavailableSlots: evaluation.unavailableRows.map((row) => row.key),
      };
    } catch (error) {
      return {
        locationId: location.location_id,
        locationName: location.name,
        allAvailable: false,
        matchedSlots: [],
        missingSlots: [],
        unavailableSlots: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const availableLocations = results.filter((result) => result.allAvailable);
  const failedLocations = results.filter((result) => result.error);

  console.log(`Available locations: ${availableLocations.length}`);
  console.table(
    availableLocations.map((result) => ({
      Location: result.locationName,
      LocationId: result.locationId,
      Slots: result.matchedSlots.join(', '),
    }))
  );

  if (failedLocations.length > 0) {
    console.log(`Requests with errors: ${failedLocations.length}`);
    console.table(
      failedLocations.map((result) => ({
        Location: result.locationName,
        LocationId: result.locationId,
        Error: result.error,
      }))
    );
  }

  console.log(
    JSON.stringify(
      {
        date: formatDateForNac(args.date),
        from: args.from,
        to: args.to,
        availableLocations,
        failedLocations,
      },
      null,
      2
    )
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

