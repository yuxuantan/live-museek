import path from 'node:path';
import { createScraperSupabaseClient } from './supabase_client.js';

export const ROOT_URL = 'https://eservices.nac.gov.sg';
export const BUSKING_DETAILS_URL = `${ROOT_URL}/Busking/busker/details`;
export const BEFORE_LOGIN_URL = `${ROOT_URL}/Busking/BeforeLogin`;
export const DEFAULT_USER_DATA_DIR = path.resolve(process.cwd(), '.local/nac-busking-session');
export const DEFAULT_MANUAL_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 60_000;
export const SINGAPORE_TIMEZONE = 'Asia/Singapore';
export const LOGIN_BLOCK_PATTERNS = [
  /try again in 5 mins/i,
  /try again in 5 min/i,
  /try again in 5 minutes/i,
  /please try again later/i,
];

const MONTH_INDEX_BY_NAME = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocationLookupKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^\*+/, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function createDate(year, monthIndex, day) {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, monthIndex, day, 12, 0, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function parseDateString(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return null;
  }

  let match = normalizedValue.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (match) {
    return createDate(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return createDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  match = normalizedValue.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (match) {
    const monthIndex = MONTH_INDEX_BY_NAME[match[1].toLowerCase()];
    return monthIndex == null ? null : createDate(Number(match[3]), monthIndex, Number(match[2]));
  }

  match = normalizedValue.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const monthIndex = MONTH_INDEX_BY_NAME[match[2].toLowerCase()];
    return monthIndex == null ? null : createDate(Number(match[3]), monthIndex, Number(match[1]));
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return createDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function toDateKey(value) {
  const date = value instanceof Date ? value : parseDateString(value);
  if (!date) {
    return '';
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getSingaporeFormatter(parts) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SINGAPORE_TIMEZONE,
    hour12: false,
    ...parts,
  });
}

function getSingaporeDateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = getSingaporeFormatter({
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

export function toSingaporeDateKey(value) {
  const parts = getSingaporeDateParts(value);
  if (!parts) {
    return '';
  }

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function formatDateForNac(value) {
  const date = value instanceof Date ? value : parseDateString(value);
  if (!date) {
    throw new Error(`Invalid date: ${value}`);
  }

  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
}

export function normalizeTimeLabel(value) {
  const normalizedValue = normalizeText(value).toLowerCase().replace(/\./g, ':');
  if (!normalizedValue) {
    return '';
  }

  let match = normalizedValue.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? '00');
    const meridiem = match[3];

    if (hours === 12) {
      hours = meridiem === 'am' ? 0 : 12;
    } else if (meridiem === 'pm') {
      hours += 12;
    }

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  match = normalizedValue.match(/^(\d{1,2})(?::(\d{2}))$/);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2] ?? '00');
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return '';
}

export function buildTimeSlotKey(from, to) {
  const normalizedFrom = normalizeTimeLabel(from);
  const normalizedTo = normalizeTimeLabel(to);
  if (!normalizedFrom || !normalizedTo) {
    return '';
  }

  return `${normalizedFrom}-${normalizedTo}`;
}

function timeLabelToMinutes(value) {
  const normalized = normalizeTimeLabel(value);
  if (!normalized) {
    return Number.NaN;
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTimeLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
}

export function parseTimeRangeArg(value) {
  const normalizedValue = normalizeText(value).replace(/[–—]/g, '-');
  const [fromRaw = '', toRaw = ''] = normalizedValue.split('-');
  const from = normalizeTimeLabel(fromRaw);
  const to = normalizeTimeLabel(toRaw);
  if (!from || !to) {
    return null;
  }

  return { from, to };
}

export function expandTimeRangeToSlotKeys(from, to) {
  const startMinutes = timeLabelToMinutes(from);
  const endMinutes = timeLabelToMinutes(to);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    throw new Error(`Invalid time range: ${from}-${to}`);
  }

  if (startMinutes % 60 !== 0 || endMinutes % 60 !== 0) {
    throw new Error(`Only whole-hour booking ranges are supported: ${from}-${to}`);
  }

  const slotKeys = [];
  for (let cursor = startMinutes; cursor < endMinutes; cursor += 60) {
    slotKeys.push(buildTimeSlotKey(minutesToTimeLabel(cursor), minutesToTimeLabel(cursor + 60)));
  }

  return slotKeys;
}

export async function listLocations() {
  const supabase = createScraperSupabaseClient();
  const { data, error } = await supabase
    .from('locations')
    .select('location_id, name')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to read NAC locations from Supabase: ${error.message || error}`);
  }

  return data ?? [];
}

export async function resolveLocationRecord({ locationId = '', locationName = '' }) {
  const locations = await listLocations();

  if (locationId) {
    const exactById = locations.find((location) => location.location_id === locationId);
    if (!exactById) {
      throw new Error(`Unable to find location_id ${locationId} in Supabase locations.`);
    }
    return exactById;
  }

  const normalizedTarget = normalizeLocationLookupKey(locationName);
  if (!normalizedTarget) {
    throw new Error('A location must be provided with --location-id or --location-name.');
  }

  const exactMatch = locations.find((location) => normalizeLocationLookupKey(location.name) === normalizedTarget);
  if (exactMatch) {
    return exactMatch;
  }

  const looseMatches = locations.filter((location) => {
    const normalizedCandidate = normalizeLocationLookupKey(location.name);
    return (
      normalizedCandidate.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedCandidate)
    );
  });

  if (looseMatches.length === 1) {
    return looseMatches[0];
  }

  if (looseMatches.length > 1) {
    throw new Error(
      `Location name "${locationName}" matched multiple locations: ${looseMatches.map((location) => location.name).join(', ')}`
    );
  }

  throw new Error(`Unable to resolve location name "${locationName}" from Supabase locations.`);
}

export function buildAvailabilityUrl(locationId, dateInput) {
  return `${ROOT_URL}/Busking/bookings/locations/${locationId}/availablities?date=${encodeURIComponent(formatDateForNac(dateInput))}`;
}

function parseAvailabilityTime(value) {
  const hours = Number(value?.Hours ?? value?.hours);
  const minutes = Number(value?.Minutes ?? value?.minutes ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return '';
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseAvailabilityRows(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((entry) => {
      const from = parseAvailabilityTime(entry?.StartTime);
      const to = parseAvailabilityTime(entry?.EndTime);
      const key = buildTimeSlotKey(from, to);
      if (!key) {
        return null;
      }

      return {
        from,
        to,
        key,
        isNotAvailable: Boolean(entry?.IsNotAvailable),
        message: normalizeText(entry?.MessageIfNotAvailable),
        raw: entry,
      };
    })
    .filter(Boolean);
}

