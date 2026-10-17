import { jsonResponse, readClientJson } from '@/lib/server/clientConfig';

export const dynamic = 'force-dynamic';

/**
 * GET /i18n/<lang>.json            -> client-config/i18n/<lang>.json            (client-added language; 404 when absent)
 * GET /i18n/overrides/<lang>.json  -> client-config/i18n/overrides/<lang>.json  (client wording; {} when absent)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const isOverride = path.length === 2 && path[0] === 'overrides';
  if (!(path.length === 1 || isOverride) || !path[path.length - 1].endsWith('.json')) return jsonResponse({ error: 'not found' }, 404);
  const data = await readClientJson('i18n', ...path);
  if (data && typeof data === 'object') return jsonResponse(data);
  return isOverride ? jsonResponse({}) : jsonResponse({ error: 'not found' }, 404);
}
