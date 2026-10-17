import { createSeed, type MockDb } from './seed';

/**
 * Mock repository store. Persists demo mutations to localStorage so changes
 * (approvals, new orders, replies ...) survive reloads during a demo.
 * Will be removed once services point at the Node.js backend.
 */
const KEY = 'nexus.mockdb.v4';
let db: MockDb | null = null;

export function getDb(): MockDb {
  if (db) return db;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        if (parsed.version === 4) return (db = parsed);
      }
    } catch {}
  }
  db = createSeed();
  return db;
}

export function commit() {
  if (typeof window !== 'undefined' && db) {
    try { window.localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  }
}

export function resetDb() {
  db = createSeed();
  commit();
}

export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
