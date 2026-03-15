import { LocationRefreshError, refreshLocationById } from '../../../../server/nac_location_refresh.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  try {
    const result = await refreshLocationById(params.id);

    return Response.json({
      ok: true,
      location: result.location,
      performanceCount: result.performanceCount,
      buskersUpserted: result.buskersUpserted,
      failedBuskerIds: result.failedBuskerIds,
      changed: result.changed,
    });
  } catch (error) {
    console.error('Location refresh failed:', error);

    const status = error instanceof LocationRefreshError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : 'Failed to refresh location.';
    const headers = {};

    if (error instanceof LocationRefreshError && error.retryAfterSeconds) {
      headers['Retry-After'] = String(error.retryAfterSeconds);
    }

    return Response.json({ error: message }, { status, headers });
  }
}
