# API contract (frontend ↔ backend)

This is the contract the NestJS backend implements so the portal can switch from
mock data to live data. Every endpoint below is already called by the frontend
service layer (`lib/services/*.ts`); in mock mode the same functions run against
an in-browser database instead.

Switch to the backend with:

```
NEXT_PUBLIC_DATA_SOURCE=api
NEXT_PUBLIC_API_BASE_URL=https://portal-api.client.com
```

Types referenced here are defined in `types/domain.ts`; the backend should
return exactly these shapes (JSON, camelCase, ISO-8601 dates in UTC).

## Conventions

| Topic | Rule |
| --- | --- |
| Auth | `Authorization: Bearer <JWT>` on every call except login |
| Site | `X-Site: <site code>` on every business call. Reject (403) if the code isn't in the user's `allowedSites`. Scope stock, the site's price list and documents to it |
| Language | The browser sends `Accept-Language`; the backend returns codes, not sentences (below) |
| Errors | Non-2xx with body `{ "code": "errors.requests.creditBlocked", "message": "English text for logs" }`. `code` is a translation key; the frontend shows it in the user's language. Existing codes: see `errors.*` in `lib/i18n/locales/en.json` |
| Access | Every call checks the user's role, module access (YES/NO), site and data scope (below). Hiding a menu in the frontend is never the only protection |
| Paging | Lists that can grow take `page` and `pageSize` and return `{ items, total, page, pageSize }` (`Paginated<T>`) |
| Money | Numbers in the client's currency (`settings.currency`); the frontend formats them |
| Audit | Every write records who, when, what changed and from which site |

**Data scope** (on top of modules and site): `SALES_REP` sees only customers
assigned to them; `CUSTOMER_B2B` / `CUSTOMER_B2C` see only their own customer;
`SUPPLIER` sees no sales data.

## Auth and settings

| Method | Path | Body / query | Returns | Notes |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` | `{ user: User, token }` | Errors: `errors.auth.invalidCredentials`, `errors.auth.pendingApproval`, `errors.auth.inactive`. SSO comes later |
| GET | `/config/settings.json` | | `AppSettings` | Served by the frontend from `client-config/`; later `/api/settings` |
| GET | `/settings/workflow` | | `WorkflowSettings` | ADMIN, SUPERVISOR |
| PUT | `/settings/workflow` | `WorkflowSettings` | `WorkflowSettings` | ADMIN, SUPERVISOR; audited |

## Access, users and sites

| Method | Path | Body / query | Returns | Notes |
| --- | --- | --- | --- | --- |
| GET | `/access/role-modules` | | `Record<Role, ModuleId[]>` | |
| PUT | `/access/role-modules` | partial `Record<Role, ModuleId[]>` | full map | ADMIN only; re-apply always-on and locked modules (`normaliseModules`) |
| GET | `/users` | `search?, role?, status?` | `User[]` | ADMIN |
| PATCH | `/users/:id` | `{ status }` | `User` | Approve / activate / deactivate |
| PUT | `/users/:id/sites` | `{ allowedSites, defaultSite }` | `User` | ADMIN; reject empty list (`errors.sites.atLeastOne`) and a default outside the list |
| GET | `/sites` | | `Site[]` | ERP site master |

See `docs/ROLES_AND_ACCESS.md` for roles, default modules and site rules.

## Catalogue

| Method | Path | Body / query | Returns | Notes |
| --- | --- | --- | --- | --- |
| GET | `/products` | `search?, category?, brands? (comma list), stock? (in_stock, low_stock, out_of_stock), sort? (relevance, price_asc, price_desc, name), page, pageSize` | `Paginated<Product>` | Server-side search and paging over ERP items. `stock` and `basePrice` are for the `X-Site` site. Return only list fields |
| GET | `/products/:id` | | `Product` with `otherSites: [{ site, stock }]` | Other sites = the user's other allowed sites |
| GET | `/customers` | `search?, salesRepId?, status?` | `Customer[]` | Rep sees own customers only |
| GET | `/customers/:id` | | `Customer` | Includes `contractPrices`, credit limit, outstanding |
| GET | `/customers/:id/account` | | account summary | Outstanding, overdue, available credit, terms |

Prices: the backend computes customer prices exactly as Sage X3 does (price lists,
contract prices, quantity breaks) and returns them; the frontend never computes
the final price. Today `lib/domain/pricing.ts` does it in the browser for the
demo only; it is replaced by backend prices during integration.

## Sales requests (request-first ordering)

Nothing in the portal creates a sales order directly. Checkout, quick order,
reorder and rep orders all `POST /requests`; the order is created in the ERP
only on conversion.

| Method | Path | Body / query | Returns | Notes |
| --- | --- | --- | --- | --- |
| GET | `/requests` | `customerId?, salesRepId?, view? (open, review, closed, all), search?` | `SalesRequest[]` | Close expired requests on read |
| GET | `/requests/:id` | | `SalesRequest` | |
| POST | `/requests` | `{ customerId, items: [{ productId, quantity }], notes?, poNumber?, offline? }` | `SalesRequest` | Prices at the `X-Site` site. Credit check (B2B): in `block` mode return `errors.requests.creditBlocked` / `errors.requests.accountOnHold`; in `warn` mode submit with `credit.over = true`. Apply auto-approval and B2C auto-convert rules; set `holdUntil` and `expiresAt` from workflow settings. Notify SUPERVISOR |
| POST | `/requests/sync` | | `{ sent, blocked }` | Submit offline drafts with the same checks |
| GET | `/requests/:id/conversion-preview` | | `ConversionPreview` | Open lines, stock at the site, price then vs now, credit issue |
| POST | `/requests/:id/convert` | `{ idempotencyKey, acceptPriceChange?, onlyAvailable?, overrideCredit?, overrideReason? }` | `SalesRequest` | Creates the sales order in the ERP **through its web services, never by writing ERP tables**. Same `idempotencyKey` returns the first result and never creates a second order. Errors: `errors.requests.priceChanged`, `errors.requests.creditOverrideNeeded`, `errors.requests.nothingInStock`, `errors.requests.notOpen`. With `onlyAvailable`, convert in-stock quantities and leave the rest open (`partly_converted`). Set `order.requestId` |
| POST | `/requests/:id/request-changes` | `{ comment }` | `SalesRequest` | Comment required (`errors.requests.commentRequired`); notify requester |
| POST | `/requests/:id/reject` | `{ comment }` | `SalesRequest` | Comment required; notify requester |
| POST | `/requests/:id/cancel` | `{ note? }` | `SalesRequest` | Requester; open requests only |
| POST | `/requests/:id/comments` | `{ text }` | `SalesRequest` | |

Lifecycle: `draft → submitted → (changes_requested | approved → partly_converted → converted | rejected | cancelled | expired)`.

## Orders, invoices

| Method | Path | Body / query | Returns | Notes |
| --- | --- | --- | --- | --- |
| GET | `/orders` | `customerId?, salesRepId?, status?, search?` | `Order[]` | Site-scoped; ERP sales orders |
| GET | `/orders/:id` | | `Order` | Includes `requestId` / `requestNumber` |
| GET | `/orders/:id/credit-check` | | `CreditCheck` | |
| POST | `/orders/:id/comments` | `{ text }` | `Order` | |
| POST | `/orders/:id/cancel` | | `Order` | Only while the ERP allows it |
| GET | `/invoices` | `customerId?` | `Invoice[]` | |

Order status after creation (processing, packed, dispatched, delivered) comes
from the ERP. The "advance status" button in the demo simulates that and is not
part of the backend contract.

## Dashboards

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/dashboard/admin` | KPIs, trend, status and category breakdown, activity, recent orders |
| GET | `/dashboard/manager` | Requests to review, credit alerts, today's and month's sales, team activity |
| GET | `/dashboard/customer/:customerId` | Balance, credit, open orders, recent orders, last delivered order |

