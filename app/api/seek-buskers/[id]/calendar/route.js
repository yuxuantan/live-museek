import { createBuskerCalendarResponse } from '../../../../server/calendar_ics.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    return await createBuskerCalendarResponse(params.id);
  } catch (error) {
    console.error('Failed to build busker calendar:', error);
    return Response.json({ error: 'Failed to generate calendar.' }, { status: 500 });
  }
}
