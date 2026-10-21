/**
 * Domain model for the B2B platform.
 * These types mirror the contract expected from the future Node.js backend
 * (which in turn maps Sage X3 entities: BPCUSTOMER, ITMMASTER, SORDER, SINVOICE ...).
 */

/** The six portal roles. Codes match the backend contract. */
export type Role = 'ADMIN' | 'SUPERVISOR' | 'SALES_REP' | 'SUPPLIER' | 'CUSTOMER_B2B' | 'CUSTOMER_B2C';
export const ROLES: Role[] = ['ADMIN', 'SUPERVISOR', 'SALES_REP', 'SUPPLIER', 'CUSTOMER_B2B', 'CUSTOMER_B2C'];
export const isCustomerRole = (r?: Role | null) => r === 'CUSTOMER_B2B' || r === 'CUSTOMER_B2C';
/** Internal staff who manage customers, orders and approvals. */
export const isManagerRole = (r?: Role | null) => r === 'ADMIN' || r === 'SUPERVISOR';
export type ID = string;
export type ISODate = string;

export interface Address {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export type UserStatus = 'active' | 'pending' | 'inactive';

export interface User {
  id: ID;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: UserStatus;
  title: string;
  region?: string;
  customerId?: ID; // set for CUSTOMER_B2B / CUSTOMER_B2C (1 customer = 1 login in V1)
  /** ERP entity this login maps to: customer code, supplier code or rep code. Empty for ADMIN. */
  erpCode?: string;
  /** SUPPLIER logins: the supplier record they act for. */
  supplierId?: ID;
  /** Site codes this user may work in, e.g. ["MAIN","MUM-WH"]. */
  allowedSites?: string[];
  /** Site selected when the user signs in; must be one of allowedSites. */
  defaultSite?: string;
  monthlyTarget?: number; // sales reps
  createdAt: ISODate;
  lastLoginAt?: ISODate;
}

export type CustomerStatus = 'active' | 'on_hold' | 'inactive';

export interface Customer {
  id: ID;
  code: string; // ERP business partner code
  /** B2B: contract pricing and credit terms. B2C: list prices, paid up front, no credit limit. */
  type: 'B2B' | 'B2C';
  name: string;
  contactName: string;
  email: string;
  phone: string;
  gstin: string;
  address: Address;
  billingAddress: Address;
  status: CustomerStatus;
  salesRepId: ID;
  priceTier: 'A' | 'B' | 'C';
  tierDiscountPct: number;
  contractPrices: Record<ID, number>; // productId -> negotiated unit price
  creditLimit: number;
  outstanding: number;
  paymentTerms: string;
  lastOrderDate?: ISODate;
  lastOrderAmount?: number;
  since: ISODate;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/** A warehouse, distribution centre or branch from the ERP site master. */
export interface Site {
  code: string;
  name: string;
  city: string;
  kind: 'warehouse' | 'branch';
  /** Mock only: stands in for the site's ERP price list (1 = same as the main list). */
  priceFactor?: number;
}

export interface Product {
  id: ID;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  image: string;
  basePrice: number;
  uom: string;
  packSize: string;
  moq: number;
  /** Stock at the site the request was made for. */
  stock: number;
  /** Mock only: stock per site code. The backend returns `stock` for the requested site instead. */
  stockBySite?: Record<string, number>;
  /** Stock at the user's other allowed sites (product detail only). */
  otherSites?: { site: string; stock: number }[];
  leadTimeDays: number;
  taxRatePct: number;
  specs: Record<string, string>;
}

export type OrderStatus =
  | 'draft'
  | 'pending_sync'
  | 'pending_approval'
  | 'changes_requested'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export interface OrderLine {
  productId: ID;
  sku: string;
  name: string;
  uom: string;
  image: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
}

export interface OrderEvent {
  status: OrderStatus;
  at: ISODate;
  by: string;
  note?: string;
}

export interface ActorRef {
  id: ID;
  name: string;
  role: Role;
}

export interface Order {
  id: ID;
  number: string;
  /** Sales request this order was converted from. */
  requestId?: ID;
  requestNumber?: string;
  /** Site the order ships from. */
  site?: string;
  customerId: ID;
  customerName: string;
  salesRepId: ID;
  createdBy: ActorRef;
  source: 'portal' | 'sales_app' | 'offline';
  date: ISODate;
  expectedDelivery: ISODate;
  status: OrderStatus;
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  poNumber?: string;
  notes?: string;
  deliveryAddress: Address;
  billingAddress: Address;
  timeline: OrderEvent[];
  comments: { by: string; at: ISODate; text: string }[];
  invoiceId?: ID;
  /** Delivery note created at dispatch. */
  deliveryId?: ID;
  erpRef?: string; // Sage X3 SOHNUM once accepted
  creditOverride?: { by: string; at: ISODate; exceededBy: number; reason?: string };
}

export type InvoiceStatus = 'paid' | 'unpaid' | 'partially_paid' | 'overdue';

export interface Invoice {
  id: ID;
  number: string;
  orderId: ID;
  orderNumber: string;
  customerId: ID;
  date: ISODate;
  dueDate: ISODate;
  amount: number;
  paid: number;
  status: InvoiceStatus;
}

export type PaymentMethod = 'NEFT' | 'RTGS' | 'Cheque' | 'UPI' | 'Card' | 'Cash';
/** posted: in the ERP ledger. pending: told to us (remittance advice or rep collection), finance still has to match it to the bank. */
export type PaymentStatus = 'pending_verification' | 'posted' | 'rejected';

export interface Payment {
  id: ID;
  number?: string;
  customerId: ID;
  customerName?: string;
  date: ISODate;
  amount: number;
  method: PaymentMethod;
  reference: string;
  invoiceNumbers: string[];
  /** Missing on older records, which are all posted. */
  status?: PaymentStatus;
  /** online: paid through the payment provider. advice: customer told us. collection: a rep collected it. */
  source?: 'online' | 'advice' | 'collection' | 'erp';
  allocations?: { invoiceId: ID; invoiceNumber: string; amount: number }[];
  enteredBy?: ActorRef;
  verifiedBy?: string;
  verifiedAt?: ISODate;
  note?: string;
}

/** A collection follow-up: promise to pay, reminder, call notes. */
export interface CollectionNote {
  id: ID;
  customerId: ID;
  at: ISODate;
  by: ActorRef;
  kind: 'promise' | 'reminder' | 'note';
  text: string;
  promiseDate?: ISODate;
  promiseAmount?: number;
  /** Promise kept, broken or still open (computed for promises). */
  outcome?: 'open' | 'kept' | 'broken';
}

export type Audience = 'all' | Role;

export interface Announcement {
  id: ID;
  title: string;
  body: string;
  category: 'company' | 'product' | 'notice';
  audience: Audience[];
  status: 'draft' | 'scheduled' | 'published';
  publishAt: ISODate;
  createdBy: string;
  pinned?: boolean;
}

export interface Offer {
  id: ID;
  code: string;
  title: string;
  description: string;
  productIds: ID[];
  discountPct: number;
  validFrom: ISODate;
  validTo: ISODate;
  status: 'active' | 'scheduled' | 'expired' | 'draft';
  audience: 'all' | 'tier_A' | 'tier_B' | 'tier_C';
}

export interface ChatMessage {
  id: ID;
  senderId: ID;
  senderName: string;
  senderRole: Role;
  body: string;
  at: ISODate;
}

export interface Conversation {
  id: ID;
  subject: string;
  customerId?: ID;
  participantIds: ID[];
  participantNames: string[];
  messages: ChatMessage[];
  updatedAt: ISODate;
  unreadBy: ID[];
  orderRef?: string;
}

export type NotificationType =
  | 'order_new'
  | 'order_confirmed'
  | 'order_dispatched'
  | 'approval_required'
  | 'request_update'
  | 'purchase_update'
  | 'stock_update'
  | 'offer'
  | 'announcement'
  | 'message';

export interface AppNotification {
  id: ID;
  userId: ID;
  type: NotificationType;
  title: string;
  body: string;
  at: ISODate;
  read: boolean;
  href?: string;
}

export interface FollowUp {
  id: ID;
  customerId: ID;
  salesRepId: ID;
  date: ISODate;
  type: 'call' | 'visit' | 'payment' | 'quote';
  notes: string;
  status: 'open' | 'done';
}

export interface Visit {
  id: ID;
  customerId: ID;
  salesRepId: ID;
  time: string;
  date: ISODate;
  purpose: string;
  status: 'planned' | 'checked_in' | 'completed';
  reportId?: ID;
}

export type VisitOutcome = 'order_placed' | 'quote_requested' | 'payment_collected' | 'no_order' | 'issue_reported';

export interface VisitReport {
  id: ID;
  visitId?: ID;
  customerId: ID;
  salesRepId: ID;
  salesRepName: string;
  at: ISODate;
  outcome: VisitOutcome;
  contactMet: string;
  notes: string;
  nextSteps: string;
  followUpDate?: ISODate;
  photos: string[]; // compressed data URLs (mock); backend will store in object storage
}

export interface ActivityItem {
  id: ID;
  at: ISODate;
  actor: string;
  text: string;
  kind: 'order' | 'user' | 'payment' | 'message' | 'approval' | 'customer';
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/* ------------------------------------------------------------------ */
/* Sales requests: every sales order starts as a request.              */
/* ------------------------------------------------------------------ */

export type RequestStatus =
  | 'draft'              // saved, not sent (offline drafts too)
  | 'submitted'          // waiting for review
  | 'changes_requested'  // sent back to the requester with comments
  | 'approved'           // approved, conversion pending
  | 'partly_converted'   // some lines became an order, the rest stay open
  | 'converted'          // all lines are on sales orders
  | 'rejected'
  | 'cancelled'
  | 'expired';

export const OPEN_REQUEST: RequestStatus[] = ['draft', 'submitted', 'changes_requested', 'approved', 'partly_converted'];
export const REVIEWABLE_REQUEST: RequestStatus[] = ['submitted', 'approved', 'partly_converted'];

export interface RequestLine extends OrderLine {
  /** Quantity already placed on sales orders. */
  convertedQty: number;
}

export interface RequestEvent { status: RequestStatus; at: ISODate; by: string; note?: string; }

export interface SalesRequest {
  id: ID;
  number: string;
  site?: string;
  customerId: ID;
  customerName: string;
  salesRepId: ID;
  createdBy: ActorRef;
  source: 'portal' | 'sales_app' | 'offline';
  date: ISODate;
  status: RequestStatus;
  lines: RequestLine[];
  /** Indicative totals at submission. The ERP confirms the final price on conversion. */
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  poNumber?: string;
  notes?: string;
  deliveryAddress: Address;
  billingAddress: Address;
  /** Credit position when submitted (B2B only). */
  credit?: { over: boolean; onHold: boolean; exceededBy: number; available: number };
  creditOverride?: { by: string; at: ISODate; reason: string };
  /** B2C: paid online at checkout. */
  paid?: boolean;
  autoApproved?: boolean;
  /** Stock is held for this request until this time (when the setting is on). */
  holdUntil?: ISODate;
  /** Request expires if not converted by this time (when the setting is on). */
  expiresAt?: ISODate;
  /** Call-off from customer consignment stock: lines are taken from this consignment, not free stock. */
  consignmentId?: ID;
  /** Accepted quote: lines carry the quoted prices, which conversion keeps. */
  quoteId?: ID;
  quoteNumber?: string;
  orderIds: ID[];
  orderNumbers: string[];
  timeline: RequestEvent[];
  comments: { by: string; at: ISODate; text: string }[];
}

/** Workflow rules set by Admin or Supervisor. */
export interface WorkflowSettings {
  /** block: requests over the credit limit cannot be submitted. warn: they are submitted and flagged for review. */
  creditMode: 'block' | 'warn';
  /** Per-customer exceptions to creditMode. */
  creditOverrides: Record<ID, 'block' | 'warn'>;
  /** Requests within credit, up to maxTotal, become sales orders without review. */
  autoApprove: { enabled: boolean; maxTotal: number };
  /** Retail (B2C) requests paid online become sales orders without review. */
  b2cAutoConvert: boolean;
  /** Hold stock for submitted requests this many hours (0 = off). */
  stockHoldHours: number;
  /** Requests not converted after this many days expire (0 = never). */
  requestExpiryDays: number;
}

/* ------------------------------------------------------------------ */
/* Purchasing: supplier pickup / purchase requests → purchase orders.  */
/* ------------------------------------------------------------------ */

export interface Supplier {
  id: ID;
  code: string; // ERP supplier code
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: Address;
  paymentTerms: string;
  /** Products this supplier can deliver. */
  productIds: ID[];
}

export interface PurchaseLine {
  productId: ID;
  sku: string;
  name: string;
  uom: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export type PurchaseRequestStatus = 'submitted' | 'changes_requested' | 'converted' | 'rejected' | 'cancelled';

/** A pickup request from a supplier, or an internal purchase request. Becomes a purchase order on conversion. */
export interface PurchaseRequest {
  id: ID;
  number: string;
  site?: string;
  supplierId: ID;
  supplierName: string;
  /** pickup: offered by the supplier; internal: raised by our staff (e.g. low stock). */
  source: 'pickup' | 'internal';
  createdBy: ActorRef;
  date: ISODate;
  status: PurchaseRequestStatus;
  lines: PurchaseLine[];
  total: number;
  /** Supplier's proposed pickup / delivery date. */
  proposedDate?: ISODate;
  notes?: string;
  orderId?: ID;
  orderNumber?: string;
  timeline: { status: PurchaseRequestStatus; at: ISODate; by: string; note?: string }[];
  comments: { by: string; at: ISODate; text: string }[];
}

export type PurchaseOrderStatus = 'issued' | 'acknowledged' | 'pickup_confirmed' | 'in_transit' | 'partly_received' | 'received' | 'cancelled';
export const PO_FLOW: PurchaseOrderStatus[] = ['issued', 'acknowledged', 'pickup_confirmed', 'in_transit', 'received'];

export interface PurchaseOrderLine extends PurchaseLine { receivedQty: number; }

export interface PurchaseOrder {
  id: ID;
  number: string;
  site?: string;
  supplierId: ID;
  supplierName: string;
  requestId?: ID;
  requestNumber?: string;
  date: ISODate;
  expectedDate: ISODate;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  total: number;
  /** Confirmed by the supplier. */
  pickup?: { date: ISODate; vehicle: string; driver?: string; documents?: string };
  receipts: { id: ID; number: string; at: ISODate; by: string; lines: { productId: ID; quantity: number }[] }[];
  erpRef?: string;
  timeline: { status: PurchaseOrderStatus; at: ISODate; by: string; note?: string }[];
}

/* ------------------------------------------------------------------ */
/* Inventory: consignment stock and stock transfers                    */
/* ------------------------------------------------------------------ */

/** Stock that belongs to a customer's agreement, kept at one of our warehouse locations. */
export interface ConsignmentLine {
  productId: ID;
  sku: string;
  name: string;
  uom: string;
  /** Quantity at the consignment location now. */
  quantity: number;
  /** Agreed minimum; below this we top up. */
  minQty: number;
}

export interface ConsignmentMovement {
  id: ID;
  at: ISODate;
  by: string;
  kind: 'top_up' | 'call_off' | 'adjustment';
  productId: ID;
  /** Positive in, negative out. */
  quantity: number;
  /** Request or order number for call-offs. */
  ref?: string;
}

export interface Consignment {
  id: ID;
  number: string;
  customerId: ID;
  customerName: string;
  site: string;
  /** Warehouse location code in the ERP (for example CONS-ABC). */
  location: string;
  lines: ConsignmentLine[];
  movements: ConsignmentMovement[];
}

export type TransferStatus = 'pending' | 'approved' | 'initiated' | 'transferred' | 'completed' | 'rejected' | 'cancelled';
export const TRANSFER_FLOW: TransferStatus[] = ['pending', 'approved', 'initiated', 'transferred', 'completed'];
export const OPEN_TRANSFER: TransferStatus[] = ['pending', 'approved', 'initiated', 'transferred'];

export interface TransferLine {
  productId: ID;
  sku: string;
  name: string;
  uom: string;
  quantity: number;
  receivedQty: number;
}

export interface StockTransfer {
  id: ID;
  number: string;
  fromSite: string;
  toSite: string;
  status: TransferStatus;
  lines: TransferLine[];
  reason: string;
  neededBy?: ISODate;
  createdBy: ActorRef;
  date: ISODate;
  erpRef?: string;
  timeline: { status: TransferStatus; at: ISODate; by: string; note?: string }[];
  comments: { by: string; at: ISODate; text: string }[];
}

/** One product's position at a site. */
export interface StockPosition {
  product: Product;
  /** Physically at the site: free + allocated to open sales orders. */
  onHand: number;
  /** On open sales orders not yet shipped. */
  allocated: number;
  /** Held for submitted requests while the stock-hold setting applies. */
  held: number;
  /** Free to promise: on hand − allocated − held. */
  available: number;
  /** Coming in: purchase orders and transfers on the way. */
  incoming: number;
  /** Customer consignment stock at this site (not in on hand). */
  consignment: number;
  low: boolean;
}

/** What makes up a product's reserved, incoming or consignment quantity. */
export interface StockDetail {
  allocated: { orderId: ID; number: string; customerName: string; quantity: number; status: OrderStatus }[];
  held: { requestId: ID; number: string; customerName: string; quantity: number; until: ISODate }[];
  incoming: { kind: 'po' | 'transfer'; id: ID; number: string; from: string; quantity: number; status: string; expected?: ISODate }[];
  consignment: { id: ID; number: string; customerName: string; location: string; quantity: number }[];
  otherSites: { site: string; available: number }[];
}

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */

/**
 * requested: customer asked, we haven't priced it. draft: being priced. sent: with the customer.
 * accepted: turned into a sales request. declined / expired / cancelled: closed.
 */
export type QuoteStatus = 'requested' | 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'cancelled';
export const OPEN_QUOTE: QuoteStatus[] = ['requested', 'draft', 'sent'];

export interface QuoteLine {
  productId: ID;
  sku: string;
  name: string;
  uom: string;
  image: string;
  quantity: number;
  /** Customer's normal price (contract or tier) when the quote was made. */
  listPrice: number;
  /** Price we quote. */
  unitPrice: number;
  /** Customer's target price, if they gave one. */
  targetPrice?: number;
  lineTotal: number;
}

export interface Quote {
  id: ID;
  number: string;
  site?: string;
  customerId: ID;
  customerName: string;
  salesRepId: ID;
  createdBy: ActorRef;
  date: ISODate;
  status: QuoteStatus;
  /** Bumps every time a revised quote is sent. */
  version: number;
  lines: QuoteLine[];
  subtotal: number;
  tax: number;
  total: number;
  validUntil?: ISODate;
  /** Customer's message with the request. */
  customerNote?: string;
  /** Delivery, payment and other terms shown on the quote. */
  terms?: string;
  pricedBy?: string;
  requestId?: ID;
  requestNumber?: string;
  declineReason?: string;
  timeline: { status: QuoteStatus; at: ISODate; by: string; note?: string }[];
  comments: { by: string; at: ISODate; text: string }[];
}

/* ------------------------------------------------------------------ */
/* Deliveries                                                          */
/* ------------------------------------------------------------------ */

export type DeliveryStatus = 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed';
export const DELIVERY_FLOW: DeliveryStatus[] = ['scheduled', 'out_for_delivery', 'delivered'];

export interface DeliveryLine {
  productId: ID;
  sku: string;
  name: string;
  uom: string;
  quantity: number;
  /** From the proof of delivery. */
  receivedQty?: number;
  damagedQty?: number;
}

export interface ProofOfDelivery {
  receivedBy: string;
  at: ISODate;
  /** PNG data URL of the signature (the backend stores it as a document). */
  signature?: string;
  /** Photo of the delivered goods (data URL, resized on the device). */
  photo?: string;
  notes?: string;
  /** Who recorded it: driver, rep, warehouse or the customer themselves. */
  recordedBy: ActorRef;
  location?: { lat: number; lng: number };
}

export interface Delivery {
  id: ID;
  number: string;
  orderId: ID;
  orderNumber: string;
  customerId: ID;
  customerName: string;
  site?: string;
  address: Address;
  status: DeliveryStatus;
  plannedDate: ISODate;
  carrier: string;
  vehicle?: string;
  driver?: string;
  trackingRef?: string;
  lines: DeliveryLine[];
  pod?: ProofOfDelivery;
  failReason?: string;
  timeline: { status: DeliveryStatus; at: ISODate; by: string; note?: string }[];
}
