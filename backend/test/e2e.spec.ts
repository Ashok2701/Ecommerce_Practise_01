import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { buildApp } from '../src/main';
import { loadConfig } from '../src/config';
import type { Infra } from '../src/app.module';

/**
 * End-to-end: the real API on in-memory SQLite, with the simulated Sage X3
 * and the demo data. Each test walks one business flow through the HTTP API
 * and checks the effect in X3 (simulated tables) where it matters.
 */
let app: INestApplication;
let infra: Infra;
const tokens: Record<string, string> = {};
const EMAIL = {
  admin: 'admin@nexusb2b.in', manager: 'manager@nexusb2b.in', rep: 'ravi.kumar@nexusb2b.in', customer: 'accounts@abcdistributors.in',
  krishna: 'krishnahardware.vzg@gmail.com', supplier: 'supplier@nexusb2b.in', b2c: 'rahul.verma@example.com',
};
type Who = keyof typeof EMAIL;

const api = (who: Who, site = 'MAIN') => {
  const h = { Authorization: `Bearer ${tokens[who]}`, 'X-Site': site };
  const s = () => request(app.getHttpServer());
  return {
    get: (p: string) => s().get(p).set(h),
    post: (p: string, b: object = {}) => s().post(p).set(h).send(b),
    put: (p: string, b: object = {}) => s().put(p).set(h).send(b),
    patch: (p: string, b: object = {}) => s().patch(p).set(h).send(b),
  };
};

beforeAll(async () => {
  const cfg = loadConfig({});
  cfg.portalDb = { client: 'sqlite', file: ':memory:' };
  cfg.x3 = { ...cfg.x3, mode: 'sim', db: { client: 'sqlite', file: ':memory:' }, folderSchema: '', viewSchema: '' };
  cfg.seedDemo = true;
  cfg.jwtSecret = 'test-secret';
  const built = await buildApp(cfg);
  app = built.app; infra = built.infra;
  await app.init();
  for (const [who, email] of Object.entries(EMAIL)) {
    const r = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'demo123' });
    expect(r.status).toBe(200);
    tokens[who] = r.body.token;
  }
}, 60000);

afterAll(async () => { await app?.close(); await infra?.portal.destroy(); await infra?.x3.destroy(); });

describe('sign-in and access', () => {
  it('refuses wrong passwords, pending users and missing tokens with translation codes', async () => {
    const s = request(app.getHttpServer());
    expect((await s.post('/auth/login').send({ email: EMAIL.admin, password: 'nope' })).body.code).toBe('errors.auth.invalidCredentials');
    expect((await s.post('/auth/login').send({ email: 'imran.shaikh@nexusb2b.in', password: 'demo123' })).body.code).toBe('errors.auth.pendingApproval');
    const r = await s.get('/orders');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('errors.auth.unauthorized');
  });

  it('rejects a site the user may not use', async () => {
    const r = await api('customer', 'BLR-BR').get('/orders');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('errors.sites.notAllowed');
  });

  it('enforces module access on the server', async () => {
    expect((await api('customer').get('/inventory')).status).toBe(403);
    expect((await api('rep').put('/access/role-modules', { SALES_REP: [] })).status).toBe(403);
    expect((await api('supplier').get('/requests')).status).toBe(403);
  });

  it('keeps ADMIN locked modules when access is changed', async () => {
    const r = await api('admin').put('/access/role-modules', { ADMIN: ['dashboard'] });
    expect(r.status).toBe(200);
    expect(r.body.ADMIN).toEqual(expect.arrayContaining(['users', 'access', 'settings', 'dashboard', 'notifications']));
  });

  it('scopes data: customers see only their own records, suppliers only their own purchasing', async () => {
    const own = await api('customer').get('/orders');
    expect(own.status).toBe(200);
    expect(own.body.length).toBeGreaterThan(0);
    expect(own.body.every((o: { customerId: string }) => o.customerId === 'BP-HYD-0001')).toBe(true);
    const other = (await api('manager').get('/orders')).body.find((o: { customerId: string }) => o.customerId !== 'BP-HYD-0001');
    expect((await api('customer').get(`/orders/${other.id}`)).status).toBe(404);
    expect((await api('customer').get('/customers/BP-VJA-0002')).status).toBe(404);
    expect((await api('supplier').get('/purchase-orders')).body.every((o: { supplierId: string }) => o.supplierId === 'SUP-0007')).toBe(true);
    expect((await api('supplier').get('/suppliers/SUP-0012/catalog')).status).toBe(404);
  });
});

