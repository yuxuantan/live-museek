import fs from 'node:fs/promises';
import path from 'node:path';
import { getRequestHostname, isLocalhostHostname } from '../../refreshAccess.js';
import { main as refreshInsightsSnapshot } from '../../../scrape_nac_scripts/snapshot_nac_slot_universe.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SNAPSHOT_PATH = path.resolve(process.cwd(), '.local/nac-slot-universe-snapshot.json');
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_WINDOW_DAYS = 62;

let activeRefresh = null;

async function readSnapshot() {
  const fileContents = await fs.readFile(SNAPSHOT_PATH, 'utf8');
  return JSON.parse(fileContents);
}

function parseDateKey(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (!DATE_KEY_PATTERN.test(normalizedValue)) {
    return null;
  }

  const date = new Date(`${normalizedValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalizedValue) {
    return null;
  }

  return date;
}

function buildRefreshArgs(body) {
  const fromDate = typeof body?.fromDate === 'string' ? body.fromDate.trim() : '';
  const toDate = typeof body?.toDate === 'string' ? body.toDate.trim() : '';

  if (!fromDate && !toDate) {
    return [];
  }

  if (!fromDate || !toDate) {
    throw new Error('Choose both a start date and an end date, or leave both blank for the latest rolling window.');
  }

  const parsedFromDate = parseDateKey(fromDate);
  const parsedToDate = parseDateKey(toDate);
  if (!parsedFromDate || !parsedToDate) {
    throw new Error('Dates must use the YYYY-MM-DD format.');
  }

  if (parsedToDate < parsedFromDate) {
    throw new Error('The end date must be on or after the start date.');
  }

  const windowDays = Math.floor((parsedToDate - parsedFromDate) / 86_400_000) + 1;
  if (windowDays > MAX_CUSTOM_WINDOW_DAYS) {
    throw new Error(`Choose a window of ${MAX_CUSTOM_WINDOW_DAYS} days or fewer.`);
  }

  return [`--from-date=${fromDate}`, `--to-date=${toDate}`];
}

export async function GET(request) {
  if (!isLocalhostHostname(getRequestHostname(request))) {
    return Response.json(
      { error: 'Insights are only available on localhost.' },
      { status: 403 }
    );
  }

  try {
    const payload = await readSnapshot();

    return Response.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const code = error?.code === 'ENOENT' ? 404 : 500;
    const message =
      error?.code === 'ENOENT'
        ? 'Insights snapshot not found. Run `npm run nac:slot-universe --` first.'
        : error instanceof Error
          ? error.message
          : 'Failed to read insights snapshot.';

    return Response.json({ error: message }, { status: code });
  }
}

export async function POST(request) {
  if (!isLocalhostHostname(getRequestHostname(request))) {
    return Response.json(
      { error: 'Insights refresh is only available on localhost.' },
      { status: 403 }
    );
  }

  if (activeRefresh) {
    return Response.json(
      { error: 'An Insights refresh is already running. Wait for it to finish before starting another.' },
      { status: 409 }
    );
  }

  let refreshArgs;
  try {
    const body = await request.json();
    refreshArgs = buildRefreshArgs(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid refresh request.';
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    activeRefresh = refreshInsightsSnapshot(refreshArgs);
    await activeRefresh;
    const snapshot = await readSnapshot();

    return Response.json(
      { ok: true, snapshot },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Insights refresh failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to refresh Insights.';
    return Response.json({ error: message }, { status: 500 });
  } finally {
    activeRefresh = null;
  }
}
