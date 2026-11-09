import type { Knex } from 'knex';
import * as bcrypt from 'bcryptjs';
import { Repos } from '../db/portal-db';
import { TRSTYP } from '../x3/sim/schema';
import { createSeed, type MockDb } from '@/lib/data/seed';
import type { Customer, Order, Product, User } from '@/types/domain';

/**
 * Demo data for development and tests. It reuses the portal's own mock data
 * (lib/data/seed.ts), so the API and the mock portal show the same company:
 *   - ERP records go into the simulated Sage X3 tables, with X3-style keys
 *     (item code, BP code, document numbers instead of the mock's ids);
 *   - portal records (users, requests, quotes ...) go into the portal database.
 * Every demo user's password is demo123. Never run this against production.
 */
export const DEMO_PASSWORD = 'demo123';

const ORDER_X3: Record<string, { ORDSTA_0: number; ALLSTA_0: number; DLVSTA_0: number }> = {
  confirmed: { ORDSTA_0: 1, ALLSTA_0: 1, DLVSTA_0: 1 }, processing: { ORDSTA_0: 1, ALLSTA_0: 2, DLVSTA_0: 1 }, packed: { ORDSTA_0: 1, ALLSTA_0: 3, DLVSTA_0: 1 },
  dispatched: { ORDSTA_0: 2, ALLSTA_0: 3, DLVSTA_0: 3 }, delivered: { ORDSTA_0: 2, ALLSTA_0: 3, DLVSTA_0: 3 }, cancelled: { ORDSTA_0: 2, ALLSTA_0: 1, DLVSTA_0: 1 },
};
const VIEW_STATUS = (s: string) => (s === 'delivered' ? 'dispatched' : s);

/** Mock ids -> X3 keys, applied to the whole data set (references in links and documents included). */
function remap(db: MockDb): MockDb {
  const map = new Map<string, string>();
  db.products.forEach((p) => map.set(p.id, p.sku));
  db.customers.forEach((c) => map.set(c.id, c.code));
  db.suppliers.forEach((s) => map.set(s.id, s.code));
  db.orders.forEach((o) => map.set(o.id, o.number));
  db.invoices.forEach((i) => map.set(i.id, i.number));
  db.deliveries.forEach((d) => map.set(d.id, d.number));
  db.purchaseOrders.forEach((o) => { map.set(o.id, o.number); o.receipts.forEach((g) => map.set(g.id, g.number)); });
  db.offers.forEach((o) => map.set(o.id, o.code));
  db.payments.forEach((p, k) => map.set(p.id, `RCP-26-${String(k + 1).padStart(5, '0')}`));
  const re = /\b(prd_\d{3}|cus_\d{3}|cus_b2c_\d+|sup_\d+|ord_\d+|inv_\d+|del_\d+|po_\d+|grn_\d+|off_\d+|pay_\d+)\b/g;
  return JSON.parse(JSON.stringify(db).replace(re, (m) => map.get(m) ?? m));
}

const carrierCode = (name: string) => (name.toLowerCase().includes('blue') ? 'BLUEDART' : 'VRL');
const termCode = (t: string) => t.replace(/\s+/g, '').toUpperCase();

