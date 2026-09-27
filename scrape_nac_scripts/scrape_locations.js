import cheerio from 'cheerio';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';
import { resolveLocationCoordinatesForRefresh } from '../app/server/location_geocoding.js';
import { createScraperSupabaseClient } from './supabase_client.js';

const BASE_URL = 'https://eservices.nac.gov.sg/Busking';
const INVALID_LOCATION_ID = '00000000-0000-0000-0000-000000000000';

export async function scrapeLocations() {
  const supabase = createScraperSupabaseClient();
  const { data: html } = await axios.get(BASE_URL);
  const $ = cheerio.load(html);
  const { data: existing, error } = await supabase.from('locations').select('location_id');
  if (error) throw new Error('Failed to read existing locations.');
  const existingIds = new Set((existing ?? []).map((location) => location.location_id));
  const missing = new Map();
  for (const option of $('#Location option').toArray()) {
    const id = $(option).val();
    if (id && id !== INVALID_LOCATION_ID && !existingIds.has(id)) missing.set(id, $(option).text().trim());
  }
  if (!missing.size) {
    console.log('No new locations found.');
    return { discoveredCount: 0 };
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    for (const [locationId, name] of missing) {
      await page.goto(`${BASE_URL}/locations/${locationId}/events`, { timeout: 60000 });
      const detail = cheerio.load(await page.content());
      const header = detail('#div-header');
      const address = header.find('ul').first().find('li.dash-bx-times').first().text().trim();
      const coordinates = await resolveLocationCoordinatesForRefresh(address);
      const location = {
        location_id: locationId, name, address,
        description: header.find('p').first().text().trim(),
        area: header.find('span').first().text().trim(), ...coordinates,
      };
      // Ignore a concurrent insert; never delete or rewrite existing locations/bookings.
      const { error: writeError } = await supabase.from('locations').upsert(location, {
        onConflict: 'location_id', ignoreDuplicates: true,
      });
      if (writeError) throw new Error(`Failed to save location ${locationId}.`);

      const imageResponse = await page.goto(`${BASE_URL}/booking/GetAppImage?id=${locationId}`, { timeout: 60000 });
      const contentType = imageResponse?.headers()['content-type'] ?? '';
      const image = imageResponse?.ok() && contentType.startsWith('image/') ? await imageResponse.buffer() : null;
      if (image?.length) {
        const { error: uploadError } = await supabase.storage.from('location_images')
          .upload(`${locationId}.jpg`, image, { contentType, upsert: true });
        if (uploadError) console.error(`Image upload failed for ${locationId}.`);
      }
      console.log(`Discovered location ${locationId}.`);
    }
  } finally {
    await browser.close();
  }
  return { discoveredCount: missing.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  nextEnv.loadEnvConfig(process.cwd());
  await scrapeLocations();
}
