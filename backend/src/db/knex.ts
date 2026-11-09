import * as fs from 'fs';
import * as path from 'path';
import knexFactory, { Knex } from 'knex';
import type { DbConfig } from '../config';

/** Knex connection for SQL Server (production) or SQLite (development and tests). */
export function createKnex(cfg: DbConfig, opts: { readOnly?: boolean } = {}): Knex {
  if (cfg.client === 'sqlite') {
    const file = cfg.file === ':memory:' ? ':memory:' : path.resolve(cfg.file ?? './data/dev.db');
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    return knexFactory({
      client: 'better-sqlite3',
      connection: { filename: file },
      useNullAsDefault: true,
      pool: {
        min: 1, max: 1,
        afterCreate: (conn: { pragma: (s: string) => void }, done: (e: Error | null, c: unknown) => void) => {
          conn.pragma('journal_mode = WAL');
          conn.pragma('foreign_keys = ON');
          done(null, conn);
        },
      },
    });
  }
  return knexFactory({
    client: 'mssql',
    connection: {
      server: cfg.host!, port: cfg.port, database: cfg.database, user: cfg.user, password: cfg.password,
      options: { encrypt: cfg.encrypt, trustServerCertificate: cfg.trustCert, readOnlyIntent: opts.readOnly, enableArithAbort: true } as unknown as string,
    },
    pool: { min: 0, max: 10 },
  });
}

export const isSqlite = (k: Knex) => (k.client.config.client as string).includes('sqlite');
