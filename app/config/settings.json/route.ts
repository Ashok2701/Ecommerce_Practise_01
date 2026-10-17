import { jsonResponse, readClientJson } from '@/lib/server/clientConfig';

export const dynamic = 'force-dynamic';

/** GET /config/settings.json -> client-config/settings.json (empty object when absent: defaults apply). */
export async function GET() {
  return jsonResponse((await readClientJson('settings.json')) ?? {});
}
