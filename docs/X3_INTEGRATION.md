# Sage X3 integration and go-live checklist

How the Nexus API connects to the client's Sage X3 and SQL Server, and what the
client's IT team and X3 consultant set up before go-live.

## The rule

| Direction | How | Why |
| --- | --- | --- |
| Portal reads X3 | SQL `SELECT` on the `NX_*` views (`backend/src/x3/views.sql`), with a read-only login | Fast lists and searches; nothing in X3 can be changed this way |
| Portal changes X3 | X3 SOAP web services (`backend/src/x3/soap-gateway.ts`) | X3 runs its own rules (numbering, allocation, accounting, stock); never write X3 tables |
| Portal's own data | The portal database (SQL Server) | Requests, quotes, POD, comments, users, access, audit |

ERP data is never copied into the portal database. Offers are the one cached item: they
are read from the price lists into the portal database on "Refresh from ERP" (and on
start-up), because the cart prices with them on every change.

## 1. SQL Server

1. Create the portal database (for example `NexusPortal`) and a SQL login that owns it.
   It can sit on the same instance as X3 or another one.
2. Create a second login for reading X3, **read-only**: `SELECT` on the `NEXUS` schema in
   the X3 database and nothing else. Use `ApplicationIntent=ReadOnly` if the instance has a
   readable secondary.
