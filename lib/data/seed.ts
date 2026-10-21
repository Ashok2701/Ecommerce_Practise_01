import type {
  Announcement, AppNotification, Conversation, Customer, FollowUp, Invoice, VisitReport, Offer, Order, OrderStatus, Payment, Product, User, Visit, ActivityItem,
} from '@/types/domain';
import { PRODUCTS } from './catalog';
import { buildOrderTotals, customerUnitPrice } from '@/lib/domain/pricing';
import { DEFAULT_ROLE_MODULES, type ModuleId } from '@/lib/access/modules';
import type { Role, Site, SalesRequest, WorkflowSettings, Supplier, PurchaseRequest, PurchaseOrder, PurchaseLine, Consignment, ConsignmentLine, StockTransfer, TransferLine, TransferStatus, Quote, QuoteLine, QuoteStatus, Delivery, CollectionNote } from '@/types/domain';
import { creditCheck } from '@/lib/domain/credit';

export interface MockDb {
  version: number;
  users: User[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  invoices: Invoice[];
  payments: Payment[];
  announcements: Announcement[];
  offers: Offer[];
  conversations: Conversation[];
  notifications: AppNotification[];
  followUps: FollowUp[];
  visits: Visit[];
  activity: ActivityItem[];
  visitReports: VisitReport[];
  /** Module access per role (YES/NO), edited on the Module access screen. */
  roleModules: Record<Role, ModuleId[]>;
  /** Site master (from the ERP). */
  sites: Site[];
  /** Sales requests (every sales order starts as one). */
  requests: SalesRequest[];
  workflow: WorkflowSettings;
  suppliers: Supplier[];
  purchaseRequests: PurchaseRequest[];
  purchaseOrders: PurchaseOrder[];
  /** Customer consignment stock held at our warehouse locations. */
  consignments: Consignment[];
  /** Stock transfers between sites. */
  transfers: StockTransfer[];
  quotes: Quote[];
  deliveries: Delivery[];
  /** Promises to pay, reminders and call notes for collections. */
  collectionNotes: CollectionNote[];
  seq: { order: number; invoice: number; request: number; pr: number; po: number; grn: number; transfer: number; quote: number; delivery: number; payment: number };
}

// deterministic PRNG so the demo looks the same for everyone
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const DAY = 86400000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600000).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const addr = (line1: string, city: string, state: string, postalCode: string) => ({ line1, city, state, postalCode, country: 'India' });

/** Sample site master. In production this list comes from the ERP. */
export const SITES: Site[] = [
  { code: 'MAIN', name: 'Hyderabad distribution centre', city: 'Hyderabad', kind: 'warehouse', priceFactor: 1 },
  { code: 'MUM-WH', name: 'Mumbai warehouse', city: 'Bhiwandi', kind: 'warehouse', priceFactor: 1.02 },
  { code: 'MAA-WH', name: 'Chennai warehouse', city: 'Chennai', kind: 'warehouse', priceFactor: 1 },
  { code: 'BLR-BR', name: 'Bengaluru branch', city: 'Bengaluru', kind: 'branch', priceFactor: 1.03 },
];
const SITE_BY_STATE: Record<string, string> = { Telangana: 'MAIN', 'Andhra Pradesh': 'MAIN', Maharashtra: 'MUM-WH', Gujarat: 'MUM-WH', 'Tamil Nadu': 'MAA-WH', Karnataka: 'BLR-BR' };

export const DEFAULT_WORKFLOW: WorkflowSettings = {
  creditMode: 'warn', creditOverrides: {}, autoApprove: { enabled: false, maxTotal: 25000 }, b2cAutoConvert: true, stockHoldHours: 0, requestExpiryDays: 14,
};

