# Nexus B2B – ERP Customer & Sales PWA (V1 prototype)

## Scope
Frontend-only (Next.js 15 App Router + TypeScript + Tailwind/shadcn). No backend/DB/ERP by design. All data is MOCKED behind a service layer.

## Architecture
UI (app/(app)/*, features/*, components/*) → Services (lib/services/*) → `source(mock, api)` switch (lib/api/httpClient.ts) → Mock repository (lib/data/seed.ts + mockDb.ts, persisted to localStorage).
Set NEXT_PUBLIC_DATA_SOURCE=api + NEXT_PUBLIC_API_BASE_URL to hit the Node.js backend (→ ERP adapter → Sage X3).
- Auth: lib/auth (AuthProvider, permissions.ts route ACL + role nav)
- Cart: lib/cart/CartProvider (customer-scoped, customer-specific pricing via lib/domain/pricing.ts)
- UI/connectivity: lib/ui/UIProvider (online + simulated offline)
- Notifications: lib/notifications/useNotifications
- i18n: lib/i18n (en; te/hi/ar(RTL)/fr/es registered)
- PWA: public/manifest.webmanifest, public/sw.js (prod only), offline.html, install prompt

## Roles & screens (done)
- Admin: dashboard, users (approve/activate), customers, sales team, settings, announcements, offers, messages
- Manager: dashboard, approvals (approve/reject/request changes + comments), orders, sales team, content, messages
- Sales rep (mobile-first): dashboard w/ route & check-in, my customers, customer detail (pricing, purchases), create order flow, orders/repeat, follow-ups, performance
- Customer: dashboard, catalog (search/filters/pagination/grid-list), PDP, cart, checkout, confirmation, orders + timeline, invoices, account/finance, offers, announcements, support chat
- Shared: notification center, AI assistant (mock, tool-based), global Ctrl+K search, offline Pending Sync queue

## Backlog
- Connect Node.js backend APIs; real auth (JWT)
- Languages: EN, FR, DE, ES, IT, PT ready (login + nav/roles/status/common keys); NL, AR (RTL) planned; remaining page copy to move into dictionaries
- Background sync + Web Push
- Real AI via backend tool-calling

## Iteration 2 (done)
- Credit Hold Alerts: credit exposure check (outstanding + open un-invoiced orders), credit panel in approvals, "Credit hold" badge, one-tap Override & approve (audited in timeline/comments), manager dashboard credit alerts, notification on over-limit submission
- Quick Order Entry (/quick-order): SKU/name autocomplete + Enter, Excel paste import with error list, camera barcode scan (BarcodeDetector) + demo scan, MOQ rounding, customer pricing
- Visit Check-in Notes: visit report sheet (outcome, contact, notes, compressed photos, next steps, auto follow-up), customer Visits tab, dashboard Complete & report

## Iteration 3 – Login, translations, theme, client settings (Oct 2026)
- New login page: request-slip illustration (Request → Approved → Order in ERP → Delivered), language and light/dark/system switchers, SSO button only when enabled, demo accounts only in demo mode, translated error codes
- Translations: JSON files per language (lib/i18n/locales), per-client overrides and client-added languages in client-config/i18n (no rebuild), plurals, English fallback, `npm run i18n:check`; guide in docs/TRANSLATIONS.md
- Client settings: client-config/settings.json (product/company name, logo, brand colour, languages, region, currency, demo mode, SSO, privacy/terms links), served at runtime; CLIENT_CONFIG_DIR for server installs
- Theme: brand colour drives all tokens; petrol default; dark mode; IBM Plex Sans bundled (works offline)
- App shell fully translated; page bodies still to be moved into translation files screen by screen

## Iteration 4 – Six roles and module access (Oct 2026)
- Roles: ADMIN, SUPERVISOR, SALES_REP, SUPPLIER, CUSTOMER_B2B, CUSTOMER_B2C (codes match the backend contract); users carry erpCode
- Module access (YES/NO per role) drives menus, mobile bar, search, page guard; admin screen at /access; defaults and locked modules in lib/access/modules.ts; docs/ROLES_AND_ACCESS.md
- New supplier dashboard (purchasing arrives next); customer dashboard translated, retail (B2C) variant without credit; B2C skips credit checks
- Security headers (same-origin framing, nosniff, referrer, permissions policy); type errors fail the build; .gitattributes for LF line endings

## Iteration 5 – Sites (Oct 2026)
- allowedSites + defaultSite per user (admin edits on Users; at least one required); site master via siteService (GET /sites)
- Header site switcher (plain label for single-site users), remembered per user; switching refetches everything
- Every request carries X-Site; mock scopes product stock and site price list, orders, dashboards; product detail shows stock at other allowed sites; orders tagged and filtered by site

## Iteration 6 – Request-first ordering (Oct 2026)
- Checkout, quick order, reorder and rep orders submit a Sales Request; sales orders exist only after conversion
- Lifecycle draft → submitted → changes requested / approved → (partly) converted, or rejected / cancelled / expired; history, comments, linked orders
- Review inbox (Approvals) and request detail share one review panel: credit position, price change since submission, stock shortage; convert dialog with price acceptance, partial conversion of in-stock lines, credit override with reason; idempotent conversion
- Workflow rules page (/workflow, Admin and Supervisor): credit block/warn with per-customer exceptions, auto-approval up to a total, B2C auto-convert after payment, stock hold hours, request expiry days
- Offline checkout saves a draft request that is sent automatically when back online
- docs/API_CONTRACT.md: every endpoint, headers, error codes, data scope

## Iteration 7 – Purchasing (Oct 2026)
- Supplier role is live: My products (their items with our stock at the site, low-stock flags, their price) and pickup requests with proposed date and notes
- Purchase requests: pickup offers from suppliers and internal requests (with "add low-stock items"); convert to PO with expected date (idempotent), send back / reject with comment, cancel by supplier
- Purchase orders: stepper issued → acknowledged → pickup confirmed → in transit → received; supplier acknowledges, confirms pickup (date, vehicle, driver, documents) and dispatches; buyer posts partial or full goods receipts (GRN) that add stock at the site, or cancels with a reason
- Supplier dashboard with action counts and recent POs; assistant answers what needs the supplier's attention

## Iteration 8 – Inventory (Oct 2026)
- Inventory overview per site: on hand, allocated (open sales orders), held (stock-hold requests), available, incoming (POs and transfers on the way), consignment; low/reserved/incoming/consignment filters; drill-down sheet showing the orders, requests, POs, transfers and consignments behind each number, plus availability at other sites
- Consignment stock: customer sees their consignment location with available quantities and calls stock off, which raises a sales request (normal workflow; conversion takes stock from the consignment, not free stock); staff see every consignment at the site, below-minimum flags, movements and top-ups from free stock
- Stock transfers between sites: request (reason, needed by, availability at both sites), approve / reject with comment, ship (stock leaves the source), receive with short quantities recorded (stock arrives at destination), complete; stepper and history

## Iteration 9 – Quotes, deliveries, payments and collections (Oct 2026)
- Quotes: customer asks from the cart or Quotes (target price, message); rep or supervisor prices it (normal price, target, quoted price, discount %, validity, terms; reps capped at 15% below normal price), sends it; customer accepts (raises a Sales Request at the quoted prices, kept through conversion), asks for changes or declines; versions, expiry, history
- Deliveries: invoice and delivery note created at dispatch; out for delivery, proof of delivery with received/damaged quantities, signature pad, photo and location (staff) or simple confirmation (customer, from the order page); failed and rescheduled deliveries; shortages notify sales
- Payments: pay online (provider step simulated), remittance advice from customers, collections recorded by reps; finance verifies against the bank, then the receipt posts and is allocated
- Collections: ageing by customer (not due, 1–30, 31–60, 61–90, 90+), payments to verify, promises to pay (kept/broken), reminders and call notes
- Account, Invoices and Cart pages moved fully onto translations

## Iteration 10 – Detail pages everywhere (Oct 2026)
- New pages: invoice (lines, totals, paid/balance, payments applied incl. earlier ERP payments, related order/delivery, pay or record payment), payment receipt (allocations, verification, verify/reject), suppliers list and supplier page (contacts, KPIs, products with our stock, POs, PRs, portal logins), sales rep (target, trend, customers, orders, quotes, follow-ups, collections), user (account, linked customer/supplier, modules from role, sites), product stock (position, what makes up each number, other sites, movement journal), offer (products with the viewer's price after the offer, add to cart), announcement
- Customer page gains requests, quotes, invoices & payments, deliveries and consignment tabs; order, customer and user pages fully translated
- Every list row and every reference (customer, supplier, product, order, invoice, payment, delivery, request, quote) links to its page when the viewer may open it; plain text otherwise
- Shared detail routes (invoices/payments for customers, collections and customer staff); reps only see their own customers' invoices and receipts; errors show translated "doesn't exist or you can't see it"
