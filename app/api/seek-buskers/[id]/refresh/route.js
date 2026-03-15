import { LocationRefreshError, refreshBuskerById } from '../../../../server/nac_location_refresh.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request, { params }) {
  try {
    const result = await refreshBuskerById(params.id);

    return Response.json({
      ok: true,
      busker: result.busker,
      performanceCount: result.performanceCount,
      locationsRefreshed: result.locationsRefreshed,
      fallbackLocations: result.fallbackLocations,
      failedLocationIds: result.failedLocationIds,
      changed: result.changed,
    });
  } catch (error) {
    console.error('Busker refresh failed:', error);

    const status = error instanceof LocationRefreshError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : 'Failed to refresh busker.';
    const headers = {};

    if (error instanceof LocationRefreshError && error.retryAfterSeconds) {
      headers['Retry-After'] = String(error.retryAfterSeconds);
    }

    return Response.json({ error: message }, { status, headers });
  }
}
