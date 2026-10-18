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
| `SUPPLIER` | Vendor | supplier code | Purchasing modules arrive in the purchasing release |
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
| orders | /orders | | ✓ | ✓ | | ✓ | ✓ |
| invoices | /invoices | | | | | ✓ | ✓ |
| account | /account | | | | | ✓ | ✓ |
| offers | /offers | | ✓ | ✓ | | ✓ | ✓ |
| announcements | /announcements | ✓ | ✓ | ✓ | ✓ | ✓ | |
| messages | /messages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| assistant | /assistant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| notifications | /notifications | always | always | always | always | always | always |
| users | /users | locked | | | | | |
| access | /access | locked | | | | | |
| settings | /settings | locked | | | | | |

- **always**: on for every role, can't be switched off.
- **locked**: ADMIN always keeps these, so nobody gets locked out.

## Rules beyond modules (backend must enforce)

- `SALES_REP` sees and orders only for customers assigned to them.
- `CUSTOMER_B2B` / `CUSTOMER_B2C` see only their own customer's data.
- `SUPPLIER` sees no sales data (orders, customers, invoices of customers).
- Site access (`allowed_sites`) is the next step and applies on top of modules.

## Backend contract

```
GET  /access/role-modules     -> { "ADMIN": ["dashboard", ...], "SUPERVISOR": [...], ... }
PUT  /access/role-modules     body: same shape, partial allowed. ADMIN only. Write an audit entry.
```

The backend should re-apply the always-on and locked modules on save, the same
way `normaliseModules()` does in the frontend.
