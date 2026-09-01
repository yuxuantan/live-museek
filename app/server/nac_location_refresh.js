import axios from 'axios';
import cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { Client } from '@googlemaps/google-maps-services-js';
import { createScraperSupabaseClient } from '../../scrape_nac_scripts/supabase_client.js';
import {
  countHistoricalPerformances,
  filterCurrentOrFuturePerformances,
} from '../../scrape_nac_scripts/performance_retention.js';

const ROOT_URL = 'https://eservices.nac.gov.sg';
const BUSKING_BASE_URL = `${ROOT_URL}/Busking`;
const INVALID_LOCATION_ID = '00000000-0000-0000-0000-000000000000';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyASRC3EeCzmTCsE_WjkDcywpCgZzSA395A';
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

const googleMapsClient = new Client({});
const refreshStateStore =
  globalThis.__liveMuseekRefreshStateStore ??
  (globalThis.__liveMuseekRefreshStateStore = new Map());
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

export class LocationRefreshError extends Error {
  constructor(message, status = 500, options = {}) {
    super(message);
    this.name = 'LocationRefreshError';
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toAbsoluteUrl(value) {
  if (!trimText(value)) {
    return '';
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${ROOT_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

function decodeNacHtmlPayload(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
    try {
      return JSON.parse(trimmedValue);
    } catch (error) {
      return trimmedValue;
    }
  }

  return trimmedValue;
}

function normalizeTextValue(value) {
  return trimText(value ?? '');
}

function normalizeNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateTimeValue(value) {
  if (!trimText(value ?? '')) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return normalizeTextValue(value);
  }

  return parsed.toISOString();
}

function normalizeJsonValue(value) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return JSON.stringify(value);
}

function summarizeErrorMessage(error) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.error_description,
  ]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function isMissingColumnError(error, columnName) {
  const message = summarizeErrorMessage(error);
  if (!message || !message.includes(String(columnName).toLowerCase())) {
    return false;
  }

  return message.includes('column') || message.includes('schema cache') || message.includes('does not exist');
}

function buildSupportedBuskerColumns(error = null) {
  return {
    bio: !isMissingColumnError(error, 'bio'),
    socials: !isMissingColumnError(error, 'socials'),
  };
}

function buildBuskerSelectColumns(supportedColumns = { bio: true, socials: true }) {
  return [
    'busker_id',
    'name',
    'act',
    'art_form',
    supportedColumns.bio ? 'bio' : null,
    supportedColumns.socials ? 'socials' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

function filterBuskerForStorage(busker, supportedColumns = { bio: true, socials: true }) {
  if (!busker) {
    return busker;
  }

  const nextBusker = {
    busker_id: busker.busker_id,
    name: busker.name,
    act: busker.act,
    art_form: busker.art_form,
  };

  if ('updated_at' in busker) {
    nextBusker.updated_at = busker.updated_at;
  }

  if (supportedColumns.bio && 'bio' in busker) {
    nextBusker.bio = busker.bio;
  }

  if (supportedColumns.socials && 'socials' in busker) {
    nextBusker.socials = busker.socials;
  }

  return nextBusker;
}

function buildBuskerUpsertAttempts(buskers, initialSupportedColumns = { bio: true, socials: true }) {
  const attempts = [];
  const seenKeys = new Set();
  const supportVariants = [
    initialSupportedColumns,
    { ...initialSupportedColumns, socials: false },
    { ...initialSupportedColumns, bio: false },
    { bio: false, socials: false },
  ];

  for (const supportedColumns of supportVariants) {
    const key = JSON.stringify(supportedColumns);
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    attempts.push(buskers.map((busker) => filterBuskerForStorage(busker, supportedColumns)));
  }

  return attempts;
}

async function upsertBuskersWithFallback(
  supabase,
  buskers,
  failureMessage,
  supportedColumns = { bio: true, socials: true }
) {
  let lastError = null;

  for (const payload of buildBuskerUpsertAttempts(buskers, supportedColumns)) {
    const upsertResponse = await supabase
      .from('buskers')
      .upsert(payload, { onConflict: 'busker_id' });

    if (!upsertResponse.error) {
      return;
    }

    lastError = upsertResponse.error;
    if (!isMissingColumnError(lastError, 'bio') && !isMissingColumnError(lastError, 'socials')) {
      break;
    }
  }

  console.error('Busker upsert failed:', lastError);
  throw new LocationRefreshError(failureMessage);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const sortedKeys = Object.keys(value).sort();
    return `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function areSnapshotsEqual(currentValue, nextValue) {
  return stableStringify(currentValue) === stableStringify(nextValue);
}

function normalizeLocationForCompare(location) {
  if (!location) {
    return null;
  }

  return {
    location_id: normalizeTextValue(location.location_id),
    name: normalizeTextValue(location.name),
    address: normalizeTextValue(location.address),
    area: normalizeTextValue(location.area),
    description: normalizeTextValue(location.description),
    lat: normalizeNullableNumber(location.lat),
    lng: normalizeNullableNumber(location.lng),
  };
}

function normalizeBuskerForCompare(busker) {
  if (!busker) {
    return null;
  }

  return {
    busker_id: normalizeTextValue(busker.busker_id),
    name: normalizeTextValue(busker.name),
    act: normalizeTextValue(busker.act),
    art_form: normalizeTextValue(busker.art_form),
    bio: typeof busker.bio === 'string' ? busker.bio : '',
    socials: normalizeJsonValue(busker.socials),
  };
}

function normalizePerformancesForCompare(performances) {
  return (performances ?? [])
    .map((performance) => ({
      busker_id: normalizeTextValue(performance.busker_id),
      location_id: normalizeTextValue(performance.location_id),
      start_datetime: normalizeDateTimeValue(performance.start_datetime),
      end_datetime: normalizeDateTimeValue(performance.end_datetime),
    }))
    .sort((left, right) =>
      [
        left.busker_id.localeCompare(right.busker_id),
        left.location_id.localeCompare(right.location_id),
        left.start_datetime.localeCompare(right.start_datetime),
        left.end_datetime.localeCompare(right.end_datetime),
      ].find((diff) => diff !== 0) ?? 0
    );
}

async function readCurrentLocationSnapshot(supabase, locationId) {
  const { data: locationData, error: locationError } = await supabase
    .from('locations')
    .select('location_id, name, address, area, description, lat, lng')
    .eq('location_id', locationId)
    .maybeSingle();

  if (locationError) {
    throw new LocationRefreshError('Failed to read current location data.');
  }

  const { data: performanceData, error: performanceError } = await supabase
    .from('performances')
    .select('busker_id, location_id, start_datetime, end_datetime')
    .eq('location_id', locationId);

  if (performanceError) {
    throw new LocationRefreshError('Failed to read current performances for this location.');
  }

  return {
    location: locationData,
    performances: performanceData ?? [],
  };
}

async function readCurrentBuskerSnapshot(supabase, buskerId) {
  let supportedColumns = { bio: true, socials: true };
  let buskerQuery = await supabase
    .from('buskers')
    .select(buildBuskerSelectColumns(supportedColumns))
    .eq('busker_id', buskerId)
    .maybeSingle();

  if (buskerQuery.error && (isMissingColumnError(buskerQuery.error, 'bio') || isMissingColumnError(buskerQuery.error, 'socials'))) {
    supportedColumns = buildSupportedBuskerColumns(buskerQuery.error);
    buskerQuery = await supabase
      .from('buskers')
      .select(buildBuskerSelectColumns(supportedColumns))
      .eq('busker_id', buskerId)
      .maybeSingle();
  }

  const { data: buskerData, error: buskerError } = buskerQuery;

  if (buskerError) {
    throw new LocationRefreshError('Failed to read current busker data.');
  }

  const { data: performanceData, error: performanceError } = await supabase
    .from('performances')
    .select('busker_id, location_id, start_datetime, end_datetime')
    .eq('busker_id', buskerId);

  if (performanceError) {
    throw new LocationRefreshError('Failed to read current performances for this busker.');
  }

  return {
    busker: filterBuskerForStorage(buskerData, supportedColumns),
    performances: performanceData ?? [],
    supportedColumns,
  };
}

function acquireRefreshLock(key) {
  const now = Date.now();
  const currentState = refreshStateStore.get(key);

  if (currentState?.inFlight) {
    throw new LocationRefreshError(
      'Refresh already in progress for this target.',
      429,
      { retryAfterSeconds: Math.max(1, Math.ceil(REFRESH_COOLDOWN_MS / 1000)) }
    );
  }

  if (currentState?.cooldownUntil && currentState.cooldownUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((currentState.cooldownUntil - now) / 1000));
    throw new LocationRefreshError(
      `Refresh cooldown active. Try again in ${retryAfterSeconds}s.`,
      429,
      { retryAfterSeconds }
    );
  }

  refreshStateStore.set(key, {
    inFlight: true,
    cooldownUntil: now + REFRESH_COOLDOWN_MS,
  });

  return () => {
    const existingState = refreshStateStore.get(key);
    const cooldownUntil = Date.now() + REFRESH_COOLDOWN_MS;

    refreshStateStore.set(key, {
      inFlight: false,
      cooldownUntil: Math.max(existingState?.cooldownUntil ?? 0, cooldownUntil),
    });
  };
}

async function withRefreshGuard(key, action) {
  const release = acquireRefreshLock(key);

  try {
    return await action();
  } finally {
    release();
  }
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: 60000,
    responseType: 'text',
    transformResponse: [(value) => value],
  });

  return decodeNacHtmlPayload(response.data);
}

function parseTimeValue(rawValue) {
  const normalized = String(rawValue ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/:(AM|PM)$/i, '$1');

  let match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(AM|PM)$/);
  if (match) {
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? 0);
    const meridiem = match[4];

    if (hours === 12) {
      hours = meridiem === 'AM' ? 0 : 12;
    } else if (meridiem === 'PM') {
      hours += 12;
    }

    return { hours, minutes, seconds };
  }

  match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return {
      hours: Number(match[1]),
      minutes: Number(match[2]),
      seconds: Number(match[3] ?? 0),
    };
  }

  return null;
}

function buildUtcTimestamp(dateText, timeText) {
  const normalizedDate = trimText(dateText)
    .replace(/^[A-Za-z]{3,9},\s*/, '')
    .replace(/,/g, ' ');
  const dateMatch = normalizedDate.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (!dateMatch) {
    return null;
  }

  const day = Number(dateMatch[1]);
  const monthIndex = MONTH_INDEX_BY_NAME[dateMatch[2].toLowerCase()];
  if (monthIndex == null) {
    return null;
  }

  const timeParts = parseTimeValue(timeText);
  if (!timeParts) {
    return null;
  }

  const year = new Date().getUTCFullYear();
  return new Date(
    Date.UTC(year, monthIndex, day, timeParts.hours, timeParts.minutes, timeParts.seconds)
  ).toISOString();
}

async function getLatLong(address) {
  if (!trimText(address) || !GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await googleMapsClient.geocode({
      params: {
        address,
        key: GOOGLE_MAPS_API_KEY,
      },
    });

    return response.data.results?.[0]?.geometry?.location ?? null;
  } catch (error) {
    console.error('Failed to geocode location address:', address, error);
    return null;
  }
}

async function uploadImageFromUrl(supabase, bucket, objectPath, imageUrl) {
  try {
    const absoluteUrl = toAbsoluteUrl(imageUrl);
    if (!absoluteUrl) {
      return;
    }

    const response = await axios.get(absoluteUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });

    const contentType = response.headers['content-type'] || 'image/jpg';
    const uploadResponse = await supabase.storage
      .from(bucket)
      .upload(objectPath, Buffer.from(response.data), { contentType, upsert: true });

    if (uploadResponse.error) {
      console.error(`Failed to upload ${bucket}/${objectPath}:`, uploadResponse.error);
    }
  } catch (error) {
    console.error(`Failed to fetch image ${imageUrl}:`, error);
  }
}

async function fetchLocationName(locationId) {
  const html = await fetchHtml(BUSKING_BASE_URL);
  const $ = cheerio.load(html);
  const matchingOption = $('#Location')
    .find('option')
    .toArray()
    .find((element) => trimText($(element).val()) === locationId);

  if (!matchingOption) {
    return null;
  }

  return trimText($(matchingOption).text());
}

async function expandAllPerformances(page) {
  while (true) {
    const moreButton = await page.$('#div-load-booking-grid-more');
    if (!moreButton) {
      return;
    }

    let isVisible = false;
    try {
      isVisible = await page.$eval('#div-load-booking-grid-more', (button) => {
        const style = window.getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });
    } catch (error) {
      return;
    }

    if (!isVisible) {
      return;
    }

    try {
      await page.click('#div-load-booking-grid-more');
      await sleep(1000);
    } catch (error) {
      console.error('Failed while expanding location performances:', error);
      return;
    }
  }
}

function extractPerformances(locationPage, locationId) {
  const performances = [];
  const events = locationPage('#div-booking-result-view');
  const eventCards = events.find('.col-cuttor');
  const profileLinks = events.find('a[href*="/profile/"]');
  const rowsToParse = eventCards.length > 0 ? eventCards : profileLinks;

  rowsToParse.each((index, element) => {
    const scope = eventCards.length > 0
      ? locationPage(element)
      : locationPage(element).closest('div');
    const profileUrl =
      scope.find('h3 a[href*="/profile/"]').attr('href') ??
      scope.find('a[href*="/profile/"]').attr('href');

    if (!profileUrl || !profileUrl.includes('/profile/')) {
      return;
    }

    const buskerId = profileUrl.split('/profile/')[1]?.split('?')[0]?.split('/')[0];
    const performanceTimes = scope.find('.dash-bx-times');
    const dateText = trimText(performanceTimes.children().first().text());
    const timeText = trimText(performanceTimes.children().eq(1).text());

    if (!buskerId || !dateText || !timeText) {
      return;
    }

    const normalizedTimeText = timeText
      .replace(/[–—]/g, '-')
      .replace(/\s*-\s*/g, '-');
    const [startTimeRaw, endTimeRaw] = normalizedTimeText.split('-');
    if (!startTimeRaw || !endTimeRaw) {
      return;
    }

    const startDateTime = buildUtcTimestamp(dateText, trimText(startTimeRaw));
    const endDateTime = buildUtcTimestamp(dateText, trimText(endTimeRaw));
    if (!startDateTime || !endDateTime) {
      return;
    }

    performances.push({
      busker_id: buskerId,
      location_id: locationId,
      start_datetime: startDateTime,
      end_datetime: endDateTime,
    });
  });

  return performances;
}

function extractLocationIdFromHref(href) {
  const match = String(href ?? '').match(/\/locations\/([^/]+)\/events/i);
  return match?.[1] ?? '';
}

async function scrapeLocationDetails(page, locationId, locationName) {
  const locationUrl = `${BUSKING_BASE_URL}/locations/${locationId}/events`;
  await page.goto(locationUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });

  const initialHtml = await page.content();
  const initialPage = cheerio.load(initialHtml);
  const locationHeader = initialPage('#div-header');

  const locationAddress = trimText(
    locationHeader.find('ul').first().find('li.dash-bx-times').first().text()
  );
  const locationDescription = trimText(locationHeader.find('p').first().text());
  const locationArea = trimText(locationHeader.find('span').first().text());
  const fallbackName = trimText(
    locationHeader.find('h1').first().text() || locationHeader.find('h2').first().text()
  );
  const latLong = await getLatLong(locationAddress);

  if (!initialHtml.includes('No Records found')) {
    await expandAllPerformances(page);
  }

  const finalHtml = await page.content();
  const finalPage = cheerio.load(finalHtml);

  return {
    location: {
      location_id: locationId,
      name: trimText(locationName) || fallbackName || locationId,
      address: locationAddress,
      description: locationDescription,
      area: locationArea,
      lat: latLong?.lat ?? null,
      lng: latLong?.lng ?? null,
    },
    performances: extractPerformances(finalPage, locationId),
  };
}

async function scrapeLocationSnapshot(page, locationId, locationName) {
  const resolvedLocationName = trimText(locationName) || await fetchLocationName(locationId);
  if (!resolvedLocationName) {
    throw new LocationRefreshError('Location not found in NAC directory.', 404);
  }

  return scrapeLocationDetails(page, locationId, resolvedLocationName);
}

async function scrapeMissingBuskers(supabase, page, performances) {
  const uniqueBuskerIds = [...new Set(
    performances
      .map((performance) => trimText(performance.busker_id))
      .filter(Boolean)
  )];

  if (uniqueBuskerIds.length === 0) {
    return { upsertedCount: 0, failedBuskerIds: [] };
  }

  const { data: existingBuskers, error: existingBuskersError } = await supabase
    .from('buskers')
    .select('busker_id')
    .in('busker_id', uniqueBuskerIds);

  if (existingBuskersError) {
    throw new LocationRefreshError('Failed to check existing buskers.');
  }

  const existingIds = new Set((existingBuskers ?? []).map((busker) => busker.busker_id));
  const missingBuskerIds = uniqueBuskerIds.filter((buskerId) => !existingIds.has(buskerId));

  if (missingBuskerIds.length === 0) {
    return { upsertedCount: 0, failedBuskerIds: [] };
  }

  const buskersToUpsert = [];
  const failedBuskerIds = [];

  for (const buskerId of missingBuskerIds) {
    try {
      const buskerUrl = `${BUSKING_BASE_URL}/busker/profile/${buskerId}`;
      await page.goto(buskerUrl, { timeout: 60000, waitUntil: 'domcontentloaded' });
      const html = await page.content();
      const $ = cheerio.load(html);
      const divHeader = $('#div-header');
      const name = trimText(divHeader.find('h2').text());
      const act = trimText(divHeader.find('span').text());
      const artForm = trimText(
        $('.card-details-bg').find('ul').find('li').eq(2).text().replace('Art Form: ', '')
      );
      const bio = divHeader.find('p').text();
      const socials = divHeader
        .find('li')
        .find('a')
        .map((index, element) => $(element).attr('href'))
        .get()
        .join(', ');
      const imageUrl = $('#profileImage').attr('src');

      if (!name || !act || !artForm) {
        failedBuskerIds.push(buskerId);
        continue;
      }

      buskersToUpsert.push({
        busker_id: buskerId,
        name,
        act,
        art_form: artForm,
        bio,
        socials,
        updated_at: new Date().toISOString(),
      });

      if (imageUrl) {
        await uploadImageFromUrl(
          supabase,
          'busker_images',
          `${buskerId}.jpg`,
          `${ROOT_URL}${imageUrl}`
        );
      }
    } catch (error) {
      console.error(`Failed to refresh busker ${buskerId}:`, error);
      failedBuskerIds.push(buskerId);
    }
  }

  if (buskersToUpsert.length === 0) {
    return { upsertedCount: 0, failedBuskerIds };
  }

  await upsertBuskersWithFallback(
    supabase,
    buskersToUpsert,
    'Failed to save refreshed buskers.'
  );

  return { upsertedCount: buskersToUpsert.length, failedBuskerIds };
}

async function fetchBuskerProfile(buskerId) {
  const buskerUrl = `${BUSKING_BASE_URL}/busker/profile/${buskerId}`;

  try {
    const html = await fetchHtml(buskerUrl);
    const $ = cheerio.load(html);
    const divHeader = $('#div-header');
    const socials = divHeader
      .find('li')
      .find('a')
      .map((index, element) => $(element).attr('href'))
      .get()
      .join(', ');
    const artForm = trimText(
      $('.card-details-bg').find('ul').find('li').eq(2).find('span').text()
    ) || trimText(
      $('.card-details-bg').find('ul').find('li').eq(2).text().replace('Art Form:', '')
    );

    const busker = {
      busker_id: buskerId,
      name: trimText(divHeader.find('h2').first().text()),
      act: trimText(divHeader.find('span').first().text()),
      art_form: artForm,
      bio: divHeader.find('p').first().text(),
      socials,
      updated_at: new Date().toISOString(),
    };

    return {
      busker,
      imageUrl: $('#profileImage').first().attr('src') ?? '',
    };
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404) {
      throw new LocationRefreshError('Busker not found in NAC directory.', 404);
    }

    throw error;
  }
}

async function fetchBuskerEventsHtml(buskerId) {
  const baseUrl = `${BUSKING_BASE_URL}/events/buskers/${buskerId}/public`;
  const initialHtml = await fetchHtml(baseUrl);
  const initialPage = cheerio.load(initialHtml);
  const take = Number(initialPage('#take').val() || 8);
  let skip = Number(initialPage('#skip').val() || 0);
  let combinedHtml = initialHtml;

  if (take <= 0 || initialPage('#div-load-booking-grid-more').length === 0) {
    return combinedHtml;
  }

  while (true) {
    const moreHtml = await fetchHtml(`${baseUrl}/more?skip=${skip}&take=${take}`);
    const morePage = cheerio.load(`<div id="nac-more-root">${moreHtml}</div>`);
    const moreCards = morePage('#nac-more-root').find('.col-cuttor');

    if (moreCards.length === 0) {
      break;
    }

    combinedHtml += moreHtml;
    skip += take;

    if (moreCards.length < take) {
      break;
    }
  }

  return combinedHtml;
}

function extractBuskerPerformances(eventsHtml, buskerId) {
  const page = cheerio.load(`<div id="nac-busker-events-root">${eventsHtml}</div>`);
  const performances = [];
  const locationRefs = new Map();
  const seenKeys = new Set();

  page('#nac-busker-events-root')
    .find('.col-cuttor')
    .each((index, element) => {
      const eventCard = page(element);
      const performanceTimes = eventCard.find('.dash-bx-times');
      const dateText = trimText(performanceTimes.find('li').eq(0).text());
      const timeText = trimText(
        performanceTimes.find('li').eq(1).find('span').text() ||
        performanceTimes.find('li').eq(1).text()
      );
      const locationLink = performanceTimes.find('li.address a');
      const locationName = trimText(locationLink.text());
      const locationId = extractLocationIdFromHref(locationLink.attr('href'));

      if (!dateText || !timeText || !locationId) {
        return;
      }

      const normalizedTimeText = timeText
        .replace(/[–—]/g, '-')
        .replace(/\s*-\s*/g, '-');
      const [startTimeRaw, endTimeRaw] = normalizedTimeText.split('-');
      if (!startTimeRaw || !endTimeRaw) {
        return;
      }

      const startDateTime = buildUtcTimestamp(dateText, trimText(startTimeRaw));
      const endDateTime = buildUtcTimestamp(dateText, trimText(endTimeRaw));
      if (!startDateTime || !endDateTime) {
        return;
      }

      const dedupeKey = `${locationId}:${startDateTime}:${endDateTime}`;
      if (seenKeys.has(dedupeKey)) {
        return;
      }

      seenKeys.add(dedupeKey);
      performances.push({
        busker_id: buskerId,
        location_id: locationId,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
      });

      locationRefs.set(locationId, {
        location_id: locationId,
        name: locationName || locationId,
      });
    });

  return {
    performances,
    locationRefs: [...locationRefs.values()],
  };
}

async function ensureLocationRows(supabase, locationRefs) {
  if (locationRefs.length === 0) {
    return { refreshedCount: 0, fallbackCount: 0, failedLocationIds: [] };
  }

  const locationIds = locationRefs.map((location) => location.location_id);
  const { data: existingLocations, error: existingLocationsError } = await supabase
    .from('locations')
    .select('location_id')
    .in('location_id', locationIds);

  if (existingLocationsError) {
    throw new LocationRefreshError('Failed to check existing locations.');
  }

  const existingLocationIds = new Set((existingLocations ?? []).map((location) => location.location_id));
  const missingLocations = locationRefs.filter((location) => !existingLocationIds.has(location.location_id));

  if (missingLocations.length === 0) {
    return { refreshedCount: 0, fallbackCount: 0, failedLocationIds: [] };
  }

  async function upsertFallbackLocations(locationsToFallback, failedLocationIds) {
    let fallbackCount = 0;

    for (const locationRef of locationsToFallback) {
      const fallbackResponse = await supabase
        .from('locations')
        .upsert(
          {
            location_id: locationRef.location_id,
            name: locationRef.name,
          },
          { onConflict: 'location_id' }
        );

      if (fallbackResponse.error) {
        console.error(`Failed to save fallback location ${locationRef.location_id}:`, fallbackResponse.error);
        failedLocationIds.push(locationRef.location_id);
        continue;
      }

      fallbackCount += 1;
    }

    return fallbackCount;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (error) {
    console.error('Failed to launch Puppeteer for referenced busker locations. Falling back to minimal location rows.', error);
    const failedLocationIds = [];
    const fallbackCount = await upsertFallbackLocations(missingLocations, failedLocationIds);
    return { refreshedCount: 0, fallbackCount, failedLocationIds };
  }

  let refreshedCount = 0;
  let fallbackCount = 0;
  const failedLocationIds = [];

  try {
    const page = await browser.newPage();

    for (const locationRef of missingLocations) {
      try {
        const snapshot = await scrapeLocationSnapshot(page, locationRef.location_id, locationRef.name);
        const locationUpsertResponse = await supabase
          .from('locations')
          .upsert(snapshot.location, { onConflict: 'location_id' });

        if (locationUpsertResponse.error) {
          throw new LocationRefreshError('Failed to save refreshed location.');
        }

        await uploadImageFromUrl(
          supabase,
          'location_images',
          `${locationRef.location_id}.jpg`,
          `${BUSKING_BASE_URL}/booking/GetAppImage?id=${locationRef.location_id}`
        );

        refreshedCount += 1;
      } catch (error) {
        console.error(`Failed to refresh referenced location ${locationRef.location_id}:`, error);
        fallbackCount += await upsertFallbackLocations([locationRef], failedLocationIds);
      }
    }
  } finally {
    await browser.close();
  }

  return { refreshedCount, fallbackCount, failedLocationIds };
}

export async function refreshLocationById(locationId) {
  const normalizedLocationId = trimText(locationId);
  if (!normalizedLocationId || normalizedLocationId === INVALID_LOCATION_ID) {
    throw new LocationRefreshError('Invalid location id.', 400);
  }

  return withRefreshGuard(`location:${normalizedLocationId}`, async () => {
    const supabase = createScraperSupabaseClient();
    const refreshCutoff = new Date();
    const refreshCutoffIso = refreshCutoff.toISOString();
    const locationName = await fetchLocationName(normalizedLocationId);

    if (!locationName) {
      throw new LocationRefreshError('Location not found in NAC directory.', 404);
    }

    const currentSnapshot = await readCurrentLocationSnapshot(supabase, normalizedLocationId);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const { location, performances } = await scrapeLocationSnapshot(page, normalizedLocationId, locationName);
      const currentOrFuturePerformances = filterCurrentOrFuturePerformances(performances, refreshCutoff);
      const existingCurrentOrFuturePerformances = filterCurrentOrFuturePerformances(
        currentSnapshot.performances,
        refreshCutoff
      );
      const historicalPerformanceCountPreserved = countHistoricalPerformances(
        currentSnapshot.performances,
        refreshCutoff
      );

      const locationChanged = !areSnapshotsEqual(
        normalizeLocationForCompare(currentSnapshot.location),
        normalizeLocationForCompare(location)
      );
      const performancesChanged = !areSnapshotsEqual(
        normalizePerformancesForCompare(existingCurrentOrFuturePerformances),
        normalizePerformancesForCompare(currentOrFuturePerformances)
      );

      if (!locationChanged) {
        // Skip redundant writes when the snapshot matches the existing row.
      } else {
        const locationUpsertResponse = await supabase
          .from('locations')
          .upsert(location, { onConflict: 'location_id' });

        if (locationUpsertResponse.error) {
          throw new LocationRefreshError('Failed to save refreshed location.');
        }

        await uploadImageFromUrl(
          supabase,
          'location_images',
          `${normalizedLocationId}.jpg`,
          `${BUSKING_BASE_URL}/booking/GetAppImage?id=${normalizedLocationId}`
        );
      }

      if (performancesChanged) {
        const deleteResponse = await supabase
          .from('performances')
          .delete()
          .eq('location_id', normalizedLocationId)
          .gte('end_datetime', refreshCutoffIso);

        if (deleteResponse.error) {
          throw new LocationRefreshError('Failed to clear existing performances for this location.');
        }

        if (currentOrFuturePerformances.length > 0) {
          const insertResponse = await supabase.from('performances').insert(currentOrFuturePerformances);
          if (insertResponse.error) {
            throw new LocationRefreshError('Failed to save refreshed performances.');
          }
        }
      }

      const buskerRefreshSummary = await scrapeMissingBuskers(supabase, page, currentOrFuturePerformances);

      return {
        location,
        performanceCount: currentOrFuturePerformances.length,
        historicalPerformanceCountPreserved,
        buskersUpserted: buskerRefreshSummary.upsertedCount,
        failedBuskerIds: buskerRefreshSummary.failedBuskerIds,
        changed: {
          location: locationChanged,
          performances: performancesChanged,
        },
      };
    } finally {
      await browser.close();
    }
  });
}

export async function refreshBuskerById(buskerId) {
  const normalizedBuskerId = trimText(buskerId);
  if (!normalizedBuskerId || normalizedBuskerId === INVALID_LOCATION_ID) {
    throw new LocationRefreshError('Invalid busker id.', 400);
  }

  return withRefreshGuard(`busker:${normalizedBuskerId}`, async () => {
    const supabase = createScraperSupabaseClient();
    const refreshCutoff = new Date();
    const refreshCutoffIso = refreshCutoff.toISOString();
    const currentSnapshot = await readCurrentBuskerSnapshot(supabase, normalizedBuskerId);
    const { busker, imageUrl } = await fetchBuskerProfile(normalizedBuskerId);
    const nextBusker = filterBuskerForStorage(busker, currentSnapshot.supportedColumns);
    if (!busker.name || !busker.act || !busker.art_form) {
      throw new LocationRefreshError('Failed to parse the busker profile from NAC.');
    }

    const eventsHtml = await fetchBuskerEventsHtml(normalizedBuskerId);
    const { performances, locationRefs } = extractBuskerPerformances(eventsHtml, normalizedBuskerId);
    const currentOrFuturePerformances = filterCurrentOrFuturePerformances(performances, refreshCutoff);
    const existingCurrentOrFuturePerformances = filterCurrentOrFuturePerformances(
      currentSnapshot.performances,
      refreshCutoff
    );
    const historicalPerformanceCountPreserved = countHistoricalPerformances(
      currentSnapshot.performances,
      refreshCutoff
    );
    const locationRefreshSummary = await ensureLocationRows(supabase, locationRefs);

    const buskerChanged = !areSnapshotsEqual(
      normalizeBuskerForCompare(currentSnapshot.busker),
      normalizeBuskerForCompare(nextBusker)
    );
    const performancesChanged = !areSnapshotsEqual(
      normalizePerformancesForCompare(existingCurrentOrFuturePerformances),
      normalizePerformancesForCompare(currentOrFuturePerformances)
    );

    if (buskerChanged) {
      await upsertBuskersWithFallback(
        supabase,
        [nextBusker],
        'Failed to save refreshed busker.',
        currentSnapshot.supportedColumns
      );

      if (imageUrl) {
        await uploadImageFromUrl(
          supabase,
          'busker_images',
          `${normalizedBuskerId}.jpg`,
          imageUrl
        );
      }
    }

    if (performancesChanged) {
      const deleteResponse = await supabase
        .from('performances')
        .delete()
        .eq('busker_id', normalizedBuskerId)
        .gte('end_datetime', refreshCutoffIso);

      if (deleteResponse.error) {
        throw new LocationRefreshError('Failed to clear existing performances for this busker.');
      }

      if (currentOrFuturePerformances.length > 0) {
        const insertResponse = await supabase.from('performances').insert(currentOrFuturePerformances);
        if (insertResponse.error) {
          throw new LocationRefreshError('Failed to save refreshed busker performances.');
        }
      }
    }

    return {
      busker: nextBusker,
      performanceCount: currentOrFuturePerformances.length,
      historicalPerformanceCountPreserved,
      locationsRefreshed: locationRefreshSummary.refreshedCount,
      fallbackLocations: locationRefreshSummary.fallbackCount,
      failedLocationIds: locationRefreshSummary.failedLocationIds,
      changed: {
        busker: buskerChanged,
        performances: performancesChanged,
      },
    };
  });
}
