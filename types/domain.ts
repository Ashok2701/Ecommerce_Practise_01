/**
 * Domain model for the B2B platform.
 * These types mirror the contract expected from the future Node.js backend
 * (which in turn maps Sage X3 entities: BPCUSTOMER, ITMMASTER, SORDER, SINVOICE ...).
 */

export type Role = 'admin' | 'manager' | 'sales' | 'customer';
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
  customerId?: ID; // set when role === 'customer' (1 customer = 1 login in V1)
  monthlyTarget?: number; // sales reps
  createdAt: ISODate;
  lastLoginAt?: ISODate;
}

export type CustomerStatus = 'active' | 'on_hold' | 'inactive';

export interface Customer {
  id: ID;
  code: string; // ERP business partner code
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
  stock: number;
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
  erpRef?: string; // Sage X3 SOHNUM once accepted
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

export interface Payment {
  id: ID;
  customerId: ID;
  date: ISODate;
  amount: number;
  method: 'NEFT' | 'RTGS' | 'Cheque' | 'UPI';
  reference: string;
  invoiceNumbers: string[];
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
