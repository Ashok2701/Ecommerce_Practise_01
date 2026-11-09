import * as fs from 'fs';
import * as path from 'path';

/** Load KEY=VALUE lines from backend/.env (if present) without overriding real environment variables. */
function loadDotEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const env = (k: string, d = '') => process.env[k] ?? d;
const bool = (k: string, d = false) => (process.env[k] === undefined ? d : /^(1|true|yes)$/i.test(process.env[k]!));
const num = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

export type DbClient = 'mssql' | 'sqlite';

export interface DbConfig {
  client: DbClient;
  host?: string; port?: number; database?: string; user?: string; password?: string; encrypt?: boolean; trustCert?: boolean;
  file?: string;
}

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  jwtSecret: string;
  jwtTtlHours: number;
  portalDb: DbConfig;
  x3: {
    mode: 'live' | 'sim';
    db: DbConfig;
    folderSchema: string;
    viewSchema: string;
    ws: { url: string; pool: string; user: string; password: string; lang: string; timeoutMs: number };
  };
  seedDemo: boolean;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const portalClient = env('PORTAL_DB_CLIENT', 'sqlite') as DbClient;
  const x3Mode = env('X3_MODE', 'sim') as 'live' | 'sim';
  const x3Client = env('X3_DB_CLIENT', x3Mode === 'sim' ? 'sqlite' : 'mssql') as DbClient;
  const cfg: AppConfig = {
    port: num('PORT', 4000),
    corsOrigins: env('CORS_ORIGINS', 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
    jwtSecret: env('JWT_SECRET', 'dev-only-secret-change-me'),
    jwtTtlHours: num('JWT_TTL_HOURS', 12),
    portalDb: {
      client: portalClient,
      host: env('PORTAL_DB_HOST'), port: num('PORTAL_DB_PORT', 1433), database: env('PORTAL_DB_NAME', 'NexusPortal'),
      user: env('PORTAL_DB_USER'), password: env('PORTAL_DB_PASSWORD'), encrypt: bool('PORTAL_DB_ENCRYPT', true), trustCert: bool('PORTAL_DB_TRUST_CERT'),
      file: env('PORTAL_DB_FILE', './data/portal.db'),
    },
    x3: {
      mode: x3Mode,
      db: {
        client: x3Client,
        host: env('X3_DB_HOST'), port: num('X3_DB_PORT', 1433), database: env('X3_DB_NAME'),
        user: env('X3_DB_USER'), password: env('X3_DB_PASSWORD'), encrypt: bool('X3_DB_ENCRYPT', true), trustCert: bool('X3_DB_TRUST_CERT'),
        file: env('X3_DB_FILE', './data/x3sim.db'),
      },
      folderSchema: env('X3_FOLDER_SCHEMA', x3Client === 'sqlite' ? '' : 'SEED'),
      viewSchema: env('X3_VIEW_SCHEMA', x3Client === 'sqlite' ? '' : 'NEXUS'),
      ws: {
        url: env('X3_WS_URL'), pool: env('X3_WS_POOL', 'NEXUS'), user: env('X3_WS_USER'), password: env('X3_WS_PASSWORD'),
        lang: env('X3_WS_LANG', 'ENG'), timeoutMs: num('X3_WS_TIMEOUT_MS', 30000),
      },
    },
    seedDemo: bool('SEED_DEMO', x3Mode === 'sim'),
  };
  return { ...cfg, ...overrides };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
