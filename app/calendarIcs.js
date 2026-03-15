const DEFAULT_SITE_URL = 'https://www.livemuseek.com';
const CALENDAR_TIMEZONE = 'Asia/Singapore';
const CALENDAR_PROD_ID = '-//LiveMuseek//Busking Calendar//EN';

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value) {
  return trimText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'calendar';
}

function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcsLine(line) {
  const maxLength = 75;
  if (line.length <= maxLength) {
    return line;
  }

  let output = '';
  let remaining = line;

  while (remaining.length > maxLength) {
    output += `${remaining.slice(0, maxLength)}\r\n `;
    remaining = remaining.slice(maxLength);
  }

  return `${output}${remaining}`;
}

function parseDisplayDateParts(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      return {
        year: match[1],
        month: match[2],
        day: match[3],
        hours: match[4],
        minutes: match[5],
        seconds: match[6] || '00',
      };
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, '0'),
    day: String(date.getUTCDate()).padStart(2, '0'),
    hours: String(date.getUTCHours()).padStart(2, '0'),
    minutes: String(date.getUTCMinutes()).padStart(2, '0'),
    seconds: String(date.getUTCSeconds()).padStart(2, '0'),
  };
}

function formatFloatingDateTime(value) {
  const parts = parseDisplayDateParts(value);
  if (!parts) {
    return '';
  }

  return `${parts.year}${parts.month}${parts.day}T${parts.hours}${parts.minutes}${parts.seconds}`;
}

function formatUtcTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function normalizeDateTimeString(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value ?? '');
  }

  return parsed.toISOString();
}

function mergeConsecutivePerformances(performances) {
  const uniquePerformances = [];
  const seenKeys = new Set();

  for (const performance of performances ?? []) {
    const key = [
      performance.busker_id,
      performance.location_id,
      normalizeDateTimeString(performance.start_datetime),
      normalizeDateTimeString(performance.end_datetime),
    ].join('|');

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    uniquePerformances.push({ ...performance });
  }

  uniquePerformances.sort((left, right) => {
    const leftKey = [
      String(left.busker_id ?? ''),
      String(left.location_id ?? ''),
      normalizeDateTimeString(left.start_datetime),
      normalizeDateTimeString(left.end_datetime),
    ].join('|');
    const rightKey = [
      String(right.busker_id ?? ''),
      String(right.location_id ?? ''),
      normalizeDateTimeString(right.start_datetime),
      normalizeDateTimeString(right.end_datetime),
    ].join('|');

    return leftKey.localeCompare(rightKey);
  });

  const mergedPerformances = [];

  for (const performance of uniquePerformances) {
    const previousPerformance = mergedPerformances[mergedPerformances.length - 1];
    if (
      previousPerformance &&
      previousPerformance.busker_id === performance.busker_id &&
      previousPerformance.location_id === performance.location_id &&
      normalizeDateTimeString(previousPerformance.end_datetime) === normalizeDateTimeString(performance.start_datetime)
    ) {
      previousPerformance.end_datetime = performance.end_datetime;
      continue;
    }

    mergedPerformances.push(performance);
  }

  return mergedPerformances;
}

