import { createLocationCalendarResponse } from '../../../../server/calendar_ics.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    return await createLocationCalendarResponse(params.id);
  } catch (error) {
    console.error('Failed to build location calendar:', error);
    return Response.json({ error: 'Failed to generate calendar.' }, { status: 500 });
  }
}
