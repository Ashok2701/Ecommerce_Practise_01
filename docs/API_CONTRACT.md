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

## Purchasing (request-first)

Suppliers offer stock for pickup, or buyers raise an internal request. Both are
Purchase Requests; a buyer converts one into a Purchase Order in the ERP.
Supplier users are scoped to their `supplier_id` server-side.

| Method | Path | Who | Body / query | Returns |
| --- | --- | --- | --- | --- |
| GET | `/suppliers` | buyers | | `Supplier[]` |
| GET | `/suppliers/{id}/catalog` | buyers, own supplier | | `{product, unitCost, low}[]` at `X-Site` |
| GET | `/suppliers/{id}/reorder-suggestions` | buyers | | `{productId, suggested}[]` |
| GET | `/purchase-requests` | buyers, supplier (own) | `supplierId?`, `view=open\|closed\|all` | `PurchaseRequest[]` |
| GET | `/purchase-requests/{id}` | | | `PurchaseRequest` |
| POST | `/purchase-requests` | buyers (`internal`), supplier (`pickup`) | `{supplierId, source, items[{productId, quantity}], proposedDate?, notes?}` | `PurchaseRequest` (status `submitted`) |
| POST | `/purchase-requests/{id}/convert` | buyers | `{expectedDate, idempotencyKey}` | `PurchaseRequest` with `orderId`, `orderNumber`. Pickup offers create the PO already `acknowledged` |
| POST | `/purchase-requests/{id}/review` | buyers | `{decision: changes\|reject, comment}` (comment required) | `PurchaseRequest` |
| POST | `/purchase-requests/{id}/cancel` | creator | | `PurchaseRequest` |
| POST | `/purchase-requests/{id}/comments` | | `{text}` | `PurchaseRequest` |
| GET | `/purchase-orders` | buyers, supplier (own) | `supplierId?`, `view` | `PurchaseOrder[]` |
| GET | `/purchase-orders/{id}` | | | `PurchaseOrder` |
| POST | `/purchase-orders/{id}/acknowledge` | supplier | | `issued → acknowledged` |
| POST | `/purchase-orders/{id}/pickup` | supplier | `{date, vehicle, driver?, documents?}` (date, vehicle required) | `→ pickup_confirmed` (can be updated again) |
| POST | `/purchase-orders/{id}/dispatch` | supplier | | `pickup_confirmed → in_transit` |
| POST | `/purchase-orders/{id}/receipts` | buyers / warehouse | `{lines[{productId, quantity}]}` | GRN posted to ERP, stock added at the PO site; `partly_received` or `received` |
| POST | `/purchase-orders/{id}/cancel` | buyers | `{reason}` | only `issued` / `acknowledged` |

PO flow: `issued → acknowledged → pickup_confirmed → in_transit → (partly_received) → received`, or `cancelled`.
Errors: `errors.purchasing.notFound | notOpen | empty | pickupDetails | nothingToReceive`.
Every transition notifies the other party (`purchase_update`).

## Inventory

Stock comes from the ERP per site (`X-Site`). The portal never adjusts stock
itself: every movement (transfer, consignment top-up, call-off) is a document
the ERP posts.

Definitions per product and site:
- **on hand** = physically at the site (free + allocated)
- **allocated** = on open sales orders not yet shipped
- **held** = open sales requests while the stock-hold workflow setting applies (`holdUntil` in the future)
- **available** = on hand − allocated − held (free to promise)
- **incoming** = purchase orders `in_transit` / `partly_received` + transfers `initiated` towards the site
- **consignment** = customer stock at consignment locations of the site (not part of on hand)

| Method | Path | Who | Body / query | Returns |
| --- | --- | --- | --- | --- |
| GET | `/inventory` | staff | `search?`, `category?`, `filter=all\|low\|reserved\|incoming\|consignment` | `StockPosition[]` |
| GET | `/inventory/{productId}` | staff | | `{position: StockPosition, detail: StockDetail}` (which orders, requests, POs, transfers and consignments make up the numbers; available at other sites) |
| GET | `/inventory/availability` | staff | `sites=A,B` | `{[productId]: {[site]: available}}` |

### Consignment stock

| Method | Path | Who | Body / query | Returns |
| --- | --- | --- | --- | --- |
| GET | `/consignments` | staff (site), customer (own only), rep (own customers) | `customerId?` | `ConsignmentView[]` (lines with `reserved` on open call-offs, `available`, `low` below `minQty`; open call-offs) |
| GET | `/consignments/{id}` | same scope | | `ConsignmentView` with movements |
| POST | `/consignments/{id}/call-offs` | customer, rep | `{items[{productId, quantity}], poNumber?, notes?}` | `SalesRequest` with `consignmentId`. Quantities may not exceed `available` (`errors.consignment.notEnough`). Goes through the normal request workflow; converting it takes stock from the consignment location, not free stock. No stock hold is applied |
| POST | `/consignments/{id}/top-ups` | supervisor | `{items[{productId, quantity}]}` | Moves free stock into the location (`errors.consignment.noFreeStock`) |

### Stock transfers

Flow: `pending → approved → initiated → transferred → completed`, or `rejected` / `cancelled`.