describe('sales request to sales order', () => {
  it('submits, converts once in X3 (idempotent) and allocates the stock', async () => {
    const before = (await api('manager').get('/inventory/BRG-6205-2RS')).body.position;
    const sub = await api('customer').post('/requests', { customerId: 'BP-HYD-0001', items: [{ productId: 'BRG-6205-2RS', quantity: 20 }], poNumber: 'PO-T1' });
    expect(sub.status).toBe(201);
    expect(sub.body.status).toBe('submitted');
    expect(sub.body.number).toMatch(/^SR-26-/);
    // the line is priced at the contract price for ABC Distributors (158), with the SKF quantity break (4% at 20)
    expect(sub.body.lines[0]).toMatchObject({ unitPrice: 158, discountPct: 4, offerCode: 'BRG-SKF-QTY' });

    const key = 'k-' + Date.now();
    const c1 = await api('manager').post(`/requests/${sub.body.id}/convert`, { idempotencyKey: key });
    expect(c1.status).toBe(200);
    expect(c1.body.status).toBe('converted');
    const orderId = c1.body.orderIds[0];
    const c2 = await api('manager').post(`/requests/${sub.body.id}/convert`, { idempotencyKey: key });
    expect(c2.body.orderIds).toEqual([orderId]);
    expect(await infra.x3('SORDER').where({ ZPORTREF_0: `${sub.body.number}/${key}` }).count({ n: '*' }).first()).toMatchObject({ n: 1 });

    const order = (await api('customer').get(`/orders/${orderId}`)).body;
    expect(order).toMatchObject({ status: 'confirmed', requestId: sub.body.id, poNumber: 'PO-T1', customerId: 'BP-HYD-0001' });
    const after = (await api('manager').get('/inventory/BRG-6205-2RS')).body.position;
    expect(after.allocated).toBe(before.allocated + 20);
    expect(after.available).toBe(before.available - 20);
  });

  it('asks for confirmation when prices changed since submission', async () => {
    const review = (await api('manager').get('/requests?view=review')).body as { id: string }[];
    let changed: string | undefined;
    for (const r of review) if ((await api('manager').get(`/requests/${r.id}/conversion-preview`)).body.priceChanged) { changed = r.id; break; }
    expect(changed).toBeDefined();
    const r1 = await api('manager').post(`/requests/${changed}/convert`, { idempotencyKey: 'pc-1', overrideCredit: true, overrideReason: 'test' });
    expect(r1.body.code).toBe('errors.requests.priceChanged');
    const r2 = await api('manager').post(`/requests/${changed}/convert`, { idempotencyKey: 'pc-2', acceptPriceChange: true, overrideCredit: true, overrideReason: 'test' });
    expect(r2.status).toBe(200);
  });

  it('blocks a request over the credit limit in block mode, and flags it in warn mode', async () => {
    const wf = (await api('manager').get('/settings/workflow')).body;
    await api('manager').put('/settings/workflow', { ...wf, creditMode: 'block' });
    const blocked = await api('krishna').post('/requests', { customerId: 'BP-VTZ-0006', items: [{ productId: 'PT-DRL-18V-BL', quantity: 20 }] });
    expect(blocked.body.code).toBe('errors.requests.creditBlocked');
    await api('manager').put('/settings/workflow', { ...wf, creditMode: 'warn' });
    const flagged = await api('krishna').post('/requests', { customerId: 'BP-VTZ-0006', items: [{ productId: 'PT-DRL-18V-BL', quantity: 20 }] });
    expect(flagged.status).toBe(201);
    expect(flagged.body.credit.over).toBe(true);
    const conv = await api('manager').post(`/requests/${flagged.body.id}/convert`, { idempotencyKey: 'cr-1' });
    expect(conv.body.code).toBe('errors.requests.creditOverrideNeeded');
  });

  it('converts a paid retail (B2C) request automatically', async () => {
    const r = await api('b2c').post('/requests', { customerId: 'BP-B2C-0001', items: [{ productId: 'LUB-SPR-RP7', quantity: 24 }] });
    expect(r.body).toMatchObject({ status: 'converted', autoApproved: true, paid: true });
  });

  it('adds free goods lines from ERP offers', async () => {
    const r = await api('rep').post('/requests', { customerId: 'BP-HYD-0001', items: [{ productId: 'PT-AGR-100', quantity: 2 }] });
    expect(r.status).toBe(201);
    const free = r.body.lines.find((l: { free?: boolean }) => l.free);
    expect(free).toMatchObject({ unitPrice: 0, freeFor: 'PT-AGR-100', offerCode: 'PT-AGR-BITS' });
  });
});

