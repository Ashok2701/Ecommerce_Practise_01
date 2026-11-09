import type { Knex } from 'knex';

/**
 * Portal database schema (SQL Server in production, SQLite in tests).
 *
 * Portal-owned business documents (sales requests, quotes, transfers, ...) are
 * stored as one row per document: the columns used for filtering and access
 * checks are real columns with indexes, and the full document (lines, timeline,
 * comments) is a JSON column, which keeps the API shapes in types/domain.ts
 * exact. ERP data (items, stock, customers, orders, invoices, purchase orders)
 * is NOT copied here: it is read live from Sage X3; only the portal's own
 * additions to an ERP record (comments, proof of delivery, supplier pickup
 * details...) are kept, in the *_ext tables.
 */
export const DOC_TABLES = [
  'sales_requests', 'quotes', 'payments', 'collection_notes', 'purchase_requests', 'transfers', 'consignments',
  'announcements', 'conversations', 'notifications', 'follow_ups', 'visits', 'visit_reports', 'activity',
  'order_ext', 'delivery_ext', 'po_ext', 'offers', 'offer_presentation', 'product_content',
] as const;
export type DocTable = (typeof DOC_TABLES)[number];

interface Migration { id: string; up: (k: Knex) => Promise<void> }

const MIGRATIONS: Migration[] = [
  {
    id: '001_initial',
    up: async (k) => {
      await k.schema.createTable('users', (t) => {
        t.string('id', 64).primary();
        t.string('email', 200).notNullable().unique();
        t.string('password_hash', 200).notNullable();
        t.string('name', 200).notNullable();
        t.string('phone', 60);
        t.string('role', 30).notNullable().index();
        t.string('status', 20).notNullable().index();
        t.string('title', 200);
        t.string('region', 200);
        t.string('customer_id', 40).index();   // X3 BPCNUM for customer logins
        t.string('supplier_id', 40).index();   // X3 BPSNUM for supplier logins
        t.string('erp_code', 40);              // X3 code this login maps to (customer, supplier or sales rep REPNUM)
        t.text('allowed_sites');               // JSON array of site codes
        t.string('default_site', 20);
        t.decimal('monthly_target', 18, 2);
        t.string('created_at', 30).notNullable();
        t.string('last_login_at', 30);
        t.integer('failed_logins').notNullable().defaultTo(0);
      });
      await k.schema.createTable('role_modules', (t) => {
        t.string('role', 30).primary();
        t.text('modules').notNullable(); // JSON array of module ids
        t.string('updated_at', 30);
        t.string('updated_by', 200);
      });
      await k.schema.createTable('settings', (t) => {
        t.string('key', 60).primary();
        t.text('value').notNullable(); // JSON
        t.string('updated_at', 30);
        t.string('updated_by', 200);
      });
      await k.schema.createTable('sequences', (t) => {
        t.string('name', 40).primary();
        t.integer('next_value').notNullable();
      });
      for (const name of DOC_TABLES) {
        await k.schema.createTable(name, (t) => {
          t.string('id', 64).primary();
          t.string('number', 60).index();
          t.string('site', 20).index();
          t.string('customer_id', 40).index();
          t.string('party_id', 64).index(); // sales rep, supplier or user, depending on the table
          t.string('status', 30).index();
          t.string('at', 30).index();       // ISO-8601 UTC; sorts as text
          t.text('doc').notNullable();      // the full document as JSON (types/domain.ts)
          t.integer('version').notNullable().defaultTo(1);
          t.string('updated_at', 30).notNullable();
        });
      }
      await k.schema.createTable('audit_log', (t) => {
        t.increments('id').primary();
        t.string('at', 30).notNullable().index();
        t.string('user_id', 64);
        t.string('user_name', 200);
        t.string('site', 20);
        t.string('action', 80).notNullable();
        t.string('entity', 40).notNullable();
        t.string('entity_id', 64).index();
        t.text('detail'); // JSON: what changed
      });
      await k.schema.createTable('idempotency', (t) => {
        t.string('key', 120).primary();
        t.string('scope', 60).notNullable();
        t.string('result_id', 64);
        t.string('created_at', 30).notNullable();
      });
      // Every call to the ERP web services, for support and retries.
      await k.schema.createTable('erp_calls', (t) => {
        t.increments('id').primary();
        t.string('at', 30).notNullable().index();
        t.string('operation', 60).notNullable();
        t.string('ref', 120).index();
        t.string('status', 20).notNullable(); // ok | failed
        t.string('erp_ref', 60);
        t.text('request');
        t.text('response');
        t.integer('duration_ms');
      });
    },
  },
];

export async function migrate(k: Knex): Promise<string[]> {
  if (!(await k.schema.hasTable('schema_migrations'))) {
    await k.schema.createTable('schema_migrations', (t) => { t.string('id', 80).primary(); t.string('applied_at', 30).notNullable(); });
  }
  const done = new Set((await k('schema_migrations').select('id')).map((r: { id: string }) => r.id));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await k.transaction(async (trx) => {
      await m.up(trx);
      await trx('schema_migrations').insert({ id: m.id, applied_at: new Date().toISOString() });
    });
    applied.push(m.id);
  }
  return applied;
}
