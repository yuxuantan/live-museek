import fs from 'node:fs/promises';
import path from 'node:path';
import { getRequestHostname, isLocalhostHostname } from '../../refreshAccess.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SNAPSHOT_PATH = path.resolve(process.cwd(), '.local/nac-slot-universe-snapshot.json');

export async function GET(request) {
  if (!isLocalhostHostname(getRequestHostname(request))) {
    return Response.json(
      { error: 'Insights are only available on localhost.' },
      { status: 403 }
    );
  }

  try {
    const fileContents = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    const payload = JSON.parse(fileContents);

    return Response.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const code = error?.code === 'ENOENT' ? 404 : 500;
    const message =
      error?.code === 'ENOENT'
        ? 'Insights snapshot not found. Run `npm run nac:slot-universe --` first.'
        : error instanceof Error
          ? error.message
          : 'Failed to read insights snapshot.';

    return Response.json({ error: message }, { status: code });
  }
}
