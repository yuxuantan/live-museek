import {
  buildAvailabilityUrl,
  expandTimeRangeToSlotKeys,
  normalizeTimeLabel,
  parseAvailabilityRows,
} from './nac_common.js';

export async function fetchLocationAvailability(locationId, dateInput) {
  const url = buildAvailabilityUrl(locationId, dateInput);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`NAC availability request failed for ${locationId}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  return {
    locationId,
    url,
    status: response.status,
    rows: parseAvailabilityRows(payload),
  };
}

export function evaluateAvailabilityForRange(rows, from, to) {
  const targetSlotKeys = expandTimeRangeToSlotKeys(from, to);
  const byKey = new Map((rows ?? []).map((row) => [row.key, row]));

  const availableRows = [];
  const unavailableRows = [];
  const missingSlotKeys = [];

  for (const slotKey of targetSlotKeys) {
    const row = byKey.get(slotKey);
    if (!row) {
      missingSlotKeys.push(slotKey);
      continue;
    }

    if (row.isNotAvailable) {
      unavailableRows.push(row);
      continue;
    }

    availableRows.push(row);
  }

  return {
    requestedFrom: normalizeTimeLabel(from),
    requestedTo: normalizeTimeLabel(to),
    targetSlotKeys,
    availableRows,
    unavailableRows,
    missingSlotKeys,
    allAvailable: missingSlotKeys.length === 0 && unavailableRows.length === 0,
  };
}

