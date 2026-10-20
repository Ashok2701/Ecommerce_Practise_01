import { createSeed, type MockDb } from './seed';
import { getCurrentSite } from '@/lib/sites/current';
import type { Order, Product, SalesRequest } from '@/types/domain';

/**
 * Mock repository store. Persists demo mutations to localStorage so changes
 * (approvals, new orders, replies ...) survive reloads during a demo.
 * Will be removed once services point at the Node.js backend.
 */
const KEY = 'nexus.mockdb.v9';
let db: MockDb | null = null;

export function getDb(): MockDb {
  if (db) return db;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        if (parsed.version === 9) return (db = parsed);
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

/* ---- site scoping (mock stand-in for what the backend does per X-Site) ---- */

/** Product as seen from the current site: that site's stock and price list. */
export function atSite(p: Product, site = getCurrentSite()): Product {
  if (!site || !p.stockBySite) return p;
  const factor = getDb().sites.find((s) => s.code === site)?.priceFactor ?? 1;
  return { ...p, stock: p.stockBySite[site] ?? 0, basePrice: Math.round(p.basePrice * factor * 100) / 100 };
}

/** Orders that belong to the current site. */
export const inSite = (o: Pick<Order | SalesRequest, 'site'>, site = getCurrentSite()) => !site || !o.site || o.site === site;
