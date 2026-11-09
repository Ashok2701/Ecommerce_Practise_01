import type { Knex } from 'knex';
import { AppError } from '../common/errors';
import type { DocTable } from './migrations';
import type {
  ActivityItem, Announcement, AppNotification, CollectionNote, Consignment, Conversation, Delivery, FollowUp, Offer, OfferPresentation, Order,
  Payment, PurchaseOrder, PurchaseRequest, Quote, SalesRequest, StockTransfer, Visit, VisitReport,
} from '@/types/domain';

export const nowIso = () => new Date().toISOString();

/** Indexed columns of a document row. */
interface Meta { id: string; number?: string; site?: string; customer_id?: string; party_id?: string; status?: string; at?: string }
type Where = Partial<Record<'number' | 'site' | 'customer_id' | 'party_id' | 'status', string | string[] | null>>;

/**
 * One portal document type stored as JSON with indexed columns.
 * Optimistic concurrency: a document saved after someone else changed it fails
 * with errors.conflict (409) instead of overwriting their change.
 */
/** Version each loaded document was read at, shared by all repositories so a document read outside a transaction can be saved inside one. */
const VERSIONS = new WeakMap<object, number>();

export class DocRepo<T extends { id: string }> {
  private versions = VERSIONS;
  constructor(private k: Knex, private table: DocTable, private meta: (d: T) => Omit<Meta, 'id'>) {}

  private parse(row: { doc: string; version: number } | undefined): T | undefined {
    if (!row) return undefined;
    const d = JSON.parse(row.doc) as T;
    this.versions.set(d, row.version);
    return d;
  }

  async get(id: string): Promise<T | undefined> {
    return this.parse(await this.k(this.table).where({ id }).first());
  }

  async byNumber(number: string): Promise<T | undefined> {
    return this.parse(await this.k(this.table).where({ number }).first());
  }

