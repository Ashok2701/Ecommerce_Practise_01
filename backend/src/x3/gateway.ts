import type { Knex } from 'knex';

/**
 * Everything the portal changes in Sage X3. Implemented by the web-service
 * client (live) and by the simulation (development and tests). The portal
 * never writes X3 tables itself.
 *
 * Every call carries `ref`, the portal's own reference (for example the sales
 * request number and conversion key). It is stored on the X3 document
 * (Z*PORTREF fields), so a retry after a time-out can find the document the
 * first call created instead of creating a second one.
 */
export interface SalesOrderLineInput {
  productId: string; name: string; quantity: number;
  /** Customer unit price before line discount. */
  grossPrice: number; netPrice: number; discountPct: number;
  /** Free-goods line (X3 FOC line). */
  free?: boolean;
  /** Take the stock from this location (customer consignment) instead of free stock. */
  location?: string;
}
export interface SalesOrderInput {
  ref: string; customerId: string; site: string; poNumber?: string; repCode?: string; expectedDelivery: string;
  lines: SalesOrderLineInput[]; net: number; total: number;
}
export interface PurchaseOrderInput { ref: string; supplierId: string; site: string; expectedDate: string; lines: { productId: string; quantity: number; unitCost: number }[] }
export interface GoodsReceiptInput { ref: string; orderId: string; supplierId: string; site: string; user: string; lines: { productId: string; quantity: number }[] }
export interface CustomerReceiptInput { ref: string; customerId: string; site?: string; date: string; amount: number; method: string; reference: string; allocations: { invoiceId: string; amount: number }[] }
export interface TransferInput { ref: string; fromSite: string; toSite: string; lines: { productId: string; quantity: number }[] }
export interface LocationMoveInput { ref: string; site: string; location: string; customerId: string; lines: { productId: string; quantity: number }[] }

export interface X3Gateway {
  readonly mode: 'live' | 'sim';
  createSalesOrder(i: SalesOrderInput): Promise<{ id: string }>;
  cancelSalesOrder(id: string, ref: string): Promise<void>;
  createPurchaseOrder(i: PurchaseOrderInput): Promise<{ id: string }>;
  closePurchaseOrder(id: string, ref: string): Promise<void>;
  postGoodsReceipt(i: GoodsReceiptInput): Promise<{ id: string }>;
  postCustomerReceipt(i: CustomerReceiptInput): Promise<{ id: string }>;
  /** Inter-site transfer: stock leaves the source site. Returns the X3 document number. */
  shipTransfer(i: TransferInput): Promise<{ id: string }>;
  /** Inter-site transfer arrives at the destination (received quantities). */
  receiveTransfer(i: TransferInput & { erpRef: string }): Promise<void>;
  /** Location transfer at a site, e.g. free stock into a customer consignment location. */
  moveToLocation(i: LocationMoveInput): Promise<{ id: string }>;
}

export const X3_GATEWAY = Symbol('X3_GATEWAY');

/** Records every ERP call in erp_calls (operation, reference, result, duration) for support. */
export function withCallLog(inner: X3Gateway, portal: Knex, onWrite: () => void): X3Gateway {
  const wrap = <A extends { ref?: string }, R>(op: string, fn: (a: A) => Promise<R>) => async (a: A): Promise<R> => {
    const t0 = Date.now();
    try {
      const r = await fn(a);
      onWrite();
      void portal('erp_calls').insert({ at: new Date().toISOString(), operation: op, ref: a?.ref ?? null, status: 'ok', erp_ref: (r as { id?: string })?.id ?? null, request: JSON.stringify(a), duration_ms: Date.now() - t0 }).catch(() => undefined);
      return r;
    } catch (e) {
      void portal('erp_calls').insert({ at: new Date().toISOString(), operation: op, ref: a?.ref ?? null, status: 'failed', request: JSON.stringify(a), response: String((e as Error).message).slice(0, 4000), duration_ms: Date.now() - t0 }).catch(() => undefined);
      throw e;
    }
  };
  return {
    mode: inner.mode,
    createSalesOrder: wrap('createSalesOrder', (i) => inner.createSalesOrder(i)),
    cancelSalesOrder: (id, ref) => wrap('cancelSalesOrder', (a: { id: string; ref: string }) => inner.cancelSalesOrder(a.id, a.ref))({ id, ref }),
    createPurchaseOrder: wrap('createPurchaseOrder', (i) => inner.createPurchaseOrder(i)),
    closePurchaseOrder: (id, ref) => wrap('closePurchaseOrder', (a: { id: string; ref: string }) => inner.closePurchaseOrder(a.id, a.ref))({ id, ref }),
    postGoodsReceipt: wrap('postGoodsReceipt', (i) => inner.postGoodsReceipt(i)),
    postCustomerReceipt: wrap('postCustomerReceipt', (i) => inner.postCustomerReceipt(i)),
    shipTransfer: wrap('shipTransfer', (i) => inner.shipTransfer(i)),
    receiveTransfer: wrap('receiveTransfer', (i) => inner.receiveTransfer(i)),
    moveToLocation: wrap('moveToLocation', (i) => inner.moveToLocation(i)),
  };
}
