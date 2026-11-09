# Nexus B2B API

The backend for the Nexus portal: NestJS on Node 20+, its own SQL Server database for
portal data, and Sage X3 as the ERP.

```
 Portal (Next.js PWA)  ──HTTPS + JWT + X-Site──▶  Nexus API (NestJS)
                                                   │
                     portal data (users, requests, │ quotes, POD, transfers …)
                                 SQL Server  ◀─────┤
                                                   │ read:  NX_* views (read-only login)
                                Sage X3 DB   ◀─────┤
                                                   │ write: X3 SOAP web services
                          X3 web services   ◀─────┘
```

* **Reads from X3** go through the read-only `NX_*` views in `src/x3/views.sql` (items,
  stock, customers, price lists, sales orders, deliveries, invoices, receipts, suppliers,
  purchase orders, stock journal). The API never reads X3 tables directly and never writes
  to the X3 database.
* **Changes to X3** go through X3 web services (`src/x3/soap-gateway.ts`): sales orders,
  closing an order, purchase orders, goods receipts, customer receipts, inter-site
  transfers and location transfers (consignment). Every call carries the portal's own
  reference, so a retry after a time-out finds the document X3 already created instead of
  creating a second one. Every call is logged in `erp_calls`.
* **Portal data** (users, module access, workflow rules, sales requests, quotes, payment
  advices, collection notes, purchase requests, transfers, consignment agreements,
  announcements, messages, notifications, follow-ups, visit reports, and the portal's
  additions to X3 documents such as proof of delivery and supplier pickup details) lives
  in the portal database. Each change is written to `audit_log`.

The API is the contract in `../docs/API_CONTRACT.md`; the business rules are the same as
the portal's mock (they share `lib/domain/pricing.ts`, `lib/domain/credit.ts`,
`lib/access/moduleRules.ts` and `types/domain.ts`).

## Run it locally (no SQL Server, no X3 needed)

```bash
cd backend
npm install
npm run dev            # builds, then starts on :4000 with SQLite and the simulated X3
```

With no `.env`, the API uses SQLite files in `backend/data/` and a **simulated Sage X3**
(same tables and the same `NX_*` views, on SQLite), loaded with the demo company. Every
demo user's password is `demo123` (for example `manager@nexusb2b.in`).

Point the portal at it:

```bash
# in the repository root
NEXT_PUBLIC_DATA_SOURCE=api NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 NEXT_PUBLIC_X3_SIM=true npm run dev
```

`NEXT_PUBLIC_X3_SIM=true` shows the "advance status" button on orders, which stands in
for the warehouse working in X3 (`POST /sim/orders/:id/advance`, simulation only).

Delete `backend/data/` to start again from the demo data.

## Tests

```bash
npm test               # 20 end-to-end tests on in-memory SQLite + simulated X3, and the SOAP client
npm run typecheck
```

The end-to-end tests walk the real HTTP API: sign-in and access rules, data scope,
request → sales order (idempotent), price-change and credit rules, B2C auto-conversion,
free goods, dispatch → proof of delivery → remittance advice → verification, quotes and
the rep discount limit, transfers, consignment call-offs and top-ups, supplier pickup →
purchase order → goods receipts, offers visibility and notifications.

## Run it against SQL Server and Sage X3

See `../docs/X3_INTEGRATION.md` for the full checklist. In short:

1. Copy `.env.example` to `.env` and fill in `PORTAL_DB_*`, `X3_DB_*`, `X3_WS_*`, a long
   random `JWT_SECRET` and `CORS_ORIGINS` (the portal's URL). Set `X3_MODE=live`.
2. Create an empty SQL Server database for the portal and a login that owns it, then
   `npm run db:migrate`.
3. With a login allowed to create views in the X3 database, `npm run x3:views`; then give
   the API's X3 login `SELECT` on the `NEXUS` schema only.
4. Publish the X3 web services listed in `src/x3/soap-gateway.ts` on the pool in `X3_WS_POOL`.
5. Create the first users (see "Users" in `docs/X3_INTEGRATION.md`), then `npm start`.
6. `GET /health` shows whether the portal database and the X3 views answer.

## Layout

```
src/
  main.ts, app.module.ts     start-up, wiring, CORS, body limits
  config.ts                  environment variables (.env.example)
  controllers.ts             every HTTP route, with its module access rule
  common/                    sign-in guard (JWT, X-Site, module access), errors, users
  db/                        portal schema (migrations), document store, transactions
  services/                  business rules, one file per area
  x3/views.sql               the NX_* read views (SQL Server and SQLite)
  x3/x3-reader.ts            reads the views
  x3/soap-gateway.ts         X3 web services (live)
  x3/sim/                    simulated X3 tables and gateway (development and tests)
  seed/demo-seed.ts          demo company for development and tests
test/                        Jest end-to-end and unit tests
```