  async find(where: Where = {}, opts: { limit?: number; order?: 'asc' | 'desc' } = {}): Promise<T[]> {
    let q = this.k(this.table).select('doc', 'version');
    for (const [col, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (v === null) q = q.whereNull(col);
      else if (Array.isArray(v)) q = v.length ? q.whereIn(col, v) : q.whereRaw('1 = 0');
      else q = q.where(col, v);
    }
    q = q.orderBy('at', opts.order ?? 'desc');
    if (opts.limit) q = q.limit(opts.limit);
    return (await q).map((r: { doc: string; version: number }) => this.parse(r)!);
  }

  async insert(doc: T): Promise<T> {
    const m = this.meta(doc);
    await this.k(this.table).insert({ id: doc.id, ...m, doc: JSON.stringify(doc), version: 1, updated_at: nowIso() });
    this.versions.set(doc, 1);
    return doc;
  }

  /** Insert or update. A loaded document is updated only if nobody changed it since it was read. */
  async save(doc: T): Promise<T> {
    const v = this.versions.get(doc);
    if (v === undefined) {
      const exists = await this.k(this.table).where({ id: doc.id }).first('version');
      if (!exists) return this.insert(doc);
      await this.k(this.table).where({ id: doc.id }).update({ ...this.meta(doc), doc: JSON.stringify(doc), version: exists.version + 1, updated_at: nowIso() });
      this.versions.set(doc, exists.version + 1);
      return doc;
    }
    const n = await this.k(this.table).where({ id: doc.id, version: v }).update({ ...this.meta(doc), doc: JSON.stringify(doc), version: v + 1, updated_at: nowIso() });
    if (!n) throw new AppError('errors.conflict', 409, `${this.table} ${doc.id} was changed by someone else`);
    this.versions.set(doc, v + 1);
    return doc;
  }

  async remove(id: string) { await this.k(this.table).where({ id }).delete(); }
  async count(where: Where = {}) { return (await this.find(where)).length; }
}

/** Portal additions to an ERP sales order (the order itself lives in Sage X3). */
export interface OrderExt {
  id: string; // X3 SOHNUM
  site?: string; customerId: string;
  requestId?: string; requestNumber?: string;
  createdBy?: Order['createdBy']; source?: Order['source'];
  /** Portal pricing detail per order line number (offer, list price, free goods). */
  lines?: { lineNo: number; productId: string; listPrice: number; offerId?: string; offerCode?: string; free?: boolean; freeFor?: string; image?: string }[];
  notes?: string;
  timeline: Order['timeline'];
  comments: Order['comments'];
  creditOverride?: Order['creditOverride'];
  /** Set when proof of delivery is recorded. */
  deliveredAt?: string;
  /** Last ERP status seen, to add timeline events when the ERP moves the order on. */
  erpStatus?: string;
  at: string;
}

/** Portal additions to an ERP delivery note: dispatch to the driver, proof of delivery, failed attempts. */
export interface DeliveryExt {
  id: string; // X3 SDHNUM
  orderId: string; customerId: string; site?: string;
  status: Delivery['status'];
  plannedDate?: string; vehicle?: string; driver?: string;
  lines?: { productId: string; receivedQty?: number; damagedQty?: number }[];
  pod?: Delivery['pod']; failReason?: string;
  timeline: Delivery['timeline'];
  at: string;
}

/** Portal additions to an ERP purchase order: supplier acknowledgement, pickup and dispatch. */
export interface PoExt {
  id: string; // X3 POHNUM
  site?: string; supplierId: string;
  status: 'issued' | 'acknowledged' | 'pickup_confirmed' | 'in_transit' | 'cancelled';
  requestId?: string; requestNumber?: string;
  pickup?: PurchaseOrder['pickup'];
  timeline: PurchaseOrder['timeline'];
  receiptsBy?: Record<string, string>;
  at: string;
}

/** Offer read from the ERP, kept between syncs (pricing reads this, not X3, on every cart). */
export type CachedOffer = Omit<Offer, 'presentation' | 'status'> & { syncedAt: string };
export interface PresentationRow { id: string; presentation: OfferPresentation; at: string }
export interface ProductContent { id: string; image?: string; description?: string; specs?: Record<string, string>; at: string }
export interface ConsignmentAgreement { id: string; number: string; customerId: string; customerName: string; site: string; location: string; minQty: Record<string, number>; at: string }

/** Typed repositories over one connection or transaction. */
export class Repos {
  constructor(public k: Knex) {}
  requests = new DocRepo<SalesRequest>(this.k, 'sales_requests', (d) => ({ number: d.number, site: d.site, customer_id: d.customerId, party_id: d.salesRepId, status: d.status, at: d.date }));
  quotes = new DocRepo<Quote>(this.k, 'quotes', (d) => ({ number: d.number, site: d.site, customer_id: d.customerId, party_id: d.salesRepId, status: d.status, at: d.date }));
  payments = new DocRepo<Payment>(this.k, 'payments', (d) => ({ number: d.number, customer_id: d.customerId, party_id: d.enteredBy?.id, status: d.status, at: d.date }));
  collectionNotes = new DocRepo<CollectionNote>(this.k, 'collection_notes', (d) => ({ customer_id: d.customerId, party_id: d.by.id, status: d.kind, at: d.at }));
  purchaseRequests = new DocRepo<PurchaseRequest>(this.k, 'purchase_requests', (d) => ({ number: d.number, site: d.site, party_id: d.supplierId, status: d.status, at: d.date }));
  transfers = new DocRepo<StockTransfer>(this.k, 'transfers', (d) => ({ number: d.number, site: d.fromSite, customer_id: d.toSite, party_id: d.createdBy.id, status: d.status, at: d.date }));
  consignments = new DocRepo<ConsignmentAgreement>(this.k, 'consignments', (d) => ({ number: d.number, site: d.site, customer_id: d.customerId, at: d.at }));
  announcements = new DocRepo<Announcement>(this.k, 'announcements', (d) => ({ status: d.status, at: d.publishAt }));
  conversations = new DocRepo<Conversation>(this.k, 'conversations', (d) => ({ customer_id: d.customerId, at: d.updatedAt }));
  notifications = new DocRepo<AppNotification>(this.k, 'notifications', (d) => ({ party_id: d.userId, status: d.read ? 'read' : 'unread', at: d.at }));
  followUps = new DocRepo<FollowUp>(this.k, 'follow_ups', (d) => ({ customer_id: d.customerId, party_id: d.salesRepId, status: d.status, at: d.date }));
  visits = new DocRepo<Visit>(this.k, 'visits', (d) => ({ customer_id: d.customerId, party_id: d.salesRepId, status: d.status, at: d.date }));
  visitReports = new DocRepo<VisitReport>(this.k, 'visit_reports', (d) => ({ customer_id: d.customerId, party_id: d.salesRepId, status: d.outcome, at: d.at }));
  activity = new DocRepo<ActivityItem & { site?: string }>(this.k, 'activity', (d) => ({ site: d.site, status: d.kind, at: d.at }));
  orderExt = new DocRepo<OrderExt>(this.k, 'order_ext', (d) => ({ site: d.site, customer_id: d.customerId, party_id: d.requestId, at: d.at }));
  deliveryExt = new DocRepo<DeliveryExt>(this.k, 'delivery_ext', (d) => ({ site: d.site, customer_id: d.customerId, party_id: d.orderId, status: d.status, at: d.at }));
  poExt = new DocRepo<PoExt>(this.k, 'po_ext', (d) => ({ site: d.site, party_id: d.supplierId, status: d.status, at: d.at }));
  offers = new DocRepo<CachedOffer>(this.k, 'offers', (d) => ({ number: d.code, at: d.validFrom }));
  presentations = new DocRepo<PresentationRow>(this.k, 'offer_presentation', (d) => ({ at: d.at }));
  productContent = new DocRepo<ProductContent>(this.k, 'product_content', (d) => ({ at: d.at }));

  /** Next number in a named sequence (atomic inside a transaction). */
  async next(name: string, start: number): Promise<number> {
    const n = await this.k('sequences').where({ name }).increment('next_value', 1);
    if (!n) {
      try { await this.k('sequences').insert({ name, next_value: start + 1 }); return start; } catch { return this.next(name, start); }
    }
    const row = await this.k('sequences').where({ name }).first('next_value');
    return row.next_value - 1;
  }

  async setting<T>(key: string): Promise<T | undefined> {
    const row = await this.k('settings').where({ key }).first();
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  async putSetting(key: string, value: unknown, by?: string) {
    const row = { value: JSON.stringify(value), updated_at: nowIso(), updated_by: by ?? null };
    const n = await this.k('settings').where({ key }).update(row);
    if (!n) await this.k('settings').insert({ key, ...row });
  }

  async audit(e: { userId?: string; userName?: string; site?: string; action: string; entity: string; entityId?: string; detail?: unknown }) {
    await this.k('audit_log').insert({
      at: nowIso(), user_id: e.userId ?? null, user_name: e.userName ?? null, site: e.site ?? null, action: e.action, entity: e.entity,
      entity_id: e.entityId ?? null, detail: e.detail === undefined ? null : JSON.stringify(e.detail),
    });
  }
}

/** The portal database: plain reads use `repos`; writes go through `tx`. */
export class PortalDb {
  readonly repos: Repos;
  constructor(public readonly k: Knex) { this.repos = new Repos(k); }
  /** Run work in one transaction; documents saved inside commit or roll back together. */
  tx<T>(fn: (r: Repos) => Promise<T>): Promise<T> {
    return this.k.transaction((trx) => fn(new Repos(trx)));
  }
}
