export const normalizeAddress = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function validSingaporeCoordinates(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
    Number(lat) >= 1.144 && Number(lat) <= 1.494 &&
    Number(lng) >= 103.535 && Number(lng) <= 104.502;
}

export function hasCoordinates(location) {
  return validSingaporeCoordinates(location?.lat, location?.lng);
}

export function retainUnchangedCoordinates(address, existing) {
  if (normalizeAddress(address) && normalizeAddress(address) === normalizeAddress(existing?.address) && hasCoordinates(existing)) {
    return { lat: Number(existing.lat), lng: Number(existing.lng) };
  }
  return { lat: null, lng: null };
}

export function directionsUrl(location) {
  const destination = [location?.name ?? location?.location_name, location?.address ?? location?.location_address, 'Singapore']
    .filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