export function createSeed(): MockDb {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  const reps: User[] = [
    { id: 'usr_rep_1', erpCode: 'REP-01', name: 'Ravi Kumar', email: 'ravi.kumar@nexusb2b.in', phone: '+91 98480 11223', role: 'SALES_REP', status: 'active', title: 'Senior Sales Representative', region: 'Andhra Pradesh & Telangana', monthlyTarget: 1800000, createdAt: ago(700), lastLoginAt: ago(0, 1) },
    { id: 'usr_rep_2', erpCode: 'REP-02', name: 'Priya Sharma', email: 'priya.sharma@nexusb2b.in', phone: '+91 98201 44556', role: 'SALES_REP', status: 'active', title: 'Sales Representative', region: 'Maharashtra & Gujarat', monthlyTarget: 1500000, createdAt: ago(420), lastLoginAt: ago(0, 3) },
    { id: 'usr_rep_3', erpCode: 'REP-03', name: 'Arjun Reddy', email: 'arjun.reddy@nexusb2b.in', phone: '+91 99001 77889', role: 'SALES_REP', status: 'active', title: 'Sales Representative', region: 'Karnataka', monthlyTarget: 1200000, createdAt: ago(300), lastLoginAt: ago(1) },
    { id: 'usr_rep_4', erpCode: 'REP-04', name: 'Meera Nair', email: 'meera.nair@nexusb2b.in', phone: '+91 94440 22331', role: 'SALES_REP', status: 'active', title: 'Sales Representative', region: 'Tamil Nadu', monthlyTarget: 1300000, createdAt: ago(250), lastLoginAt: ago(0, 6) },
  ];

  const C = (id: number, code: string, name: string, contactName: string, email: string, phone: string, a: ReturnType<typeof addr>, rep: number, tier: 'A' | 'B' | 'C', creditLimit: number, status: Customer['status'] = 'active'): Customer => ({
    id: `cus_${String(id).padStart(3, '0')}`, code, type: 'B2B', name, contactName, email, phone, gstin: `${36 + (id % 4)}AAB${code.slice(-3)}C1Z${id % 9}`,
    address: a, billingAddress: a, status, salesRepId: reps[rep].id, priceTier: tier, tierDiscountPct: tier === 'A' ? 12 : tier === 'B' ? 7 : 3,
    contractPrices: {}, creditLimit, outstanding: 0, paymentTerms: tier === 'A' ? 'Net 45' : 'Net 30', since: ago(200 + id * 60),
  });

  const customers: Customer[] = [
    C(1, 'BP-HYD-0001', 'ABC Distributors', 'Venkat Rao', 'accounts@abcdistributors.in', '+91 40 2754 1100', addr('Plot 14, IDA Balanagar', 'Hyderabad', 'Telangana', '500037'), 0, 'A', 2500000),
    C(2, 'BP-VJA-0002', 'Sri Lakshmi Traders', 'Lakshmi Prasad', 'srilakshmi.traders@gmail.com', '+91 866 247 3390', addr('12-4-56, Governorpet', 'Vijayawada', 'Andhra Pradesh', '520002'), 0, 'B', 900000),
    C(3, 'BP-MAA-0003', 'Metro Industrial Supplies', 'Karthik Subramanian', 'purchase@metroindustrial.co.in', '+91 44 2625 8800', addr('No. 45, SIDCO Industrial Estate, Guindy', 'Chennai', 'Tamil Nadu', '600032'), 3, 'A', 3000000),
    C(4, 'BP-BOM-0004', 'National Wholesale', 'Rajesh Mehta', 'orders@nationalwholesale.in', '+91 22 2850 6611', addr('Gala 7, Andheri Kurla Road', 'Mumbai', 'Maharashtra', '400059'), 1, 'A', 4000000),
    C(5, 'BP-PNQ-0005', 'Deccan Engineering Stores', 'Sanjay Kulkarni', 'deccan.eng@outlook.com', '+91 20 2712 4455', addr('S. No. 112, Bhosari MIDC', 'Pune', 'Maharashtra', '411026'), 1, 'B', 1200000),
    C(6, 'BP-VTZ-0006', 'Krishna Hardware & Tools', 'Murali Krishna', 'krishnahardware.vzg@gmail.com', '+91 891 256 7781', addr('D.No. 9-1-22, Gajuwaka', 'Visakhapatnam', 'Andhra Pradesh', '530026'), 0, 'C', 500000),
    C(7, 'BP-BLR-0007', 'Bharat Machinery Mart', 'Anil Gowda', 'procurement@bharatmachinery.in', '+91 80 2839 3300', addr('No. 88, Peenya 2nd Stage', 'Bengaluru', 'Karnataka', '560058'), 2, 'B', 1500000),
    C(8, 'BP-RJY-0008', 'Godavari Agro Equipments', 'Satyanarayana Murthy', 'godavariagro@yahoo.co.in', '+91 883 246 1290', addr('Main Road, Danavaipeta', 'Rajahmundry', 'Andhra Pradesh', '533103'), 0, 'C', 400000, 'on_hold'),
    C(9, 'BP-CJB-0009', 'Pioneer Electricals', 'Senthil Kumar', 'pioneer.elec@pioneercbe.com', '+91 422 257 9900', addr('23, Avinashi Road, Peelamedu', 'Coimbatore', 'Tamil Nadu', '641004'), 3, 'B', 1100000),
    C(10, 'BP-AMD-0010', 'Royal Fasteners Co.', 'Hitesh Patel', 'sales@royalfasteners.in', '+91 79 2589 4412', addr('Shed 31, GIDC Vatva', 'Ahmedabad', 'Gujarat', '382445'), 1, 'B', 1000000),
    C(11, 'BP-NAG-0011', 'Sunrise Pumps & Motors', 'Prakash Deshmukh', 'sunrisepumps@gmail.com', '+91 712 223 6678', addr('Plot B-12, Hingna MIDC', 'Nagpur', 'Maharashtra', '440016'), 1, 'C', 600000),
    C(12, 'BP-GNT-0012', 'Venkateswara Industrial Corp', 'Srinivas Chowdary', 'vic.guntur@gmail.com', '+91 863 223 4410', addr('Auto Nagar, Phase 2', 'Guntur', 'Andhra Pradesh', '522001'), 0, 'B', 800000, 'inactive'),
    C(13, 'BP-MYS-0013', 'Cauvery Tools & Spares', 'Ramesh Hegde', 'cauverytools@gmail.com', '+91 821 241 7765', addr('Hebbal Industrial Area', 'Mysuru', 'Karnataka', '570016'), 2, 'C', 450000),
    C(14, 'BP-MDU-0014', 'Meenakshi Engineering Works', 'Balaji Pandian', 'mew.madurai@gmail.com', '+91 452 253 8812', addr('K. Pudur Industrial Estate', 'Madurai', 'Tamil Nadu', '625007'), 3, 'C', 500000),
  ];
  // negotiated contract prices for key accounts
  customers[0].contractPrices = { prd_001: 158, prd_015: 205, prd_019: 1010, prd_023: 2140 };
  customers[2].contractPrices = { prd_006: 1240, prd_011: 11200, prd_027: 25900 };
  customers[3].contractPrices = { prd_016: 112, prd_017: 66, prd_028: 4890 };

  const customerUsers: User[] = customers.map((c, i) => ({
    id: `usr_cus_${i + 1}`, name: c.contactName, email: c.email, phone: c.phone, role: 'CUSTOMER_B2B', status: c.status === 'inactive' ? 'inactive' : 'active',
    title: `Purchase Head, ${c.name}`, customerId: c.id, erpCode: c.code, createdAt: c.since, lastLoginAt: ago(i % 5, i),
  }));

  const users: User[] = [
    { id: 'usr_admin_1', name: 'Anita Desai', email: 'admin@nexusb2b.in', phone: '+91 98450 00001', role: 'ADMIN', status: 'active', title: 'Platform Administrator', createdAt: ago(900), lastLoginAt: ago(0, 0) },
    { id: 'usr_mgr_1', name: 'Suresh Iyer', email: 'manager@nexusb2b.in', phone: '+91 98450 00002', role: 'SUPERVISOR', status: 'active', title: 'Regional Sales Manager – South & West', createdAt: ago(800), lastLoginAt: ago(0, 2) },
    { id: 'usr_mgr_2', name: 'Kavita Joshi', email: 'kavita.joshi@nexusb2b.in', phone: '+91 98450 00003', role: 'SUPERVISOR', status: 'active', title: 'Operations Manager', createdAt: ago(500), lastLoginAt: ago(2) },
    ...reps,
    { id: 'usr_rep_5', name: 'Imran Shaikh', email: 'imran.shaikh@nexusb2b.in', phone: '+91 97300 66778', role: 'SALES_REP', status: 'pending', title: 'Sales Representative (Trainee)', region: 'Maharashtra', monthlyTarget: 600000, createdAt: ago(2) },
    ...customerUsers,
    { id: 'usr_sup_1', name: 'Deepak Malhotra', email: 'supplier@nexusb2b.in', phone: '+91 22 4012 7700', role: 'SUPPLIER', status: 'active', title: 'Key Account Manager, Precision Bearings Ltd', erpCode: 'SUP-0007', createdAt: ago(600), lastLoginAt: ago(1, 2) },
    { id: 'usr_b2c_1', name: 'Rahul Verma', email: 'rahul.verma@example.com', phone: '+91 98765 43210', role: 'CUSTOMER_B2C', status: 'active', title: 'Retail customer', customerId: 'cus_b2c_1', erpCode: 'BP-B2C-0001', createdAt: ago(45), lastLoginAt: ago(3) },
    { id: 'usr_cus_p1', name: 'Naveen Babu', email: 'naveen@tirupatisteel.in', phone: '+91 877 228 1200', role: 'CUSTOMER_B2B', status: 'pending', title: 'Owner, Tirupati Steel Agencies (new signup)', createdAt: ago(1) },
    { id: 'usr_cus_p2', name: 'Farhan Qureshi', email: 'farhan@qureshibrothers.com', phone: '+91 40 2456 9981', role: 'CUSTOMER_B2B', status: 'pending', title: 'Director, Qureshi Brothers (new signup)', createdAt: ago(0, 5) },
  ];

  // ---------- orders ----------
  const orders: Order[] = [];
  const invoices: Invoice[] = [];
  let seqOrder = 4100;
  let seqInv = 2210;
  const activeCustomers = customers.filter((c) => c.status !== 'inactive');
  for (let i = 0; i < 96; i++) {
    const cust = i < 14 ? activeCustomers[i % activeCustomers.length] : pick(activeCustomers);
    const age = i < 10 ? r() * 1.2 : Math.floor(r() * 120) + (r() > 0.5 ? 0 : 1);
    const nLines = 1 + Math.floor(r() * 4);
    const prods = new Set<Product>();
    while (prods.size < nLines) prods.add(pick(PRODUCTS));
    const lines = [...prods].map((p) => ({ product: p, quantity: p.moq * (1 + Math.floor(r() * 4)) }));
    let status: OrderStatus;
    if (age < 1.3) status = r() > 0.45 ? 'pending_approval' : 'confirmed';
    else if (age < 4) status = pick(['confirmed', 'processing', 'packed', 'pending_approval'] as OrderStatus[]);
    else if (age < 9) status = pick(['packed', 'dispatched', 'dispatched'] as OrderStatus[]);
    else status = r() > 0.92 ? 'cancelled' : 'delivered';
    const date = ago(age, Math.floor(r() * 8));
    const rep = reps.find((u) => u.id === cust.salesRepId)!;
    const byRep = r() > 0.45;
    const createdBy = byRep ? { id: rep.id, name: rep.name, role: 'SALES_REP' as const } : { id: customerUsers.find((u) => u.customerId === cust.id)!.id, name: cust.contactName, role: 'CUSTOMER_B2B' as const };
    const totals = buildOrderTotals(lines, cust, []);
    const flow: OrderStatus[] = ['pending_approval', 'confirmed', 'processing', 'packed', 'dispatched', 'delivered'];
    const idx = flow.indexOf(status);
    const timeline = (status === 'cancelled' ? ['pending_approval', 'cancelled'] : flow.slice(0, idx + 1)).map((s, k) => ({
      status: s as OrderStatus, at: new Date(new Date(date).getTime() + k * DAY * 0.9 + (k ? 3600000 : 0)).toISOString(),
      by: k === 0 ? createdBy.name : s === 'confirmed' ? 'Suresh Iyer' : 'Warehouse – Hyderabad DC',
      note: s === 'confirmed' ? 'Approved and posted to Sage X3' : s === 'dispatched' ? `LR No. VRL${4400000 + i * 37} via VRL Logistics` : undefined,
    }));
    const id = `ord_${seqOrder}`;
    const o: Order = {
      id, number: `SO-26-${String(seqOrder++).padStart(5, '0')}`, customerId: cust.id, customerName: cust.name, salesRepId: rep.id, createdBy,
      source: byRep ? 'sales_app' : 'portal', date, expectedDelivery: new Date(new Date(date).getTime() + (4 + Math.floor(r() * 4)) * DAY).toISOString(),
      status, ...totals, poNumber: r() > 0.4 ? `PO/${cust.code.slice(3, 6)}/${2600 + i}` : undefined, deliveryAddress: cust.address, billingAddress: cust.billingAddress,
      timeline, comments: [], erpRef: idx >= 1 ? `SOH${260000 + i * 13}` : undefined,
    };
    if (['dispatched', 'delivered'].includes(status)) {
      const invDate = timeline.find((t) => t.status === 'dispatched')!.at;
      const due = new Date(new Date(invDate).getTime() + (cust.priceTier === 'A' ? 45 : 30) * DAY).toISOString();
      const overdue = new Date(due).getTime() < Date.now();
      const paidFull = age > 50 ? r() > 0.15 : age > 25 ? r() > 0.55 : r() > 0.85;
      const partial = !paidFull && r() > 0.7;
      const inv: Invoice = {
        id: `inv_${seqInv}`, number: `INV-26-${String(seqInv++).padStart(5, '0')}`, orderId: o.id, orderNumber: o.number, customerId: cust.id, date: invDate, dueDate: due,
        amount: o.total, paid: paidFull ? o.total : partial ? Math.round(o.total * 0.4) : 0,
        status: paidFull ? 'paid' : overdue ? 'overdue' : partial ? 'partially_paid' : 'unpaid',
      };
      invoices.push(inv);
      o.invoiceId = inv.id;
    }
    orders.push(o);
  }
  orders.sort((a, b) => b.date.localeCompare(a.date));

  // demo: a large pending order that breaches Krishna Hardware's credit limit
  {
    const cust = customers.find((c) => c.id === 'cus_006')!;
    const rep = reps[0];
    const items = [{ product: PRODUCTS[25], quantity: 2 }, { product: PRODUCTS[26], quantity: 4 }, { product: PRODUCTS[11], quantity: 6 }];
    const date = ago(0, 2);
    orders.push({
      id: `ord_${seqOrder}`, number: `SO-26-${String(seqOrder++).padStart(5, '0')}`, customerId: cust.id, customerName: cust.name, salesRepId: rep.id,
      createdBy: { id: rep.id, name: rep.name, role: 'SALES_REP' }, source: 'sales_app', date, expectedDelivery: ahead(6), status: 'pending_approval',
      ...buildOrderTotals(items, cust, []), poNumber: 'PO/VTZ/2911', notes: 'Urgent – new workshop line commissioning.', deliveryAddress: cust.address, billingAddress: cust.billingAddress,
      timeline: [{ status: 'pending_approval', at: date, by: rep.name, note: 'Submitted for approval' }], comments: [],
    });
  }
  orders.sort((a, b) => b.date.localeCompare(a.date));

  // demo: a retail (B2C) customer who pays online; list prices, no credit limit
  {
    const cust: Customer = {
      id: 'cus_b2c_1', code: 'BP-B2C-0001', type: 'B2C', name: 'Rahul Verma', contactName: 'Rahul Verma', email: 'rahul.verma@example.com', phone: '+91 98765 43210', gstin: '',
      address: addr('Flat 302, Green Meadows, Kondapur', 'Hyderabad', 'Telangana', '500084'), billingAddress: addr('Flat 302, Green Meadows, Kondapur', 'Hyderabad', 'Telangana', '500084'),
      status: 'active', salesRepId: '', priceTier: 'C', tierDiscountPct: 0, contractPrices: {}, creditLimit: 0, outstanding: 0, paymentTerms: 'Prepaid', since: ago(45),
    };
    customers.push(cust);
    const by = { id: 'usr_b2c_1', name: cust.contactName, role: 'CUSTOMER_B2C' as const };
    const mk = (age: number, items: { product: Product; quantity: number }[], status: OrderStatus) => {
      const date = ago(age);
      const flow: OrderStatus[] = ['confirmed', 'processing', 'packed', 'dispatched', 'delivered'];
      const o: Order = {
        id: `ord_${seqOrder}`, number: `SO-26-${String(seqOrder++).padStart(5, '0')}`, customerId: cust.id, customerName: cust.name, salesRepId: '', createdBy: by,
        source: 'portal', date, expectedDelivery: new Date(new Date(date).getTime() + 3 * DAY).toISOString(), status, ...buildOrderTotals(items, cust, []),
        deliveryAddress: cust.address, billingAddress: cust.billingAddress, comments: [],
        timeline: flow.slice(0, flow.indexOf(status) + 1).map((st, k) => ({ status: st, at: new Date(new Date(date).getTime() + k * DAY * 0.8).toISOString(), by: k === 0 ? 'Online payment' : 'Warehouse – Hyderabad DC', note: k === 0 ? 'Paid online, confirmed automatically' : undefined })),
      };
      const inv: Invoice = { id: `inv_${seqInv}`, number: `INV-26-${String(seqInv++).padStart(5, '0')}`, orderId: o.id, orderNumber: o.number, customerId: cust.id, date, dueDate: date, amount: o.total, paid: o.total, status: 'paid' };
      invoices.push(inv); o.invoiceId = inv.id; orders.push(o);
    };
    mk(30, [{ product: PRODUCTS[0], quantity: PRODUCTS[0].moq }], 'delivered');
    mk(9, [{ product: PRODUCTS[12], quantity: PRODUCTS[12].moq }, { product: PRODUCTS[4], quantity: PRODUCTS[4].moq }], 'delivered');
    mk(1, [{ product: PRODUCTS[7], quantity: PRODUCTS[7].moq }], 'packed');
  }
  orders.sort((a, b) => b.date.localeCompare(a.date));

  // derive customer balances from invoices
  for (const c of customers) {
    c.outstanding = invoices.filter((i) => i.customerId === c.id).reduce((s, i) => s + (i.amount - i.paid), 0);
    const last = orders.find((o) => o.customerId === c.id && o.status !== 'cancelled');
    c.lastOrderDate = last?.date;
    c.lastOrderAmount = last?.total;
  }

  { const k = customers.find((c) => c.id === 'cus_006')!; k.creditLimit = Math.ceil((k.outstanding + 80000) / 10000) * 10000; }

  const payments: Payment[] = invoices.filter((i) => i.paid > 0).map((i, k) => ({
    id: `pay_${k + 1}`, customerId: i.customerId, date: new Date(new Date(i.date).getTime() + (10 + (k % 20)) * DAY).toISOString(), amount: i.paid,
    method: (['NEFT', 'RTGS', 'Cheque', 'UPI'] as const)[k % 4], reference: `UTR${88120000 + k * 917}`, invoiceNumbers: [i.number],
    status: 'posted' as const, source: 'erp' as const, customerName: customers.find((c) => c.id === i.customerId)?.name,
    allocations: [{ invoiceId: i.id, invoiceNumber: i.number, amount: i.paid }],
  })).filter((p) => new Date(p.date).getTime() < Date.now());

  const announcements: Announcement[] = [
    { id: 'ann_1', title: 'Diwali dispatch schedule 2026', body: 'Our Hyderabad and Chennai distribution centres will operate on reduced hours from 18–22 October. Orders confirmed before 16 October will be dispatched before the holidays. Please plan your stock requirements accordingly.', category: 'notice', audience: ['all'], status: 'published', publishAt: ago(1), createdBy: 'Suresh Iyer', pinned: true },
    { id: 'ann_2', title: 'New SKF bearing range now in stock', body: 'We have added 120+ new SKF Explorer series bearings to the catalog with customer-specific pricing. Contact your sales representative for bulk quotations.', category: 'product', audience: ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP'], status: 'published', publishAt: ago(4), createdBy: 'Anita Desai' },
    { id: 'ann_3', title: 'Online ordering portal – faster approvals', body: 'Orders up to ₹2,00,000 from Tier A customers are now approved within 2 business hours. Track every status change in real time from the Orders screen.', category: 'company', audience: ['all'], status: 'published', publishAt: ago(9), createdBy: 'Anita Desai' },
    { id: 'ann_4', title: 'Revised price list effective 1 November', body: 'Copper-based electrical products will see a 4–6% revision due to raw material costs. Contract prices remain protected until their expiry date.', category: 'notice', audience: ['CUSTOMER_B2B', 'CUSTOMER_B2C', 'SALES_REP', 'SUPERVISOR'], status: 'scheduled', publishAt: ahead(5), createdBy: 'Suresh Iyer' },
    { id: 'ann_5', title: 'Q3 sales review meeting', body: 'All sales representatives: quarterly review on Friday 10:00 AM at the Hyderabad office and on Teams. Please update your follow-ups before the meeting.', category: 'company', audience: ['SALES_REP', 'SUPERVISOR'], status: 'published', publishAt: ago(2), createdBy: 'Suresh Iyer' },
    { id: 'ann_6', title: 'Safety week campaign (draft)', body: 'Draft content for National Safety Week PPE campaign.', category: 'product', audience: ['CUSTOMER_B2B', 'CUSTOMER_B2C'], status: 'draft', publishAt: ahead(20), createdBy: 'Anita Desai' },
  ];

  const offers: Offer[] = [
    { id: 'off_1', code: 'PPE-SAFETY10', title: 'Safety Week: 10% off PPE', description: 'Extra 10% on helmets, vests, gloves and safety shoes on orders placed this month.', productIds: ['prd_015', 'prd_016', 'prd_017', 'prd_018'], discountPct: 10, validFrom: ago(5), validTo: ahead(20), status: 'active', audience: 'all' },
    { id: 'off_2', code: 'BRG-SKF8', title: 'SKF Bearings – 8% festive offer', description: 'Additional 8% discount on SKF deep groove ball bearings.', productIds: ['prd_001', 'prd_002'], discountPct: 8, validFrom: ago(3), validTo: ahead(12), status: 'active', audience: 'all' },
    { id: 'off_3', code: 'LUBE-DRUM5', title: 'Bulk lubricants – 5% off drums', description: '5% off on 210 L hydraulic oil drums and gear oil pails for Tier A accounts.', productIds: ['prd_027', 'prd_029'], discountPct: 5, validFrom: ago(10), validTo: ahead(30), status: 'active', audience: 'tier_A' },
    { id: 'off_4', code: 'TOOLS-NOV', title: 'Power tools November launch', description: 'Introductory pricing on DeWalt and Makita cordless range.', productIds: ['prd_011', 'prd_013'], discountPct: 6, validFrom: ahead(10), validTo: ahead(40), status: 'scheduled', audience: 'all' },
    { id: 'off_5', code: 'MONSOON-VLV', title: 'Monsoon valves clearance', description: 'Clearance on gate valves and NRVs.', productIds: ['prd_007', 'prd_008'], discountPct: 12, validFrom: ago(80), validTo: ago(20), status: 'expired', audience: 'all' },
  ];

  const cu = (cid: string) => customerUsers.find((u) => u.customerId === cid)!;
  const conversations: Conversation[] = [
    { id: 'conv_1', subject: 'Delivery date for SO-26-04101', customerId: 'cus_001', orderRef: orders[1]?.number, participantIds: ['usr_cus_1', 'usr_rep_1', 'usr_mgr_1', 'usr_admin_1'], participantNames: ['Venkat Rao', 'Ravi Kumar', 'Support'], updatedAt: ago(0, 1), unreadBy: ['usr_rep_1', 'usr_mgr_1', 'usr_admin_1'], messages: [
      { id: 'm1', senderId: 'usr_cus_1', senderName: 'Venkat Rao', senderRole: 'CUSTOMER_B2B', body: 'Hi Ravi, can you confirm the delivery date for our latest bearing order? We have a plant shutdown on Monday.', at: ago(0, 3) },
      { id: 'm2', senderId: 'usr_rep_1', senderName: 'Ravi Kumar', senderRole: 'SALES_REP', body: 'Hello Venkat garu, checking with the Hyderabad DC now. It should be packed today.', at: ago(0, 2) },
      { id: 'm3', senderId: 'usr_cus_1', senderName: 'Venkat Rao', senderRole: 'CUSTOMER_B2B', body: 'Thanks. Please also share the invoice once dispatched.', at: ago(0, 1) },
    ] },
    { id: 'conv_2', subject: 'Credit limit enhancement request', customerId: 'cus_004', participantIds: ['usr_cus_4', 'usr_mgr_1', 'usr_admin_1', 'usr_rep_2'], participantNames: ['Rajesh Mehta', 'Suresh Iyer'], updatedAt: ago(0, 5), unreadBy: ['usr_mgr_1', 'usr_admin_1'], messages: [
      { id: 'm1', senderId: 'usr_cus_4', senderName: 'Rajesh Mehta', senderRole: 'CUSTOMER_B2B', body: 'We are expanding to a second warehouse in Bhiwandi. Requesting credit limit increase from ₹40L to ₹60L.', at: ago(0, 6) },
      { id: 'm2', senderId: 'usr_mgr_1', senderName: 'Suresh Iyer', senderRole: 'SUPERVISOR', body: 'Thank you Rajesh ji. Please share your latest audited financials and we will review this week.', at: ago(0, 5) },
    ] },
    { id: 'conv_3', subject: 'Wrong pack size received – PPE gloves', customerId: 'cus_003', participantIds: ['usr_cus_3', 'usr_rep_4', 'usr_mgr_1', 'usr_admin_1'], participantNames: ['Karthik Subramanian', 'Meera Nair'], updatedAt: ago(1), unreadBy: [], messages: [
      { id: 'm1', senderId: 'usr_cus_3', senderName: 'Karthik Subramanian', senderRole: 'CUSTOMER_B2B', body: 'We ordered 12-pair packs of nitrile gloves but received 6-pair packs.', at: ago(1, 4) },
      { id: 'm2', senderId: 'usr_rep_4', senderName: 'Meera Nair', senderRole: 'SALES_REP', body: 'Apologies Karthik. Replacement is scheduled for tomorrow; return pickup arranged.', at: ago(1) },
    ] },
    { id: 'conv_4', subject: 'Quotation for 5 HP motors (qty 12)', customerId: 'cus_002', participantIds: ['usr_cus_2', 'usr_rep_1', 'usr_mgr_1', 'usr_admin_1'], participantNames: ['Lakshmi Prasad', 'Ravi Kumar'], updatedAt: ago(2), unreadBy: ['usr_cus_2'], messages: [
      { id: 'm1', senderId: 'usr_cus_2', senderName: 'Lakshmi Prasad', senderRole: 'CUSTOMER_B2B', body: 'Need best price for 12 nos Crompton 5 HP IE2 motors.', at: ago(2, 5) },
      { id: 'm2', senderId: 'usr_rep_1', senderName: 'Ravi Kumar', senderRole: 'SALES_REP', body: 'Sir, I can offer ₹20,350 per unit including freight. Valid for 7 days.', at: ago(2) },
    ] },
    { id: 'conv_5', subject: 'Onboarding: Tirupati Steel Agencies', participantIds: ['usr_admin_1', 'usr_mgr_1'], participantNames: ['Anita Desai', 'Suresh Iyer'], updatedAt: ago(0, 8), unreadBy: ['usr_mgr_1'], messages: [
      { id: 'm1', senderId: 'usr_admin_1', senderName: 'Anita Desai', senderRole: 'ADMIN', body: 'New signup from Tirupati Steel Agencies. Should we map them to Ravi\'s territory before approval?', at: ago(0, 8) },
    ] },
  ];
  void cu;

  const N = (userId: string, k: number, type: AppNotification['type'], title: string, body: string, hrs: number, href?: string, read = false): AppNotification => ({ id: `ntf_${userId}_${k}`, userId, type, title, body, at: ago(0, hrs), read, href });
  const pending = orders.filter((o) => o.status === 'pending_approval');
  const notifications: AppNotification[] = [
    N('usr_admin_1', 1, 'approval_required', '2 new user registrations', 'Tirupati Steel Agencies and Qureshi Brothers are awaiting approval.', 1, '/users'),
    N('usr_admin_1', 2, 'message', 'New message from Rajesh Mehta', 'Credit limit enhancement request', 5, '/messages'),
    N('usr_admin_1', 3, 'order_new', `${pending.length} orders pending approval`, 'Supervisors have been notified.', 7, '/orders', true),
    N('usr_mgr_1', 1, 'approval_required', 'Approval required', `${pending[0]?.number} from ${pending[0]?.customerName} – needs your review.`, 0.5, '/approvals'),
    N('usr_mgr_1', 2, 'approval_required', 'Approval required', `${pending[1]?.number} from ${pending[1]?.customerName}.`, 2, '/approvals'),
    N('usr_mgr_1', 3, 'message', 'New message from Rajesh Mehta', 'Credit limit enhancement request', 5, '/messages'),
    N('usr_mgr_1', 4, 'order_dispatched', 'Dispatch delay risk', '3 orders packed for more than 48 hours at Hyderabad DC.', 20, '/orders', true),
    N('usr_rep_1', 1, 'message', 'Venkat Rao replied', 'Please also share the invoice once dispatched.', 1, '/messages'),
    N('usr_rep_1', 2, 'order_confirmed', 'Order confirmed', `${orders.find((o) => o.salesRepId === 'usr_rep_1' && o.status === 'confirmed')?.number ?? 'SO-26-04102'} approved by Suresh Iyer.`, 3, '/orders'),
    N('usr_rep_1', 3, 'announcement', 'Q3 sales review meeting', 'Friday 10:00 AM – Hyderabad office.', 30, '/announcements', true),
    N('usr_cus_1', 1, 'order_dispatched', 'Your order has been dispatched', `${orders.find((o) => o.customerId === 'cus_001' && o.status === 'dispatched')?.number ?? 'SO-26-04110'} is on the way via VRL Logistics.`, 2, '/orders'),
    N('usr_cus_1', 2, 'offer', 'New offer: Safety Week 10% off PPE', 'Valid for the next 20 days on helmets, vests and gloves.', 6, '/offers'),
    N('usr_cus_1', 3, 'announcement', 'Diwali dispatch schedule', 'Plan your orders before 16 October.', 24, '/announcements'),
    N('usr_cus_1', 4, 'order_confirmed', 'Order confirmed', 'Your order has been accepted in Sage X3.', 50, '/orders', true),
  ];

  const followUps: FollowUp[] = [
    { id: 'fu_1', customerId: 'cus_002', salesRepId: 'usr_rep_1', date: ago(0), type: 'quote', notes: 'Follow up on 5 HP motor quotation (12 nos). Customer comparing with local dealer.', status: 'open' },
    { id: 'fu_2', customerId: 'cus_006', salesRepId: 'usr_rep_1', date: ago(2), type: 'payment', notes: 'Collect cheque for overdue invoices. Owner travelling until Wednesday.', status: 'open' },
    { id: 'fu_3', customerId: 'cus_001', salesRepId: 'usr_rep_1', date: ahead(1), type: 'visit', notes: 'Plant shutdown requirement – bearings and grease. Bring SKF catalogue.', status: 'open' },
    { id: 'fu_4', customerId: 'cus_008', salesRepId: 'usr_rep_1', date: ahead(3), type: 'call', notes: 'Account on hold – discuss payment plan to release orders.', status: 'open' },
    { id: 'fu_5', customerId: 'cus_012', salesRepId: 'usr_rep_1', date: ago(6), type: 'visit', notes: 'Re-activation visit; customer moved to new premises.', status: 'done' },
    { id: 'fu_6', customerId: 'cus_004', salesRepId: 'usr_rep_2', date: ahead(2), type: 'visit', notes: 'Bhiwandi warehouse visit with credit team.', status: 'open' },
    { id: 'fu_7', customerId: 'cus_003', salesRepId: 'usr_rep_4', date: ago(0), type: 'call', notes: 'Confirm glove replacement delivered.', status: 'open' },
  ];

  const today = new Date().toISOString();
  const visits: Visit[] = [
    { id: 'vis_1', customerId: 'cus_001', salesRepId: 'usr_rep_1', date: today, time: '10:00', purpose: 'Shutdown requirement review', status: 'completed' },
    { id: 'vis_2', customerId: 'cus_002', salesRepId: 'usr_rep_1', date: today, time: '12:30', purpose: 'Motor quotation negotiation', status: 'checked_in' },
    { id: 'vis_3', customerId: 'cus_006', salesRepId: 'usr_rep_1', date: today, time: '15:00', purpose: 'Payment collection', status: 'planned' },
    { id: 'vis_4', customerId: 'cus_012', salesRepId: 'usr_rep_1', date: today, time: '17:15', purpose: 'Re-activation & new catalog', status: 'planned' },
    { id: 'vis_5', customerId: 'cus_004', salesRepId: 'usr_rep_2', date: today, time: '11:00', purpose: 'Monthly review', status: 'planned' },
  ];

  const activity: ActivityItem[] = [
    { id: 'act_1', at: ago(0, 0.3), actor: 'Venkat Rao', text: 'placed order ' + (orders[0]?.number ?? ''), kind: 'order' },
    { id: 'act_2', at: ago(0, 1), actor: 'Naveen Babu', text: 'registered as a new B2B customer (pending approval)', kind: 'user' },
    { id: 'act_3', at: ago(0, 2), actor: 'Suresh Iyer', text: 'approved order ' + (orders[3]?.number ?? ''), kind: 'approval' },
    { id: 'act_4', at: ago(0, 4), actor: 'National Wholesale', text: 'paid ₹4,82,300 via RTGS', kind: 'payment' },
    { id: 'act_5', at: ago(0, 5), actor: 'Rajesh Mehta', text: 'requested credit limit enhancement', kind: 'message' },
    { id: 'act_6', at: ago(0, 7), actor: 'Ravi Kumar', text: 'checked in at ABC Distributors, Hyderabad', kind: 'customer' },
    { id: 'act_7', at: ago(1, 1), actor: 'Meera Nair', text: 'created order for Metro Industrial Supplies', kind: 'order' },
  ];

  // ---------- sites ----------
  // Stock split across sites (some items out of stock at some sites).
  const products: Product[] = PRODUCTS.map((p) => {
    const w = [0.45, 0.25, 0.15, 0.15].map((x) => x * (0.6 + r() * 0.8));
    const stockBySite = Object.fromEntries(SITES.map((st, k) => [st.code, r() < 0.12 ? 0 : Math.round(p.stock * w[k])]));
    return { ...p, stockBySite, stock: Object.values(stockBySite).reduce((a, b) => a + b, 0) };
  });
  const custSite = (id: string) => { const c = customers.find((x) => x.id === id); return (c && SITE_BY_STATE[c.address.state]) || 'MAIN'; };
  const all = SITES.map((x) => x.code);
  const siteFor: Record<string, string[]> = {
    usr_admin_1: all, usr_mgr_1: all, usr_mgr_2: ['MAIN'], usr_rep_1: ['MAIN'], usr_rep_2: ['MUM-WH'], usr_rep_3: ['BLR-BR', 'MAIN'], usr_rep_4: ['MAA-WH'],
    usr_rep_5: ['MUM-WH'], usr_sup_1: ['MAIN', 'MUM-WH'], usr_b2c_1: ['MAIN'],
    usr_cus_1: ['MAIN', 'MUM-WH'], // ABC Distributors buys from two sites
  };
  for (const u of users) {
    u.allowedSites = siteFor[u.id] ?? (u.customerId ? [custSite(u.customerId)] : ['MAIN']);
    u.defaultSite = u.allowedSites[0];
  }
  orders.forEach((o, k) => { o.site = o.customerId === 'cus_001' && k % 3 === 0 ? 'MUM-WH' : custSite(o.customerId); });

  // ---------- sales requests ----------
  // Orders still waiting for approval become submitted requests: in the request-first flow,
  // sales orders exist only after a request is converted.
  let seqReq = 1040;
  const requests: SalesRequest[] = [];
  const toRequest = (o: Order, status: SalesRequest['status']): SalesRequest => {
    const cust = customers.find((c) => c.id === o.customerId)!;
    const cc = creditCheck(o, cust, orders);
    return {
      id: `req_${seqReq}`, number: `SR-26-${String(seqReq++).padStart(5, '0')}`, site: o.site, customerId: o.customerId, customerName: o.customerName, salesRepId: o.salesRepId,
      createdBy: o.createdBy, source: o.source, date: o.date, status, lines: o.lines.map((l) => ({ ...l, convertedQty: status === 'converted' ? l.quantity : 0 })),
      subtotal: o.subtotal, discount: o.discount, tax: o.tax, total: o.total, poNumber: o.poNumber, notes: o.notes, deliveryAddress: o.deliveryAddress, billingAddress: o.billingAddress,
      credit: cust.type === 'B2B' ? { over: cc.over, onHold: cc.onHold, exceededBy: cc.exceededBy, available: cc.available } : undefined,
      expiresAt: new Date(new Date(o.date).getTime() + 14 * DAY).toISOString(),
      orderIds: [], orderNumbers: [], comments: [...o.comments],
      timeline: [{ status: 'submitted', at: o.date, by: o.createdBy.name, note: 'Submitted for review' }],
    };
  };
  for (const o of orders.filter((x) => x.status === 'pending_approval' || x.status === 'changes_requested')) {
    const rq = toRequest(o, o.status === 'changes_requested' ? 'changes_requested' : 'submitted');
    if (o.status === 'changes_requested') rq.timeline.push({ status: 'changes_requested', at: o.timeline.at(-1)!.at, by: 'Suresh Iyer', note: 'Please confirm quantities' });
    requests.push(rq);
  }
  // demo: prices have moved since this request was submitted, so conversion asks for confirmation
  { const rq = requests.find((x) => x.status === 'submitted' && !x.credit?.over && x.site === 'MAIN'); if (rq) { rq.lines.forEach((l) => { l.unitPrice = Math.round(l.unitPrice * 0.97 * 100) / 100; l.lineTotal = Math.round(l.lineTotal * 0.97 * 100) / 100; }); rq.subtotal = Math.round(rq.subtotal * 0.97); rq.tax = Math.round(rq.tax * 0.97); rq.total = Math.round(rq.total * 0.97 * 100) / 100; rq.date = ago(4); rq.timeline[0].at = rq.date; } }
  const kept = orders.filter((x) => x.status !== 'pending_approval' && x.status !== 'changes_requested');
  // recent orders get the converted request they came from
  for (const o of kept.filter((x) => ['confirmed', 'processing', 'packed'].includes(x.status)).slice(0, 8)) {
    const rq = toRequest(o, 'converted');
    rq.credit = undefined;
    rq.orderIds = [o.id]; rq.orderNumbers = [o.number];
    rq.timeline.push({ status: 'approved', at: o.timeline[1]?.at ?? o.date, by: 'Suresh Iyer' }, { status: 'converted', at: o.timeline[1]?.at ?? o.date, by: 'Suresh Iyer', note: `Sales order ${o.number} created in Sage X3` });
    o.requestId = rq.id; o.requestNumber = rq.number;
    requests.push(rq);
  }
  orders.length = 0; orders.push(...kept);
  requests.sort((a, b) => b.date.localeCompare(a.date));

  // ---------- purchasing ----------
  const byCat = (cat: string) => products.filter((x) => x.category === cat).map((x) => x.id);
  const suppliers: Supplier[] = [
    { id: 'sup_1', code: 'SUP-0007', name: 'Precision Bearings Ltd', contactName: 'Deepak Malhotra', email: 'supplier@nexusb2b.in', phone: '+91 22 4012 7700', address: addr('Unit 12, Andheri MIDC', 'Mumbai', 'Maharashtra', '400093'), paymentTerms: 'Net 60', productIds: [...byCat('Bearings'), ...byCat('Fasteners')] },
    { id: 'sup_2', code: 'SUP-0012', name: 'Shakti Lubricants', contactName: 'R. Venkatesan', email: 'sales@shaktilube.in', phone: '+91 44 2815 3300', address: addr('Plot 8, Ambattur Industrial Estate', 'Chennai', 'Tamil Nadu', '600058'), paymentTerms: 'Net 45', productIds: byCat('Lubricants') },
    { id: 'sup_3', code: 'SUP-0019', name: 'Safeguard PPE Industries', contactName: 'Nisha Shah', email: 'orders@safeguardppe.in', phone: '+91 79 2583 9900', address: addr('Shed 45, Naroda GIDC', 'Ahmedabad', 'Gujarat', '382330'), paymentTerms: 'Net 30', productIds: byCat('Safety & PPE') },
  ];
  users.find((u) => u.id === 'usr_sup_1')!.supplierId = 'sup_1';
  const cost = (pid: string) => Math.round(products.find((x) => x.id === pid)!.basePrice * 0.68 * 100) / 100;
  const pline = (pid: string, quantity: number): PurchaseLine => {
    const x = products.find((y) => y.id === pid)!;
    return { productId: pid, sku: x.sku, name: x.name, uom: x.uom, quantity, unitCost: cost(pid), lineTotal: Math.round(cost(pid) * quantity * 100) / 100 };
  };
  const sum = (ls: PurchaseLine[]) => Math.round(ls.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;
  let seqPr = 310, seqPo = 7120, seqGrn = 880;
  const deepak = { id: 'usr_sup_1', name: 'Deepak Malhotra', role: 'SUPPLIER' as const };
  const suresh = { id: 'usr_mgr_1', name: 'Suresh Iyer', role: 'SUPERVISOR' as const };
  const pr = (sup: Supplier, source: PurchaseRequest['source'], by: typeof deepak | typeof suresh, lines: PurchaseLine[], days: number, site: string, notes?: string): PurchaseRequest => ({
    id: `pr_${seqPr}`, number: `PR-26-${String(seqPr++).padStart(5, '0')}`, site, supplierId: sup.id, supplierName: sup.name, source, createdBy: by, date: ago(days), status: 'submitted',
    lines, total: sum(lines), proposedDate: source === 'pickup' ? ahead(3) : undefined, notes, comments: [],
    timeline: [{ status: 'submitted', at: ago(days), by: by.name, note: source === 'pickup' ? 'Pickup offered by supplier' : 'Raised for low stock' }],
  });
  const b = byCat('Bearings'), l = byCat('Lubricants'), f = byCat('Fasteners');
  const purchaseRequests: PurchaseRequest[] = [
    pr(suppliers[0], 'pickup', deepak, [pline(b[0], 400), pline(b[2], 120)], 0.6, 'MAIN', 'Fresh lot ready at our Mumbai plant. Can load on Thursday.'),
    pr(suppliers[1], 'internal', suresh, [pline(l[0], 60), pline(l[1], 24)], 1.5, 'MAIN', 'EP2 grease below reorder level at MAIN.'),
  ];
  const po = (sup: Supplier, lines: PurchaseLine[], status: PurchaseOrder['status'], days: number, site: string): PurchaseOrder => {
    const flow: PurchaseOrder['status'][] = ['issued', 'acknowledged', 'pickup_confirmed', 'in_transit', 'received'];
    const n = seqPo++;
    const o: PurchaseOrder = {
      id: `po_${n}`, number: `PO-26-${String(n).padStart(5, '0')}`, site, supplierId: sup.id, supplierName: sup.name, date: ago(days), expectedDate: ago(days - 5),
      status, lines: lines.map((x) => ({ ...x, receivedQty: status === 'received' ? x.quantity : 0 })), total: sum(lines), receipts: [], erpRef: `POH${410000 + n}`,
      timeline: flow.slice(0, flow.indexOf(status) + 1).map((st, k) => ({ status: st, at: ago(days - k * 0.8), by: k === 0 ? 'Suresh Iyer' : k === 4 ? 'Warehouse – Hyderabad DC' : sup.contactName })),
    };
    if (flow.indexOf(status) >= 2) o.pickup = { date: ago(days - 2), vehicle: 'MH 04 KT 5521', driver: 'Ramesh Pawar', documents: 'Invoice SUP/2611, e-way bill 3910 4471 2210' };
    if (status === 'received') o.receipts.push({ id: `grn_${seqGrn}`, number: `GRN-26-${String(seqGrn++).padStart(5, '0')}`, at: ago(days - 4), by: 'Warehouse – Hyderabad DC', lines: o.lines.map((x) => ({ productId: x.productId, quantity: x.quantity })) });
    return o;
  };
  const purchaseOrders: PurchaseOrder[] = [
    po(suppliers[0], [pline(b[1], 200), pline(f[0], 50)], 'issued', 0.3, 'MAIN'),
    po(suppliers[0], [pline(b[3], 80)], 'in_transit', 4, 'MAIN'),
    po(suppliers[0], [pline(b[4], 60), pline(f[1], 40)], 'acknowledged', 2, 'MUM-WH'),
    po(suppliers[1], [pline(l[2], 30)], 'received', 12, 'MAIN'),
  ];

  // ---------- consignment stock ----------
  const cline = (pid: string, quantity: number, minQty: number): ConsignmentLine => {
    const x = products.find((y) => y.id === pid)!;
    return { productId: pid, sku: x.sku, name: x.name, uom: x.uom, quantity, minQty };
  };
  const consignments: Consignment[] = [
    { id: 'cons_1', number: 'CONS-0001', customerId: 'cus_001', customerName: 'ABC Distributors', site: 'MAIN', location: 'CONS-ABC',
      lines: [cline(b[0], 180, 100), cline(b[1], 60, 80), cline(l[0], 24, 10), cline(f[0], 900, 500)],
      movements: [
        { id: 'cm_1', at: ago(20), by: 'Warehouse – Hyderabad DC', kind: 'top_up', productId: b[0], quantity: 200 },
        { id: 'cm_2', at: ago(20), by: 'Warehouse – Hyderabad DC', kind: 'top_up', productId: b[1], quantity: 120 },
        { id: 'cm_3', at: ago(9), by: 'Venkat Rao', kind: 'call_off', productId: b[1], quantity: -60, ref: 'SO-26-04150' },
        { id: 'cm_4', at: ago(6), by: 'Venkat Rao', kind: 'call_off', productId: b[0], quantity: -20, ref: 'SO-26-04171' },
      ] },
    { id: 'cons_2', number: 'CONS-0002', customerId: 'cus_004', customerName: 'National Wholesale', site: 'MUM-WH', location: 'CONS-NWS',
      lines: [cline(b[2], 300, 150), cline(byCat('Safety & PPE')[0], 120, 60)],
      movements: [{ id: 'cm_5', at: ago(15), by: 'Warehouse – Mumbai', kind: 'top_up', productId: b[2], quantity: 300 }] },
  ];

  // ---------- stock transfers ----------
  let seqTr = 2210;
  const tline = (pid: string, quantity: number, received = 0): TransferLine => {
    const x = products.find((y) => y.id === pid)!;
    return { productId: pid, sku: x.sku, name: x.name, uom: x.uom, quantity, receivedQty: received };
  };
  const tr = (from: string, to: string, status: TransferStatus, lines: TransferLine[], days: number, reason: string, by: { id: string; name: string; role: Role }): StockTransfer => {
    const flow: TransferStatus[] = ['pending', 'approved', 'initiated', 'transferred', 'completed'];
    const n = seqTr++;
    const steps = status === 'rejected' ? ['pending', 'rejected'] as TransferStatus[] : flow.slice(0, flow.indexOf(status) + 1);
    return {
      id: `tr_${n}`, number: `TR-26-${String(n).padStart(5, '0')}`, fromSite: from, toSite: to, status, lines, reason, createdBy: by, date: ago(days), neededBy: ahead(3),
      erpRef: flow.indexOf(status) >= 2 ? `STR${520000 + n}` : undefined, comments: [],
      timeline: steps.map((st, k) => ({ status: st, at: ago(days - k * 0.7), by: k === 0 ? by.name : 'Suresh Iyer', note: st === 'rejected' ? 'Stock needed for the Diwali dispatches at MAIN' : undefined })),
    };
  };
  const ravi = { id: 'usr_rep_1', name: 'Ravi Kumar', role: 'SALES_REP' as const };
  const transfers: StockTransfer[] = [
    tr('MUM-WH', 'MAIN', 'pending', [tline(b[2], 120), tline(l[1], 20)], 0.4, 'ABC Distributors plant shutdown – short at MAIN', ravi),
    tr('MAA-WH', 'MAIN', 'initiated', [tline(f[1], 300)], 2, 'Rebalance fasteners before month end', suresh),
    tr('MAIN', 'BLR-BR', 'approved', [tline(b[0], 80)], 1, 'Bharat Machinery Mart standing order', { id: 'usr_rep_3', name: 'Arjun Reddy', role: 'SALES_REP' }),
    tr('MAIN', 'MAA-WH', 'completed', [tline(l[2], 40, 40)], 10, 'Chennai out of stock', suresh),
    tr('BLR-BR', 'MAIN', 'rejected', [tline(b[3], 50)], 5, 'Return slow movers', { id: 'usr_rep_3', name: 'Arjun Reddy', role: 'SALES_REP' }),
  ];

  // ---------- deliveries (one per dispatched or delivered order) ----------
  let seqDel = 5300;
  const deliveries: Delivery[] = [];
  for (const o of orders.filter((x) => x.status === 'dispatched' || x.status === 'delivered')) {
    const disp = o.timeline.find((e) => e.status === 'dispatched');
    const done = o.timeline.find((e) => e.status === 'delivered');
    const dispAt = disp?.at ?? o.date;
    const cust = customers.find((c) => c.id === o.customerId)!;
    const n = seqDel++;
    const d: Delivery = {
      id: `del_${n}`, number: `DN-26-${String(n).padStart(5, '0')}`, orderId: o.id, orderNumber: o.number, customerId: o.customerId, customerName: o.customerName, site: o.site,
      address: o.deliveryAddress, status: o.status === 'delivered' ? 'delivered' : new Date(o.expectedDelivery).getTime() - Date.now() < DAY ? 'out_for_delivery' : 'scheduled',
      plannedDate: o.expectedDelivery, carrier: o.customerId === 'cus_b2c_1' ? 'BlueDart' : 'VRL Logistics', vehicle: `TS 09 UB ${4100 + (n % 900)}`, driver: ['Mahesh', 'Srinu', 'Raju', 'Anwar'][n % 4],
      trackingRef: disp?.note?.match(/VRL\d+/)?.[0] ?? `BD${77000000 + n}`,
      lines: o.lines.map((l) => ({ productId: l.productId, sku: l.sku, name: l.name, uom: l.uom, quantity: l.quantity, receivedQty: o.status === 'delivered' ? l.quantity : undefined })),
      timeline: [{ status: 'scheduled', at: dispAt, by: 'Sage X3', note: 'Delivery note created at dispatch' }],
    };
    if (d.status !== 'scheduled') d.timeline.push({ status: 'out_for_delivery', at: new Date(new Date(dispAt).getTime() + DAY).toISOString(), by: d.driver! });
    if (done) {
      d.timeline.push({ status: 'delivered', at: done.at, by: d.driver! });
      d.pod = { receivedBy: cust.contactName, at: done.at, recordedBy: { id: 'drv', name: d.driver!, role: 'SUPERVISOR' }, notes: 'Signed on the paper delivery note' };
    }
    o.deliveryId = d.id;
    deliveries.push(d);
  }

  // ---------- quotes ----------
  let seqQuote = 640;
  const qline = (cust: Customer, pid: string, quantity: number, discountPct = 0, target?: number): QuoteLine => {
    const x = products.find((y) => y.id === pid)!;
    const listPrice = customerUnitPrice(x, cust);
    const unitPrice = Math.round(listPrice * (1 - discountPct / 100) * 100) / 100;
    return { productId: pid, sku: x.sku, name: x.name, uom: x.uom, image: x.image, quantity, listPrice, unitPrice, targetPrice: target, lineTotal: Math.round(unitPrice * quantity * 100) / 100 };
  };
  const quote = (custId: string, status: QuoteStatus, lines: QuoteLine[], days: number, by: { id: string; name: string; role: Role }, extra: Partial<Quote> = {}): Quote => {
    const cust = customers.find((c) => c.id === custId)!;
    const n = seqQuote++;
    const subtotal = Math.round(lines.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;
    const tax = Math.round(subtotal * 0.18 * 100) / 100;
    const steps: QuoteStatus[] = status === 'requested' ? ['requested'] : status === 'draft' ? ['draft'] : status === 'sent' ? ['requested', 'sent'] : ['requested', 'sent', status];
    return {
      id: `quo_${n}`, number: `QT-26-${String(n).padStart(5, '0')}`, site: custSite(custId), customerId: custId, customerName: cust.name, salesRepId: cust.salesRepId, createdBy: by,
      date: ago(days), status, version: 1, lines, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100, comments: [],
      timeline: steps.map((st, k) => ({ status: st, at: ago(days - k * 0.6), by: k === 0 ? by.name : st === 'sent' ? 'Ravi Kumar' : cust.contactName })),
      ...extra,
    };
  };
  const venkat = { id: 'usr_cus_1', name: 'Venkat Rao', role: 'CUSTOMER_B2B' as const };
  const abc = customers.find((c) => c.id === 'cus_001')!;
  const quotes: Quote[] = [
    quote('cus_001', 'requested', [qline(abc, 'prd_001', 200, 0, 150), qline(abc, l[0], 6)], 0.3, venkat, { customerNote: 'Plant shutdown next Monday. Need your best price for 200 bearings and 6 buckets of EP2 grease.' }),
    quote('cus_001', 'sent', [qline(abc, b[3], 40, 6), qline(abc, f[0], 20, 4)], 2, ravi, { validUntil: ahead(8), terms: 'Delivery in 5 working days from Hyderabad DC. Payment Net 45. Prices exclude GST.', pricedBy: 'Ravi Kumar' }),
    quote('cus_002', 'expired', [qline(customers.find((c) => c.id === 'cus_002')!, byCat('Valves & Fittings')[0], 30, 5)], 25, ravi, { validUntil: ago(10), pricedBy: 'Ravi Kumar' }),
    quote('cus_004', 'draft', [qline(customers.find((c) => c.id === 'cus_004')!, byCat('Power Tools')[0], 12, 8)], 1, { id: 'usr_rep_2', name: 'Priya Sharma', role: 'SALES_REP' }),
  ];

  // ---------- collections ----------
  const collectionNotes: CollectionNote[] = [
    { id: 'cn_1', customerId: 'cus_006', at: ago(12), by: ravi, kind: 'promise', text: 'Owner promised to clear the two oldest invoices by cheque.', promiseDate: ago(5), promiseAmount: 60000 },
    { id: 'cn_2', customerId: 'cus_006', at: ago(4), by: ravi, kind: 'reminder', text: 'Payment reminder sent for overdue invoices.' },
    { id: 'cn_3', customerId: 'cus_002', at: ago(2), by: ravi, kind: 'promise', text: 'Accounts will release NEFT after month-end reconciliation.', promiseDate: ahead(4), promiseAmount: 45000 },
  ];

  return { version: 11, quotes, deliveries, collectionNotes, consignments, transfers, roleModules: structuredClone(DEFAULT_ROLE_MODULES), sites: structuredClone(SITES), requests, workflow: structuredClone(DEFAULT_WORKFLOW), suppliers, purchaseRequests, purchaseOrders, users, customers, products, orders, invoices, payments, announcements, offers, conversations, notifications, followUps, visits, activity, visitReports: [
    { id: 'vr_1', visitId: 'vis_1', customerId: 'cus_001', salesRepId: 'usr_rep_1', salesRepName: 'Ravi Kumar', at: ago(0, 3), outcome: 'quote_requested', contactMet: 'Venkat Rao (Purchase Head)', notes: 'Plant shutdown planned for next Monday. Needs 200 bearings (6205/6308) and 6 buckets of EP2 grease. Competitor quoted 4% lower on grease.', nextSteps: 'Send revised grease quote; confirm bearing stock with Hyderabad DC.', followUpDate: ahead(1), photos: [] },
  ], seq: { order: seqOrder, invoice: seqInv, request: seqReq, pr: seqPr, po: seqPo, grn: seqGrn, transfer: seqTr, quote: seqQuote, delivery: seqDel, payment: 900 } };
}