3. Fill in `backend/.env` (copy `.env.example`): `PORTAL_DB_*`, `X3_DB_*`,
   `X3_FOLDER_SCHEMA` (the X3 folder, for example `SEED` or the client's folder) and
   `X3_VIEW_SCHEMA` (`NEXUS`).
4. `npm run db:migrate` creates the portal tables (`schema_migrations` records what ran).
5. As a login allowed to create views in the X3 database (`CREATE SCHEMA NEXUS` first):
   `npm run x3:views`. Re-run it after changing `views.sql`; it replaces the views.

## 2. Check the views with the X3 consultant

`views.sql` maps standard X3 tables. Each folder is customised differently, so the
consultant reviews every view once and adjusts the SQL; the portal code does not change.
The test suite runs the same file on the simulated X3, so keep to plain SQL (no `+` for
strings, no `ISNULL`, `IIF`, `TOP` or date functions).

| View | Reads | Check |
| --- | --- | --- |
| `NX_SITE` | `FACILITY` | Which sites the portal offers (sales or warehouse sites) |
| `NX_PRODUCT` | `ITMMASTER`, `ITMSALES`, `TABVACITM` | Brand = statistical group 1 (`TSICOD_0`), category = `TCLCOD_0`, pack size = `ITMDES2_0`; **`ZMOQ_0`** minimum order quantity and **`ZRATE_0`** tax rate are not standard fields |
| `NX_STOCK` | `ITMMVT`, `ITMFACILIT` | Free stock = physical − allocated; lead time `OFS_0` |
| `NX_SITE_PRICE` | `SPRICLIST` code `T30` | Site price list; use the client's own code |
| `NX_CUSTOMER` | `BPCUSTOMER`, `BPADDRESS`, `TABPAYTERM`, `GACCDUDATE` | On hold = `OSTCTL_0 = 3`; B2C = customer category `BCGCOD_0 = 'B2C'`; outstanding = open items of type `INV`; tier = `TSCCOD_0` |
| `NX_CONTRACT_PRICE` | `SPRICLIST` code `T10` | Customer-item contract prices |
| (tier discount) | `SPRICLIST` code `T20` | Discount by customer price tier |
| `NX_OFFER_LINE` | `SPRICCONF`, `SPRICLIST` | Price lists shown as offers have **`ZPORTAL_0 = 2`**; free goods use `FOCITMREF_0` / `FOCQTY_0` per `MINQTY_0` |
| `NX_ORDER`, `NX_ORDER_LINE` | `SORDER`, `SORDERQ`, `SORDERP` | Status mapping (allocation and delivery status to confirmed / processing / packed / dispatched / cancelled); **`ZPORTREF_0`** holds the portal reference |
| `NX_DELIVERY`, `NX_DELIVERY_LINE` | `SDELIVERY`, `SDELIVERYD`, `BPCARRIER` | **`ZTRKNUM_0`** tracking number |
| `NX_INVOICE` | `SINVOICE`, `SINVOICED`, `GACCDUDATE` | Due date and paid amount from open items |
| `NX_RECEIPT`, `NX_RECEIPT_LINE` | `PAYMENTH`, `PAYMENTD` | Payment method codes `NEFT`, `RTGS`, `Cheque`, `UPI`, `Card`, `Cash` |
| `NX_SUPPLIER`, `NX_SUPPLIER_ITEM` | `BPSUPPLIER`, `ITMBPS`, `PPRICLIST` | Purchase price per supplier and item |
| `NX_PURCHASE_ORDER(_LINE)`, `NX_GOODS_RECEIPT` | `PORDER`, `PORDERQ`, `PRECEIPT`, `PRECEIPTD` | Closed = `CLEFLG_0 = 2` |
| `NX_LOCATION_STOCK` | `STOCK` | Customer consignment locations |
| `NX_STOCK_JOURNAL` | `STOJOU` | Map the client's transaction types (`TRSTYP_0`) to receipt / sale / transfer / consignment |

Fields starting with **Z** are not standard X3 fields. For each one, either add it as a
user field in X3 or point the view at the client's existing field.

## 3. X3 web services

Publish these on the pool set in `X3_WS_POOL` (Development > Web services), and give the
web-service user (`X3_WS_USER`) the rights to create these documents:

| Public name | Type | Used for |
| --- | --- | --- |
| `NXSOH` | object SOH | Converting a sales request into a sales order |
| `NXSOHCLS` | sub-program | Cancelling an order before delivery |
| `NXPOH` | object POH | Converting a purchase request into a purchase order |
| `NXPOHCLS` | sub-program | Cancelling a purchase order |
| `NXPTH` | object PTH | Goods receipt against a purchase order |
| `NXPAY` | object PAY | Customer receipt (online payment, or a verified advice / collection) |
| `NXSTR` / `NXSTRRCP` | sub-programs | Inter-site transfer: ship, then receive |
| `NXSCS` | object SCS | Moving free stock into a customer's consignment location |

The screen group ids (`SOH0_1`, `SOH4_1` …) are kept in `OBJECTS` in `soap-gateway.ts`;
the consultant aligns them with the published objects using the X3 web-service test page.
The portal reference (`ZPORTREF`) must be stored on the X3 document, because it is how a
retry finds a document X3 already created.

X3 errors come back to the user as `errors.erp.rejected` (the X3 message is in the API log
and in `erp_calls`); an unreachable X3 as `errors.erp.unavailable`.

## 4. Users

The portal has no public sign-up. Create the first administrator with the CLI, then
manage everyone else from the Users screen (status, sites) and Module access:

```bash
npm run build
node dist/backend/src/cli.js user --email admin@client.com --name "Portal Admin" --role ADMIN --password '<10+ characters>' --sites MAIN
node dist/backend/src/cli.js user --email buyer@customer.com --name "Buyer" --role CUSTOMER_B2B --customer BP-0001 --password '...' --sites MAIN
node dist/backend/src/cli.js user --email rep@client.com --name "Rep" --role SALES_REP --erp-code REP01 --password '...' --sites MAIN,BR2
```

* Customer logins carry the X3 customer code (`--customer`), supplier logins the supplier
  code (`--supplier`), sales reps their X3 sales rep code (`--erp-code`): that is how the
  API limits each login to its own data.
* Passwords are stored as bcrypt hashes. After 8 wrong passwords a login is locked until
  an administrator re-activates it on the Users screen.

## 5. Portal settings

Build the portal with:

```
NEXT_PUBLIC_DATA_SOURCE=api
NEXT_PUBLIC_API_BASE_URL=https://portal-api.client.com
```

and set `CORS_ORIGINS` on the API to the portal's URL. Leave `NEXT_PUBLIC_X3_SIM` unset in
production. Turn off the demo login buttons in `client-config/settings.json` (`demoMode`).

Offline use with the live API: the service worker keeps the catalogue, offers, the
user's customers and the menu rules (network first; cleared on sign-out), so reps and
buyers can browse and build an order offline. The order is kept on the device and sent,
with the same checks, when the connection returns. Orders, invoices and balances are not
available offline, and the assistant needs a connection.

## 6. Go-live checks

- [ ] `GET /health` returns `{"status":"ok","portalDb":"ok","x3":"ok","x3Mode":"live"}`
- [ ] Each role signs in and sees its menu; a customer sees only their own orders and invoices
- [ ] A test sales request converts to an X3 sales order with the right prices, and the
      same conversion repeated returns the same order
- [ ] A remittance advice, once verified, appears as a receipt in X3 against the invoice
- [ ] A purchase request converts to a PO; a goods receipt adds stock in X3
- [ ] Offers: "Refresh from ERP" shows the price lists flagged for the portal
- [ ] `erp_calls` shows every call with its X3 document number
- [ ] Back up the portal database with the X3 database (same schedule)

## Open decisions

- Payment provider for online payments (Razorpay, Stripe …). Until it is configured,
  `POST /payments/online` posts the receipt straight away; with a provider, the API creates
  the provider session and the provider's webhook posts the receipt.
- Whether payment verification stays with Supervisors or moves to a Finance role.
- Whether the reps' 15% quote discount limit becomes an Admin setting.
- Proof-of-delivery signatures, photos and visit photos are stored in the portal database
  today; move them to object storage (Azure Blob / S3) if volumes grow.