describe('dispatch, proof of delivery and payment', () => {
  it('takes an order through the warehouse, delivery and payment', async () => {
    const sub = await api('customer').post('/requests', { customerId: 'BP-HYD-0001', items: [{ productId: 'VLV-BV-25-SS', quantity: 4 }] });
    const conv = await api('manager').post(`/requests/${sub.body.id}/convert`, { idempotencyKey: 'flow-1' });
    const id = conv.body.orderIds[0];
    for (const step of ['allocated', 'allocated', 'dispatched']) expect((await api('manager').post(`/sim/orders/${id}/advance`)).body.step).toBe(step);
    const order = (await api('manager').get(`/orders/${id}`)).body;
    expect(order.status).toBe('dispatched');
    expect(order.invoiceId).toBeTruthy();
    expect(order.deliveryId).toBeTruthy();

    // staff need a signature or a photo
    const noProof = await api('manager').post(`/deliveries/${order.deliveryId}/pod`, { receivedBy: 'Venkat' });
    expect(noProof.body.code).toBe('errors.deliveries.proof');
    const pod = await api('manager').post(`/deliveries/${order.deliveryId}/pod`, { receivedBy: 'Venkat', signature: 'data:image/png;base64,AAAA', lines: [{ productId: 'VLV-BV-25-SS', receivedQty: 4, damagedQty: 0 }] });
    expect(pod.body.status).toBe('delivered');
    expect((await api('customer').get(`/orders/${id}`)).body.status).toBe('delivered');

    // remittance advice -> verified by finance -> receipt posted in X3, invoice paid
    const inv = (await api('customer').get(`/invoices/${order.invoiceId}`)).body.invoice;
    const adv = await api('customer').post('/payments', { customerId: 'BP-HYD-0001', invoiceIds: [inv.id], amount: inv.amount, method: 'NEFT', reference: 'UTR123', date: new Date().toISOString() });
    expect(adv.body.status).toBe('pending_verification');
    expect((await api('customer').post(`/payments/${adv.body.id}/verify`)).status).toBe(403);
    const ver = await api('manager').post(`/payments/${adv.body.id}/verify`);
    expect(ver.body.status).toBe('posted');
    expect((await api('customer').get(`/invoices/${order.invoiceId}`)).body.invoice.status).toBe('paid');
    expect(await infra.x3('PAYMENTH').where({ ZPORTREF_0: adv.body.id }).first()).toBeTruthy();
  });
});

describe('quotes', () => {
  it('limits rep discounts and raises a request at the quoted prices on acceptance', async () => {
    const q = await api('rep').post('/quotes', { customerId: 'BP-HYD-0001', items: [{ productId: 'VLV-GV-50-CI', quantity: 10 }] });
    expect(q.body.status).toBe('draft');
    const list = q.body.lines[0].listPrice;
    const validUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    await api('rep').put(`/quotes/${q.body.id}`, { lines: [{ productId: 'VLV-GV-50-CI', quantity: 10, unitPrice: list * 0.8 }], validUntil });
    expect((await api('rep').post(`/quotes/${q.body.id}/send`)).body.code).toBe('errors.quotes.discountNeedsApproval');
    await api('rep').put(`/quotes/${q.body.id}`, { lines: [{ productId: 'VLV-GV-50-CI', quantity: 10, unitPrice: list * 0.9 }], validUntil });
    expect((await api('rep').post(`/quotes/${q.body.id}/send`)).body.status).toBe('sent');
    const acc = await api('customer').post(`/quotes/${q.body.id}/accept`, { poNumber: 'PO-Q1' });
    expect(acc.status).toBe(200);
    expect(acc.body.quote.status).toBe('accepted');
    expect(acc.body.request).toMatchObject({ quoteId: q.body.id, status: 'submitted' });
    expect(acc.body.request.lines[0].unitPrice).toBeCloseTo(list * 0.9, 2);
  });
});

