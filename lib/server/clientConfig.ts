import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Client-editable files (settings, translation overrides, extra languages, logo)
 * live in CLIENT_CONFIG_DIR, read from disk on every request. On a server this
 * folder is a mounted volume, so clients edit it without rebuilding and upgrades
 * never overwrite it. Default: ./client-config next to the app.
 */
export const CLIENT_CONFIG_DIR = path.resolve(process.env.CLIENT_CONFIG_DIR || path.join(process.cwd(), 'client-config'));

const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9]+)?$/;

/** Read a file inside CLIENT_CONFIG_DIR. Returns null when missing or when the path is not allowed. */
export async function readClientFile(...parts: string[]): Promise<Buffer | null> {
  if (!parts.length || !parts.every((p) => SAFE.test(p))) return null;
  const full = path.resolve(CLIENT_CONFIG_DIR, ...parts);
  if (!full.startsWith(CLIENT_CONFIG_DIR + path.sep)) return null;
  try { return await readFile(full); } catch { return null; }
}

export async function readClientJson(...parts: string[]): Promise<unknown | null> {
  const buf = await readClientFile(...parts);
  if (!buf) return null;
  try { return JSON.parse(buf.toString('utf8')); } catch { return null; }
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' } });