function buildIcsCalendar({ calendarName, calendarDescription, events }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${CALENDAR_PROD_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-CALDESC:${escapeIcsText(calendarDescription)}`,
    `X-WR-TIMEZONE:${CALENDAR_TIMEZONE}`,
    'BEGIN:VTIMEZONE',
    `TZID:${CALENDAR_TIMEZONE}`,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:+08',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(event.uid)}`);
    lines.push(`DTSTAMP:${formatUtcTimestamp()}`);
    lines.push(`DTSTART;TZID=${CALENDAR_TIMEZONE}:${formatFloatingDateTime(event.start_datetime)}`);
    lines.push(`DTEND;TZID=${CALENDAR_TIMEZONE}:${formatFloatingDateTime(event.end_datetime)}`);
    lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    }

    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    }

    if (event.url) {
      lines.push(`URL:${escapeIcsText(event.url)}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return `${lines.map((line) => foldIcsLine(line)).join('\r\n')}\r\n`;
}

function downloadCalendarFile(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
  }, 0);
}

function resolveSiteUrl(siteUrl) {
  return trimText(siteUrl) || (typeof window !== 'undefined' ? window.location.origin : DEFAULT_SITE_URL);
}

function buildLocationEventDescription({ performance, location, siteUrl }) {
  const lines = [];

  if (performance?.busker_name) {
    lines.push(`Busker: ${performance.busker_name}`);
  }
  if (performance?.busker_act) {
    lines.push(`Act: ${performance.busker_act}`);
  }
  if (performance?.busker_art_form) {
    lines.push(`Art Form: ${performance.busker_art_form}`);
  }
  if (location?.address) {
    lines.push(`Address: ${location.address}`);
  }
  lines.push(`LiveMuseek: ${siteUrl}/seek-locations/${location.location_id}`);

  return lines.join('\n');
}

function buildBuskerEventDescription({ busker, performance, siteUrl }) {
  const lines = [];

  if (busker?.act) {
    lines.push(`Act: ${busker.act}`);
  }
  if (busker?.art_form) {
    lines.push(`Art Form: ${busker.art_form}`);
  }
  if (performance?.location_address) {
    lines.push(`Address: ${performance.location_address}`);
  }
  lines.push(`LiveMuseek: ${siteUrl}/seek-buskers/${busker.busker_id}`);

  return lines.join('\n');
}

export function downloadLocationCalendarIcs({ location, performances, siteUrl }) {
  if (!location) {
    return;
  }

  const resolvedSiteUrl = resolveSiteUrl(siteUrl);
  const events = mergeConsecutivePerformances(performances ?? []).map((performance) => ({
    uid: `location-${location.location_id}-${performance.busker_id}-${formatFloatingDateTime(performance.start_datetime)}@livemuseek.com`,
    start_datetime: performance.start_datetime,
    end_datetime: performance.end_datetime,
    summary: `${performance.busker_name || 'Busker'} at ${location.name}`,
    description: buildLocationEventDescription({ performance, location, siteUrl: resolvedSiteUrl }),
    location: [location.name, location.address].filter(Boolean).join(' - '),
    url: `${resolvedSiteUrl}/seek-locations/${location.location_id}`,
  }));

  downloadCalendarFile(
    `${slugify(location.name)}.ics`,
    buildIcsCalendar({
      calendarName: `${location.name} - LiveMuseek`,
      calendarDescription: `Upcoming performances for ${location.name} on LiveMuseek.`,
      events,
    })
  );
}

export function downloadBuskerCalendarIcs({ busker, performances, siteUrl }) {
  if (!busker) {
    return;
  }

  const resolvedSiteUrl = resolveSiteUrl(siteUrl);
  const events = mergeConsecutivePerformances(performances ?? []).map((performance) => ({
    uid: `busker-${busker.busker_id}-${performance.location_id}-${formatFloatingDateTime(performance.start_datetime)}@livemuseek.com`,
    start_datetime: performance.start_datetime,
    end_datetime: performance.end_datetime,
    summary: `${busker.name} at ${performance.location_name || 'Location'}`,
    description: buildBuskerEventDescription({ busker, performance, siteUrl: resolvedSiteUrl }),
    location: [performance.location_name, performance.location_address].filter(Boolean).join(' - '),
    url: `${resolvedSiteUrl}/seek-buskers/${busker.busker_id}`,
  }));

  downloadCalendarFile(
    `${slugify(busker.name)}.ics`,
    buildIcsCalendar({
      calendarName: `${busker.name} - LiveMuseek`,
      calendarDescription: `Upcoming performances for ${busker.name} on LiveMuseek.`,
      events,
    })
  );
}