| Method | Path | Who | Body | Effect |
| --- | --- | --- | --- | --- |
| GET | `/transfers` | staff | `view?`, `direction=in\|out?` | Transfers into or out of the current site |
| GET | `/transfers/{id}` | staff | | `StockTransfer` |
| POST | `/transfers` | rep, supervisor | `{fromSite, toSite, items, reason, neededBy?}` | `pending`; reason required, sites must differ |
| POST | `/transfers/{id}/approve` | supervisor | | `approved` |
| POST | `/transfers/{id}/reject` | supervisor | `{comment}` (required) | `rejected` |
| POST | `/transfers/{id}/initiate` | supervisor / source warehouse | | ERP transfer created (`erpRef`), stock leaves the source; `errors.transfers.noStock` if free stock is short |
| POST | `/transfers/{id}/receive` | supervisor / destination warehouse | `{lines[{productId, quantity}]}` | Stock added at destination; short lines recorded |
| POST | `/transfers/{id}/complete` | supervisor | | `completed` |
| POST | `/transfers/{id}/cancel` | creator, supervisor | | only `pending` / `approved` |
| POST | `/transfers/{id}/comments` | | `{text}` | |

Errors: `errors.transfers.notFound | notOpen | sameSite | empty | reasonRequired | noStock`, `errors.forbidden`.
Notifications use type `stock_update`.

## Quotes

Flow: `requested` (customer asked) or `draft` (staff started) → `sent` → `accepted` (a Sales Request is raised at the quoted prices) or `declined` / `expired` / `cancelled`. A customer asking for changes puts a sent quote back to `requested`; sending again bumps `version`.

| Method | Path | Who | Body / query | Notes |
| --- | --- | --- | --- | --- |
| GET | `/quotes` | customer (own), rep (own customers), supervisor | `view=open\|closed\|all` | Sent quotes past `validUntil` are returned as `expired` |
| GET | `/quotes/{id}` | same scope | | `Quote` |
| POST | `/quotes` | customer, rep, supervisor | `{customerId, items[{productId, quantity, targetPrice?}], note?}` | Lines start at the customer's normal price (contract/tier) |
| PUT | `/quotes/{id}` | rep, supervisor | `{lines[{productId, quantity, unitPrice}], validUntil, terms?}` | Editing a sent quote makes it a draft again |
| POST | `/quotes/{id}/send` | rep, supervisor | | Requires `validUntil` in the future. A rep can't send prices more than `REP_MAX_DISCOUNT_PCT` (15%) below the normal price: `errors.quotes.discountNeedsApproval` |
| POST | `/quotes/{id}/accept` | customer, rep | `{poNumber?}` | Returns `{quote, request}`. The request carries `quoteId`; its lines keep the quoted prices through conversion (no price-change check) |
| POST | `/quotes/{id}/decline` | customer | `{reason}` | Reason required |
| POST | `/quotes/{id}/revision` | customer | `{comment}` | Back to `requested` |
| POST | `/quotes/{id}/cancel` | staff | | Open quotes only |
| POST | `/quotes/{id}/comments` | | `{text}` | |

## Deliveries and proof of delivery

The ERP creates the tax invoice and the delivery note when an order is dispatched. Flow: `scheduled → out_for_delivery → delivered`, or `failed → scheduled` (rescheduled). Recording proof of delivery sets the order to `delivered`.

| Method | Path | Who | Body | Notes |
| --- | --- | --- | --- | --- |
| GET | `/deliveries` | staff (site), rep (own customers) | `view?` | |
| GET | `/deliveries/{id}` | staff, the customer (via their order) | | `Delivery` |
| POST | `/deliveries/{id}/out-for-delivery` | staff | `{driver?, vehicle?}` | Customer notified |
| POST | `/deliveries/{id}/pod` | staff, the customer | `{receivedBy, lines[{productId, receivedQty, damagedQty}], signature?, photo?, notes?, location?}` | Staff must send a signature or a photo (`errors.deliveries.proof`); customers confirm in their own login. Short or damaged lines notify the supervisor and rep. Signature and photo are images (data URLs in the prototype; store them as documents) |
| POST | `/deliveries/{id}/fail` | staff | `{reason}` | |
| POST | `/deliveries/{id}/reschedule` | staff | `{date}` | Only failed deliveries |

## Payments and collections

Online payments are confirmed by the payment provider (configured per client: Razorpay, Stripe, …) and posted at once. Remittance advice from customers and collections recorded by reps wait as `pending_verification` until finance finds the money in the bank; verifying posts the receipt in the ERP and allocates it to the named invoices first, then the oldest open ones; anything left is on account.

| Method | Path | Who | Body / query | Notes |
| --- | --- | --- | --- | --- |
| GET | `/payments` | customer (own), staff | `customerId?`, `status?` | |
| POST | `/payments/online` | customer | `{invoiceIds, method}` | Backend creates the provider session; the provider webhook posts the receipt |
| POST | `/payments` | customer (advice), rep (collection) | `{customerId, invoiceIds, amount, method, reference, date, note?}` | Reference required except cash |
| POST | `/payments/{id}/verify` | supervisor / finance | | `posted`, with `allocations` |
| POST | `/payments/{id}/reject` | supervisor / finance | `{reason}` | Customer and the person who entered it are told |
| GET | `/collections/aging` | rep (own customers), supervisor | `salesRepId?` | Per customer: not due, 1–30, 31–60, 61–90, 90+, overdue, last payment, amount to verify, open promise, broken promises |
| GET | `/collections/{customerId}/notes` | staff | | Promises (with outcome open / kept / broken), reminders, notes |
| POST | `/collections/{customerId}/notes` | staff | `{kind: promise\|note, text, promiseDate?, promiseAmount?}` | |
| POST | `/collections/{customerId}/reminders` | staff | | Sends the customer their overdue invoices |

Errors: `errors.quotes.*`, `errors.deliveries.*`, `errors.payments.*` (see the translation files for the full list).

## Not yet in the contract

The offer engine (percent, BOGO and slab offers) is added with phase 2D of the frontend.
