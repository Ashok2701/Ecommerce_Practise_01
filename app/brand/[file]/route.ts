import { readClientFile } from '@/lib/server/clientConfig';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon' };

/** GET /brand/<file> -> client-config/brand/<file> (logo and other brand images). */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = TYPES[file.split('.').pop()?.toLowerCase() ?? ''];
  const buf = type ? await readClientFile('brand', file) : null;
  if (!buf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
}