Shapes: see the return objects in `lib/services/dashboardService.ts`. All are
site-scoped.

## Sales team

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/sales-reps/performance` | | `RepPerformance[]` |
| GET | `/sales-reps/:repId/performance` | | `RepPerformance` |
| GET | `/follow-ups` | `repId` | `FollowUp[]` |
| POST | `/follow-ups` | `FollowUp` | `FollowUp` |
| PATCH | `/follow-ups/:id` | `FollowUp` | `FollowUp` |
| GET | `/visits` | `repId, date=today` | `Visit[]` |
| PATCH | `/visits/:id` | `{ status }` | `Visit` |
| GET | `/visit-reports` | `customerId?, repId?` | `VisitReport[]` |
| POST | `/visit-reports` | `VisitReport` (photos as uploads later) | `VisitReport` |

## Content and communication

| Method | Path | Body / query | Returns | Notes |
| --- | --- | --- | --- | --- |
| GET | `/announcements` | `manage?` | `Announcement[]` | Filtered by the user's role (audience) unless `manage` |
| POST | `/announcements` | `Announcement` | `Announcement` | ADMIN, SUPERVISOR |
| PATCH | `/announcements/:id` | `Announcement` or `{ status }` | `Announcement` | |
| DELETE | `/announcements/:id` | | | |
| GET | `/offers` | `tier?, manage?` | `Offer[]` | Offer engine (BOGO, slabs, bundles) is designed in the backend chat |
| POST | `/offers` | `Offer` | `Offer` | ADMIN, SUPERVISOR |
| PATCH | `/offers/:id` | `Offer` or `{ status }` | `Offer` | |
| GET | `/conversations` | | `Conversation[]` | Visible to participants; customers see their own |
| POST | `/conversations` | `{ subject, body }` | `Conversation` | |
| POST | `/conversations/:id/messages` | `{ body }` | `Conversation` | |
| POST | `/conversations/:id/read` | | | |
| GET | `/notifications` | | `AppNotification[]` | Current user |
| PATCH | `/notifications/:id` | `{ read: true }` | | |
| POST | `/notifications/read-all` | | | |

## AI assistant

The assistant runs in the backend and calls the same endpoints above as tools,
with the user's token, role, site and data scope. It never queries the ERP
directly, and any action that writes (for example raising a request) is shown to
the user for confirmation first. The frontend mock is `lib/services/assistantService.ts`.

## Not yet in the contract

Purchasing (purchase requests, supplier pickup requests, purchase orders,
receipts), the five inventory areas, quotes, deliveries, payments and the offer
engine are added with phase 2 of the frontend.
