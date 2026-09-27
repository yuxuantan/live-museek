import { Client } from '@googlemaps/google-maps-services-js';
import { hasCoordinates, normalizeAddress, retainUnchangedCoordinates } from '../locationCoordinates.js';

const googleMapsClient = new Client({});

export function createLocationGeocoder({ env = process.env, client = googleMapsClient } = {}) {
  const inFlight = new Map();

  async function lookup(address) {
    // Prefer a separate server key; retain compatibility with existing local configuration.
    const key = env.GOOGLE_MAPS_API_KEY || env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error('Google geocoding is not configured.');
    const response = await client.geocode({ params: { address, region: 'sg', key }, timeout: 10000 });
    if (response.data.status === 'ZERO_RESULTS') return { lat: null, lng: null };
    if (response.data.status !== 'OK') throw new Error('Google geocoding failed.');
    const coordinates = response.data.results?.[0]?.geometry?.location;
    if (!hasCoordinates(coordinates)) throw new Error('Google returned invalid coordinates.');
    return { lat: Number(coordinates.lat), lng: Number(coordinates.lng) };
  }

  return async function resolveCoordinates(address, existing) {
    const saved = retainUnchangedCoordinates(address, existing);
    if (hasCoordinates(saved)) return saved;
    if (!normalizeAddress(address)) return { lat: null, lng: null };
    const normalized = normalizeAddress(address);
    if (!inFlight.has(normalized)) {
      inFlight.set(normalized, lookup(address).finally(() => inFlight.delete(normalized)));
    }
    return inFlight.get(normalized);
  };
}

export const resolveLocationCoordinates = createLocationGeocoder();

export async function resolveLocationCoordinatesForRefresh(address, existing) {
  try {
    return await resolveLocationCoordinates(address, existing);
  } catch {
    // Never log SDK error objects: they may contain the API key in request parameters.
    console.error('Address lookup unavailable; continuing the schedule refresh.');
    return retainUnchangedCoordinates(address, existing);
  }
}