describe('inventory', () => {
  it('moves stock between sites through the transfer workflow', async () => {
    const free = async (site: string) => (await api('manager', site).get('/inventory/LUB-SPR-RP7')).body.position.available;
    const mainBefore = await free('MAIN'), mumBefore = await free('MUM-WH');
    const t = await api('rep').post('/transfers', { fromSite: 'MAIN', toSite: 'MUM-WH', items: [{ productId: 'LUB-SPR-RP7', quantity: 48 }], reason: 'Test' });
    expect(t.body.status).toBe('pending');
    await api('manager').post(`/transfers/${t.body.id}/approve`);
    const init = await api('manager').post(`/transfers/${t.body.id}/initiate`);
    expect(init.body.erpRef).toMatch(/^STR/);
    expect(await free('MAIN')).toBe(mainBefore - 48);
    await api('manager', 'MUM-WH').post(`/transfers/${t.body.id}/receive`, { lines: [{ productId: 'LUB-SPR-RP7', quantity: 40 }] });
    expect(await free('MUM-WH')).toBe(mumBefore + 40);
    expect((await api('manager').post(`/transfers/${t.body.id}/complete`)).body.status).toBe('completed');
  });

  it('checks consignment quantities and tops them up from free stock', async () => {
    const c = (await api('customer').get('/consignments/cons_1')).body;
    const line = c.lines[0];
    const tooMuch = await api('customer').post('/consignments/cons_1/call-offs', { items: [{ productId: line.productId, quantity: line.available + 1 }] });
    expect(tooMuch.body.code).toBe('errors.consignment.notEnough');
    const ok = await api('customer').post('/consignments/cons_1/call-offs', { items: [{ productId: line.productId, quantity: 1 }] });
    expect(ok.body).toMatchObject({ consignmentId: 'cons_1', status: 'submitted' });
    const top = await api('manager').post('/consignments/cons_1/top-ups', { items: [{ productId: line.productId, quantity: 10 }] });
    expect(top.body.lines.find((l: { productId: string }) => l.productId === line.productId).quantity).toBe(line.quantity + 10);
  });
});

describe('purchasing', () => {
  it('turns a supplier pickup offer into a purchase order and receives it', async () => {
    const pr = await api('supplier').post('/purchase-requests', { supplierId: 'SUP-0012', items: [{ productId: 'BRG-6205-2RS', quantity: 100 }] });
    expect(pr.body).toMatchObject({ supplierId: 'SUP-0007', source: 'pickup', status: 'submitted' }); // pinned to the supplier's own record
    const conv = await api('manager').post(`/purchase-requests/${pr.body.id}/convert`, { expectedDate: new Date(Date.now() + 5 * 86400000).toISOString() });
    expect(conv.body.status).toBe('converted');
    const poId = conv.body.orderId;
    expect((await api('supplier').get(`/purchase-orders/${poId}`)).body.status).toBe('acknowledged');
    expect((await api('supplier').post(`/purchase-orders/${poId}/pickup`, { date: new Date().toISOString(), vehicle: '' })).body.code).toBe('errors.purchasing.pickupDetails');
    await api('supplier').post(`/purchase-orders/${poId}/pickup`, { date: new Date().toISOString(), vehicle: 'MH 04 AB 1234' });
    expect((await api('supplier').post(`/purchase-orders/${poId}/dispatch`)).body.status).toBe('in_transit');
    const before = (await api('manager').get('/inventory/BRG-6205-2RS')).body.position;
    const part = await api('manager').post(`/purchase-orders/${poId}/receipts`, { lines: [{ productId: 'BRG-6205-2RS', quantity: 60 }] });
    expect(part.body.status).toBe('partly_received');
    const after = (await api('manager').get('/inventory/BRG-6205-2RS')).body.position;
    expect(after.onHand).toBe(before.onHand + 60);
    expect((await api('manager').post(`/purchase-orders/${poId}/receipts`, { lines: [{ productId: 'BRG-6205-2RS', quantity: 40 }] })).body.status).toBe('received');
  });
});

describe('offers and content', () => {
  it('shows customers only active, visible offers; staff see all', async () => {
    const mine = (await api('customer').get('/offers')).body as { id: string; status: string }[];
    expect(mine.every((o) => o.status === 'active')).toBe(true);
    expect(mine.find((o) => o.id === 'MONSOON-VLV')).toBeUndefined();
    const all = (await api('manager').get('/offers?manage=true')).body as { id: string }[];
    expect(all.find((o) => o.id === 'MONSOON-VLV')).toBeDefined();
    expect((await api('customer').get('/offers/MONSOON-VLV')).status).toBe(404);
  });

  it('notifies on announcements and messages', async () => {
    const a = await api('manager').post('/announcements', { title: 'Test notice', body: 'Hello', audience: ['CUSTOMER_B2B'], status: 'published' });
    expect(a.status).toBe(201);
    const n = (await api('customer').get('/notifications')).body as { title: string }[];
    expect(n.some((x) => x.title === 'Test notice')).toBe(true);
    const conv = await api('customer').post('/conversations', { subject: 'Help', body: 'Where is my order?' });
    expect(conv.body.participantIds).toEqual(expect.arrayContaining(['usr_cus_1', 'usr_rep_1', 'usr_mgr_1']));
  });
});