export async function seedSimX3(x3: Knex, db: MockDb) {
  const ins = async (table: string, rows: Record<string, unknown>[]) => { for (let i = 0; i < rows.length; i += 50) await x3(table).insert(rows.slice(i, i + 50)); };
  const reps = new Map(db.users.filter((u) => u.role === 'SALES_REP').map((u) => [u.id, u.erpCode ?? '']));
  const prod = new Map(db.products.map((p) => [p.id, p]));

  await ins('FACILITY', db.sites.map((s) => ({ FCY_0: s.code, FCYNAM_0: s.name, CTY_0: s.city, WRHFLG_0: s.kind === 'warehouse' ? 2 : 1, SALFLG_0: 2 })));
  await ins('TABVACITM', [{ VACITM_0: 'GST18', ZRATE_0: 18 }, { VACITM_0: 'GST12', ZRATE_0: 12 }, { VACITM_0: 'GST5', ZRATE_0: 5 }]);
  await ins('ITMMASTER', db.products.map((p) => ({ ITMREF_0: p.id, ITMDES1_0: p.name, ITMDES2_0: p.packSize, TCLCOD_0: p.category, TSICOD_0: p.brand, STU_0: p.uom, VACITM_0: `GST${p.taxRatePct ?? 18}`, ITMSTA_0: 1, ZMOQ_0: p.moq })));
  await ins('ITMSALES', db.products.map((p) => ({ ITMREF_0: p.id, BASPRI_0: p.basePrice })));
  await ins('ITMFACILIT', db.products.flatMap((p) => db.sites.map((s) => ({ ITMREF_0: p.id, STOFCY_0: s.code, OFS_0: p.leadTimeDays }))));
  // site price lists
  let rec = 0;
  const plRows: Record<string, unknown>[] = [];
  for (const s of db.sites) if (s.priceFactor && s.priceFactor !== 1) for (const p of db.products) plRows.push({ PLICRD_0: `R${++rec}`, PLI_0: 'T30', PLICRI1_0: p.id, PLICRI3_0: s.code, PRI_0: Math.round(p.basePrice * s.priceFactor * 100) / 100 });
  // tier discounts and contract prices
  for (const [tier, pct] of [['A', 12], ['B', 7], ['C', 3]] as const) plRows.push({ PLICRD_0: `R${++rec}`, PLI_0: 'T20', PLICRI4_0: tier, DCGVAL1_0: pct });
  for (const c of db.customers) for (const [pid, price] of Object.entries(c.contractPrices ?? {})) plRows.push({ PLICRD_0: `R${++rec}`, PLI_0: 'T10', PLICRI1_0: pid, PLICRI2_0: c.id, PRI_0: price });
  // offers: one price list per offer, flagged for the portal
  for (const o of db.offers) {
    await ins('SPRICCONF', [{ PLI_0: o.code, DES_0: o.title, ZTEXT_0: o.description, PLIREF_0: o.erpRef ?? '', ZPORTAL_0: 2 }]);
    const base = { PLI_0: o.code, PLISTRDAT_0: o.validFrom, PLIENDDAT_0: o.validTo, PLICRI4_0: o.audience.startsWith('tier_') ? o.audience.slice(5) : '' };
    const targets = [...o.productIds.map((p) => ({ PLICRI1_0: p, PLICRI5_0: '' })), ...(o.categories ?? []).map((c) => ({ PLICRI1_0: '', PLICRI5_0: c }))];
    const custs = o.audience === 'customers' ? o.customerIds ?? [] : [''];
    const sites = o.sites?.length ? o.sites : [''];
    for (const t of targets) for (const cu of custs) for (const si of sites) {
      const crit = { ...base, ...t, PLICRI2_0: cu, PLICRI3_0: si };
      if (o.kind === 'percent') plRows.push({ PLICRD_0: `R${++rec}`, ...crit, DCGVAL1_0: o.discountPct });
      if (o.kind === 'tier') for (const tr of o.tiers ?? []) plRows.push({ PLICRD_0: `R${++rec}`, ...crit, MINQTY_0: tr.minQty, DCGVAL1_0: tr.discountPct });
      if (o.kind === 'free_goods') plRows.push({ PLICRD_0: `R${++rec}`, ...crit, MINQTY_0: o.buyQty, FOCQTY_0: o.freeQty, FOCITMREF_0: o.freeProductId ?? '' });
    }
  }
  await ins('SPRICLIST', plRows.map((r) => ({ PLICRI1_0: '', PLICRI2_0: '', PLICRI3_0: '', PLICRI4_0: '', PLICRI5_0: '', FOCITMREF_0: '', ...r })));

  // customers
  const terms = new Set<string>();
  await ins('BPCUSTOMER', db.customers.map((c) => {
    terms.add(c.paymentTerms);
    return {
      BPCNUM_0: c.id, BPCNAM_0: c.name, REP_0: reps.get(c.salesRepId) ?? '', TSCCOD_0: c.priceTier, BCGCOD_0: c.type, PTE_0: termCode(c.paymentTerms), CNTNAM_0: c.contactName, EECNUM_0: c.gstin,
      CREDAT_0: c.since, BPAADD_0: 'MAIN', BPAINV_0: 'MAIN', BPCSTA_0: c.status === 'inactive' ? 1 : 2, OSTCTL_0: c.status === 'on_hold' ? 3 : 2, OSTAUZ_0: c.creditLimit,
    };
  }));
  const addr = (bp: string, a: Customer['address'], tel: string, mail: string) => ({ BPANUM_0: bp, BPAADD_0: 'MAIN', BPAADDLIG1_0: a.line1, CTY_0: a.city, SAT_0: a.state, POSCOD_0: a.postalCode, CRYNAM_0: a.country, TEL1_0: tel, WEB1_0: mail });
  await ins('BPADDRESS', [...db.customers.map((c) => addr(c.id, c.address, c.phone, c.email)), ...db.suppliers.map((s) => addr(s.id, s.address, s.phone, s.email))]);
  db.suppliers.forEach((s) => terms.add(s.paymentTerms));
  await ins('TABPAYTERM', [...terms].map((t) => ({ PTE_0: termCode(t), DES_0: t })));
  await ins('SALESREP', db.users.filter((u) => u.role === 'SALES_REP' && u.erpCode).map((u) => ({ REPNUM_0: u.erpCode, REPNAM_0: u.name })));
  await ins('BPCARRIER', [{ BPTNUM_0: 'VRL', BPTNAM_0: 'VRL Logistics' }, { BPTNUM_0: 'BLUEDART', BPTNAM_0: 'BlueDart' }]);

  // sales orders
  const consCallOffs = new Set(db.requests.filter((r) => r.consignmentId).flatMap((r) => r.orderIds));
  const consLoc = new Map(db.consignments.map((c) => [c.id, c.location]));
  for (const o of db.orders) {
    const st = ORDER_X3[o.status] ?? ORDER_X3.confirmed;
    const delivered = ['dispatched', 'delivered'].includes(o.status);
    const net = Math.round(o.lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const rq = o.requestId ? db.requests.find((r) => r.id === o.requestId) : undefined;
    const loc = rq?.consignmentId && consCallOffs.has(o.id) ? consLoc.get(rq.consignmentId) ?? '' : '';
    await ins('SORDER', [{
      SOHNUM_0: o.number, BPCORD_0: o.customerId, SALFCY_0: o.site, ORDDAT_0: o.date, DEMDLVDAT_0: o.expectedDelivery, CUSORDREF_0: o.poNumber ?? '', REP_0: reps.get(o.salesRepId) ?? '',
      ZPORTREF_0: o.requestNumber ?? '', BPAADD_0: 'MAIN', INVSTA_0: delivered ? 3 : 1, ORDINVNOT_0: net, ORDINVATI_0: o.total, ...st,
    }]);
    await ins('SORDERQ', o.lines.map((l, i) => ({ SOHNUM_0: o.number, SOPLIN_0: (i + 1) * 1000, ITMREF_0: l.productId, QTY_0: l.quantity, DLVQTY_0: delivered ? l.quantity : 0, FOCFLG_0: l.free ? 2 : 1, STOLOC_0: loc })));
    await ins('SORDERP', o.lines.map((l, i) => ({ SOHNUM_0: o.number, SOPLIN_0: (i + 1) * 1000, ITMDES1_0: l.name, GROPRI_0: l.free ? 0 : l.unitPrice, NETPRI_0: l.quantity ? Math.round((l.lineTotal / l.quantity) * 10000) / 10000 : 0, DISCRGVAL1_0: l.discountPct })));
  }

  // stock: free stock per site from the mock, plus what open orders have allocated
  const allocated = new Map<string, number>();
  for (const o of db.orders) if (['confirmed', 'processing', 'packed'].includes(o.status) && !consCallOffs.has(o.id)) for (const l of o.lines) allocated.set(`${o.site}|${l.productId}`, (allocated.get(`${o.site}|${l.productId}`) ?? 0) + l.quantity);
  await ins('ITMMVT', db.products.flatMap((p) => db.sites.map((s) => {
    const alloc = allocated.get(`${s.code}|${p.id}`) ?? 0;
    return { ITMREF_0: p.id, STOFCY_0: s.code, PHYSTO_0: (p.stockBySite?.[s.code] ?? 0) + alloc, PHYALL_0: alloc };
  })));
  await ins('STOCK', db.consignments.flatMap((c) => c.lines.map((l) => ({ STOFCY_0: c.site, ITMREF_0: l.productId, LOC_0: c.location, QTYSTU_0: l.quantity }))));

  // deliveries and invoices
  for (const d of db.deliveries) {
    const shipped = d.timeline[0]?.at ?? d.plannedDate;
    await ins('SDELIVERY', [{ SDHNUM_0: d.number, SOHNUM_0: d.orderNumber, BPCORD_0: d.customerId, STOFCY_0: d.site, DLVDAT_0: d.plannedDate, SHIDAT_0: shipped, BPTNUM_0: carrierCode(d.carrier), ZTRKNUM_0: d.trackingRef ?? '', CFMFLG_0: 2 }]);
    await ins('SDELIVERYD', d.lines.map((l, i) => ({ SDHNUM_0: d.number, SDDLIN_0: (i + 1) * 1000, ITMREF_0: l.productId, QTY_0: l.quantity })));
  }
  for (const i of db.invoices) {
    const o = db.orders.find((x) => x.number === i.orderNumber);
    await ins('SINVOICE', [{ NUM_0: i.number, BPR_0: i.customerId, ACCDAT_0: i.date, FCY_0: o?.site ?? 'MAIN', AMTATI_0: i.amount }]);
    await ins('SINVOICED', [{ NUM_0: i.number, SOHNUM_0: i.orderNumber }]);
    await ins('GACCDUDATE', [{ NUM_0: i.number, BPR_0: i.customerId, DUDDAT_0: i.dueDate, TYP_0: 'INV', AMTCUR_0: i.amount, PAYCUR_0: i.paid }]);
  }
  for (const p of db.payments) {
    await ins('PAYMENTH', [{ NUM_0: p.id, BPR_0: p.customerId, ACCDAT_0: p.date, PAM_0: p.method, CHQNUM_0: p.reference, ZPORTREF_0: '', FCY_0: '', AMTCUR_0: p.amount }]);
    await ins('PAYMENTD', (p.allocations ?? []).map((a, k) => ({ NUM_0: p.id, LIN_0: k + 1, VCRNUM_0: a.invoiceId, AMTLIN_0: a.amount })));
  }

  // suppliers and purchasing
  await ins('BPSUPPLIER', db.suppliers.map((s) => ({ BPSNUM_0: s.id, BPSNAM_0: s.name, PTE_0: termCode(s.paymentTerms), CNTNAM_0: s.contactName, BPAADD_0: 'MAIN' })));
  await ins('ITMBPS', db.suppliers.flatMap((s) => s.productIds.map((pid) => ({ ITMREF_0: pid, BPSNUM_0: s.id }))));
  await ins('PPRICLIST', db.suppliers.flatMap((s) => s.productIds.map((pid) => ({ PLICRI1_0: pid, PLICRI2_0: s.id, PRI_0: Math.round((prod.get(pid)?.basePrice ?? 0) * 0.68 * 100) / 100 }))));
  for (const o of db.purchaseOrders) {
    await ins('PORDER', [{ POHNUM_0: o.number, BPSNUM_0: o.supplierId, POHFCY_0: o.site, ORDDAT_0: o.date, EXTRCPDAT_0: o.expectedDate, ZPORTREF_0: o.requestNumber ?? '', CLEFLG_0: o.status === 'cancelled' ? 2 : 1 }]);
    await ins('PORDERQ', o.lines.map((l, i) => ({ POHNUM_0: o.number, POPLIN_0: (i + 1) * 1000, ITMREF_0: l.productId, QTYUOM_0: l.quantity, RCPQTYUOM_0: l.receivedQty, NETPRI_0: l.unitCost })));
    for (const g of o.receipts) {
      await ins('PRECEIPT', [{ PTHNUM_0: g.number, BPSNUM_0: o.supplierId, PRHFCY_0: o.site, RCPDAT_0: g.at, CREUSR_0: g.by }]);
      await ins('PRECEIPTD', g.lines.map((l, i) => ({ PTHNUM_0: g.number, PTDLIN_0: (i + 1) * 1000, POHNUM_0: o.number, ITMREF_0: l.productId, QTYUOM_0: l.quantity })));
    }
  }

  // stock journal, so movement history starts filled
  const j: Record<string, unknown>[] = [];
  const J = (site: string, item: string, qty: number, type: number, ref: string, at: string, party = '', loc = '') => j.push({ STOFCY_0: site, ITMREF_0: item, QTYSTU_0: qty, TRSTYP_0: type, VCRNUM_0: ref, IPTDAT_0: at, BPRNUM_0: party, LOC_0: loc });
  for (const o of db.purchaseOrders) for (const g of o.receipts) for (const l of g.lines) J(o.site!, l.productId, l.quantity, TRSTYP.receipt, g.number, g.at, o.supplierName);
  for (const t of db.transfers) {
    const shipped = t.timeline.find((e) => e.status === 'initiated'), arrived = t.timeline.find((e) => e.status === 'transferred');
    for (const l of t.lines) {
      if (shipped) J(t.fromSite, l.productId, -l.quantity, TRSTYP.transferOut, t.erpRef ?? t.number, shipped.at, t.toSite);
      if (arrived) J(t.toSite, l.productId, l.receivedQty, TRSTYP.transferIn, t.erpRef ?? t.number, arrived.at, t.fromSite);
    }
  }
  for (const o of db.orders.filter((x) => x.status !== 'cancelled')) {
    const at = o.timeline.find((e) => e.status === 'confirmed')?.at ?? o.date;
    for (const l of o.lines) J(o.site!, l.productId, -l.quantity, consCallOffs.has(o.id) ? TRSTYP.consignmentOut : TRSTYP.sale, o.number, at, o.customerName);
  }
  for (const c of db.consignments) for (const m of c.movements) {
    if (m.kind === 'top_up') J(c.site, m.productId, -m.quantity, TRSTYP.consignmentIn, c.number, m.at, m.by, c.location);
    if (m.kind === 'call_off') J(c.site, m.productId, m.quantity, TRSTYP.consignmentOut, m.ref ?? '', m.at, c.customerName, c.location);
  }
  await ins('STOJOU', j);
}

export async function seedPortal(k: Knex, db: MockDb) {
  const r = new Repos(k);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of db.users as User[]) {
    await k('users').insert({
      id: u.id, email: u.email.toLowerCase(), password_hash: hash, name: u.name, phone: u.phone, role: u.role, status: u.status, title: u.title, region: u.region ?? null,
      customer_id: u.customerId ?? null, supplier_id: u.supplierId ?? null, erp_code: u.erpCode ?? null, allowed_sites: JSON.stringify(u.allowedSites ?? []), default_site: u.defaultSite ?? null,
      monthly_target: u.monthlyTarget ?? null, created_at: u.createdAt, last_login_at: u.lastLoginAt ?? null, failed_logins: 0,
    });
  }
  for (const [role, modules] of Object.entries(db.roleModules)) await k('role_modules').insert({ role, modules: JSON.stringify(modules), updated_at: new Date().toISOString() });
  await r.putSetting('workflow', db.workflow);
  const s = db.seq;
  for (const [name, next] of Object.entries({ request: s.request, quote: s.quote, pr: s.pr, transfer: s.transfer, payment: s.payment })) await k('sequences').insert({ name, next_value: next });

  for (const x of db.requests) await r.requests.insert(x);
  for (const x of db.quotes) await r.quotes.insert(x);
  for (const x of db.collectionNotes) await r.collectionNotes.insert(x);
  for (const x of db.purchaseRequests) await r.purchaseRequests.insert(x);
  for (const x of db.transfers) await r.transfers.insert(x);
  for (const c of db.consignments) await r.consignments.insert({ id: c.id, number: c.number, customerId: c.customerId, customerName: c.customerName, site: c.site, location: c.location, minQty: Object.fromEntries(c.lines.map((l) => [l.productId, l.minQty])), at: new Date().toISOString() });
  for (const x of db.announcements) await r.announcements.insert(x);
  for (const x of db.conversations) await r.conversations.insert(x);
  for (const x of db.notifications) await r.notifications.insert(x);
  for (const x of db.followUps) await r.followUps.insert(x);
  for (const x of db.visits) await r.visits.insert(x);
  for (const x of db.visitReports ?? []) await r.visitReports.insert(x);
  for (const x of db.activity) await r.activity.insert(x);
  for (const o of db.offers) if (Object.keys(o.presentation ?? {}).length) await r.presentations.insert({ id: o.id, presentation: o.presentation, at: new Date().toISOString() });
  for (const p of db.products as Product[]) await r.productContent.insert({ id: p.id, image: p.image, description: p.description, specs: p.specs, at: new Date().toISOString() });

  // portal side of ERP documents
  for (const o of db.orders as Order[]) {
    const deliveredAt = o.status === 'delivered' ? o.timeline.find((e) => e.status === 'delivered')?.at ?? o.date : undefined;
    await r.orderExt.insert({
      id: o.number, site: o.site, customerId: o.customerId, requestId: o.requestId, requestNumber: o.requestNumber, createdBy: o.createdBy, source: o.source, notes: o.notes,
      lines: o.lines.map((l, i) => ({ lineNo: (i + 1) * 1000, productId: l.productId, listPrice: l.listPrice, offerId: l.offerId, offerCode: l.offerCode, free: l.free, freeFor: l.freeFor, image: l.image })),
      timeline: o.timeline, comments: o.comments, creditOverride: o.creditOverride, deliveredAt, erpStatus: VIEW_STATUS(o.status), at: o.date,
    });
  }
  for (const d of db.deliveries) {
    await r.deliveryExt.insert({
      id: d.number, orderId: d.orderNumber, customerId: d.customerId, site: d.site, status: d.status, plannedDate: d.plannedDate, vehicle: d.vehicle, driver: d.driver,
      lines: d.lines.map((l) => ({ productId: l.productId, receivedQty: l.receivedQty, damagedQty: l.damagedQty })), pod: d.pod, failReason: d.failReason, timeline: d.timeline, at: d.timeline[0]?.at ?? d.plannedDate,
    });
  }
  for (const o of db.purchaseOrders) {
    const status = (['issued', 'acknowledged', 'pickup_confirmed', 'in_transit', 'cancelled'] as const).find((x) => x === o.status) ?? 'in_transit';
    await r.poExt.insert({ id: o.number, site: o.site, supplierId: o.supplierId, status, requestId: o.requestId, requestNumber: o.requestNumber, pickup: o.pickup, timeline: o.timeline, at: o.date });
  }
}

/** Fresh demo data set, keyed the way X3 keys it. */
export function demoData(): MockDb { return remap(createSeed()); }
