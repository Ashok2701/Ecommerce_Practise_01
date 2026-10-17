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
- Real translations (Telugu/Hindi first)
- Background sync + Web Push
- Real AI via backend tool-calling

## Iteration 2 (done)
- Credit Hold Alerts: credit exposure check (outstanding + open un-invoiced orders), credit panel in approvals, "Credit hold" badge, one-tap Override & approve (audited in timeline/comments), manager dashboard credit alerts, notification on over-limit submission
- Quick Order Entry (/quick-order): SKU/name autocomplete + Enter, Excel paste import with error list, camera barcode scan (BarcodeDetector) + demo scan, MOQ rounding, customer pricing
- Visit Check-in Notes: visit report sheet (outcome, contact, notes, compressed photos, next steps, auto follow-up), customer Visits tab, dashboard Complete & report
