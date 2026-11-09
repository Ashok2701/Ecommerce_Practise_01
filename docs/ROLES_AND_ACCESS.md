# Roles and module access

The portal has six roles. Each role has a set of **modules** (a menu item plus
its pages), switched on or off per role: YES/NO only, no separate
create/edit/delete flags. Admins change assignments on **Administration →
Module access**.

> The frontend only hides menus and blocks pages for convenience.
> **The backend must enforce the same rules on every API call.**

## Roles

| Code | Who | ERP link (`erpCode`) | Notes |
| --- | --- | --- | --- |
| `ADMIN` | Portal administrator | none | Runs users, access and settings; no business modules by default |
| `SUPERVISOR` | Sales manager, area supervisor | rep / employee code | Approvals, team, offers |
| `SALES_REP` | Field and inside sales | rep code | Sees only assigned customers |
| `SUPPLIER` | Vendor | supplier code | Own products and our stock, pickup requests, purchase orders: acknowledge, confirm pickup, dispatch |
| `CUSTOMER_B2B` | Dealer, distributor, company | customer code | Contract pricing, credit limit |
| `CUSTOMER_B2C` | Retail buyer | customer code | List prices, pays up front, no credit check |

## Modules and defaults

Defined in `lib/access/modules.ts` (`MODULES`, `DEFAULT_ROLE_MODULES`).

| Module | Routes | ADMIN | SUPERVISOR | SALES_REP | SUPPLIER | B2B | B2C |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |
| dashboard | /dashboard | always | always | always | always | always | always |
| approvals | /approvals | | ✓ | | | | |
| customers | /customers | ✓ | ✓ | ✓ | | | |
| follow_ups | /follow-ups | | | ✓ | | | |
| performance | /performance | | | ✓ | | | |
| team | /sales-reps | | ✓ | | | | |
| new_order | /orders/new | | | ✓ | | | |
| catalog | /catalog | | | ✓ | | ✓ | ✓ |
| quick_order | /quick-order | | | ✓ | | ✓ | |
| cart | /cart, /checkout | | | ✓ | | ✓ | ✓ |
| quotes | /quotes | | ✓ | ✓ | | ✓ | |
| requests | /requests | | ✓ | ✓ | | ✓ | ✓ |
| orders | /orders | | ✓ | ✓ | | ✓ | ✓ |
| deliveries | /deliveries | | ✓ | ✓ | | | |
| collections | /collections | | ✓ | ✓ | | | |
| invoices | /invoices | | | | | ✓ | ✓ |
| account | /account | | | | | ✓ | ✓ |
| offers | /offers | ✓ | ✓ | ✓ | | ✓ | ✓ |
| announcements | /announcements | ✓ | ✓ | ✓ | ✓ | ✓ | |
| messages | /messages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| assistant | /assistant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| notifications | /notifications | always | always | always | always | always | always |
| users | /users | locked | | | | | |
| access | /access | locked | | | | | |
| workflow | /workflow | ✓ | ✓ | | | | |
| supplier_catalog | /supplier-catalog | | | | ✓ | | |
| purchase_requests | /purchase-requests | | ✓ | | ✓ | | |
| purchase_orders | /purchase-orders | | ✓ | | ✓ | | |
| suppliers | /suppliers | | ✓ | | | | |
| inventory | /inventory | | ✓ | ✓ | | | |
| consignment | /consignment | | ✓ | ✓ | | ✓ | |
| transfers | /transfers | | ✓ | ✓ | | | |
| settings | /settings | locked | | | | | |

- **always**: on for every role, can't be switched off.
- **Shared detail pages**: a few detail pages can be opened from more than one module. Invoice and payment pages (`/invoices/{id}`, `/payments/{id}`) open for anyone with Invoices, Account, Customers or Collections; product stock pages and catalog product pages open from Inventory. Lists stay with their own module.
- **locked**: ADMIN always keeps these, so nobody gets locked out.

## Rules beyond modules (backend must enforce)

- `SALES_REP` sees and orders only for customers assigned to them.
- `CUSTOMER_B2B` / `CUSTOMER_B2C` see only their own customer's data.
- `SUPPLIER` sees no sales data (orders, customers, invoices of customers), and only purchase requests and orders for their own `supplier_id`. Suppliers may acknowledge, confirm pickup, dispatch and cancel their own open pickup requests; only buyers convert, receive and cancel purchase orders.
- Customers see only their own consignment; sales reps only their customers' consignments.
- Transfers: anyone with the module can request one; only supervisors approve, reject, ship, receive and complete.
- Quotes: reps may price at most 15% below the customer's normal price; deeper discounts need a supervisor to send the quote.
- Customers confirm receipt of their own deliveries from the order page (they don't have the Deliveries module).
- Only supervisors (finance) verify or reject payments; reps record collections, customers send remittance advice.
- Site access (`allowed_sites`, below) applies on top of modules.

## Sites

Every user has `allowedSites` (for example `["MAIN","MUM-WH"]`) and a
`defaultSite`. Admins set both on **Administration → Users** (at least one site
is required). The user picks the working site in the header; one site shows as
a plain label.

The selected site is a working context. Every request carries it in the
**`X-Site`** header, and the backend must:

- reject a site that isn't in the user's `allowedSites` (403),
- return **stock for that site** in `product.stock`,
- apply **that site's price list** to `basePrice` (contract prices may stay fixed),
- tag new orders and requests with the site,
- return only that site's documents in lists and dashboards.

Product detail also returns `otherSites: [{ site, stock }]` for the user's other
allowed sites, so a multi-site buyer can see where else an item is available.

Sample sites in mock mode: `MAIN` (Hyderabad), `MUM-WH` (Mumbai, price list
+2%), `MAA-WH` (Chennai), `BLR-BR` (Bengaluru, +3%).

## Backend contract

The full endpoint list is in `docs/API_CONTRACT.md`.


```
GET  /access/role-modules     -> { "ADMIN": ["dashboard", ...], "SUPERVISOR": [...], ... }
PUT  /access/role-modules     body: same shape, partial allowed. ADMIN only. Write an audit entry.

GET  /sites                   -> [{ code, name, city, kind }]          (ERP site master)
PUT  /users/:id/sites         body: { allowedSites: string[], defaultSite: string }   ADMIN only, audited;
                              reject an empty list and a default outside the list.

All business requests:        header X-Site: <site code>  (validated against allowedSites)
```

The backend should re-apply the always-on and locked modules on save, the same
way `normaliseModules()` does in the frontend.
