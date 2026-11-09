import type { Knex } from 'knex';
import { TRSTYP } from './schema';
import type {
  CustomerReceiptInput, GoodsReceiptInput, LocationMoveInput, PurchaseOrderInput, SalesOrderInput, TransferInput, X3Gateway,
} from '../gateway';

const now = () => new Date().toISOString();
const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Simulated Sage X3 for development and tests. Applies the same effects X3
 * does when the web services are called (documents, allocations, stock,
 * open items), on the simulated tables in x3/sim/schema.ts.
 *
 * `advanceOrder` stands in for the warehouse working in X3 (allocation,
 * preparation, delivery and invoicing); it is not part of the gateway.
 */
export class SimGateway implements X3Gateway {
  readonly mode = 'sim' as const;
  constructor(private k: Knex) {}

  private async nextNumber(trx: Knex, table: string, col: string, prefix: string, start: number) {
    const rows = await trx(table).select(col).where(col, 'like', `${prefix}%`);
    const max = rows.reduce((m: number, r: Record<string, string>) => Math.max(m, Number(String(r[col]).slice(prefix.length)) || 0), start - 1);
    return `${prefix}${String(max + 1).padStart(5, '0')}`;
  }

  private async stockRow(trx: Knex, item: string, site: string) {
    const row = await trx('ITMMVT').where({ ITMREF_0: item, STOFCY_0: site }).first();
    if (!row) await trx('ITMMVT').insert({ ITMREF_0: item, STOFCY_0: site, PHYSTO_0: 0, PHYALL_0: 0 });
  }
  private async addStock(trx: Knex, item: string, site: string, physical: number, allocated: number) {
    await this.stockRow(trx, item, site);
    await trx('ITMMVT').where({ ITMREF_0: item, STOFCY_0: site }).update({
      PHYSTO_0: trx.raw('PHYSTO_0 + ?', [physical]), PHYALL_0: trx.raw('PHYALL_0 + ?', [allocated]),
    });
  }
  private async addLocation(trx: Knex, item: string, site: string, loc: string, qty: number) {
    const row = await trx('STOCK').where({ ITMREF_0: item, STOFCY_0: site, LOC_0: loc }).first();
    if (row) await trx('STOCK').where({ STOCKID: row.STOCKID }).update({ QTYSTU_0: Math.max(0, Number(row.QTYSTU_0) + qty) });
    else await trx('STOCK').insert({ ITMREF_0: item, STOFCY_0: site, LOC_0: loc, QTYSTU_0: Math.max(0, qty) });
  }
  private journal(trx: Knex, row: { site: string; item: string; qty: number; type: number; ref: string; party?: string; loc?: string; at?: string }) {
    return trx('STOJOU').insert({ STOFCY_0: row.site, ITMREF_0: row.item, IPTDAT_0: row.at ?? now(), QTYSTU_0: row.qty, TRSTYP_0: row.type, VCRNUM_0: row.ref, BPRNUM_0: row.party ?? '', LOC_0: row.loc ?? '' });
  }

  async createSalesOrder(i: SalesOrderInput) {
    return this.k.transaction(async (trx) => {
      const id = await this.nextNumber(trx, 'SORDER', 'SOHNUM_0', 'SO-26-', 4100);
      const cust = await trx('BPCUSTOMER').where({ BPCNUM_0: i.customerId }).first();
      await trx('SORDER').insert({
        SOHNUM_0: id, BPCORD_0: i.customerId, SALFCY_0: i.site, ORDDAT_0: now(), DEMDLVDAT_0: i.expectedDelivery, CUSORDREF_0: i.poNumber ?? '',
        REP_0: i.repCode ?? cust?.REP_0 ?? '', ZPORTREF_0: i.ref, BPAADD_0: cust?.BPAADD_0 ?? '', ORDSTA_0: 1, ALLSTA_0: 1, DLVSTA_0: 1, INVSTA_0: 1,
        ORDINVNOT_0: i.net, ORDINVATI_0: i.total,
      });
      let lineNo = 0;
      for (const l of i.lines) {
        lineNo += 1000;
        await trx('SORDERQ').insert({ SOHNUM_0: id, SOPLIN_0: lineNo, ITMREF_0: l.productId, QTY_0: l.quantity, DLVQTY_0: 0, FOCFLG_0: l.free ? 2 : 1, STOLOC_0: l.location ?? '' });
        await trx('SORDERP').insert({ SOHNUM_0: id, SOPLIN_0: lineNo, ITMDES1_0: l.name, GROPRI_0: l.grossPrice, NETPRI_0: l.netPrice, DISCRGVAL1_0: l.discountPct });
        if (l.location) {
          // call-off from the customer's consignment location
          await this.addLocation(trx, l.productId, i.site, l.location, -l.quantity);
          await this.journal(trx, { site: i.site, item: l.productId, qty: -l.quantity, type: TRSTYP.consignmentOut, ref: id, party: cust?.BPCNAM_0, loc: l.location });
        } else {
          await this.addStock(trx, l.productId, i.site, 0, l.quantity);
          await this.journal(trx, { site: i.site, item: l.productId, qty: -l.quantity, type: TRSTYP.sale, ref: id, party: cust?.BPCNAM_0 });
        }
      }
      return { id };
    });
  }

  async cancelSalesOrder(id: string) {
    await this.k.transaction(async (trx) => {
      const h = await trx('SORDER').where({ SOHNUM_0: id }).first();
      if (!h || h.ORDSTA_0 === 2) return;
      if (h.DLVSTA_0 !== 1) throw new Error('errors.orders.cannotCancel');
      const lines = await trx('SORDERQ').where({ SOHNUM_0: id });
      for (const l of lines) {
        const open = Number(l.QTY_0) - Number(l.DLVQTY_0);
        if (open <= 0) continue;
        if (l.STOLOC_0) await this.addLocation(trx, l.ITMREF_0, h.SALFCY_0, l.STOLOC_0, open);
        else await this.addStock(trx, l.ITMREF_0, h.SALFCY_0, 0, -open);
      }
      await trx('STOJOU').where({ VCRNUM_0: id }).delete();
      await trx('SORDER').where({ SOHNUM_0: id }).update({ ORDSTA_0: 2 });
    });
  }

  /** Simulation only: the warehouse moves an order on (allocated, prepared, then delivered and invoiced). */
  async advanceOrder(id: string) {
    return this.k.transaction(async (trx) => {
      const h = await trx('SORDER').where({ SOHNUM_0: id }).first();
      if (!h || h.ORDSTA_0 === 2) return null;
      if (h.ALLSTA_0 < 3) { await trx('SORDER').where({ SOHNUM_0: id }).update({ ALLSTA_0: h.ALLSTA_0 + 1 }); return 'allocated'; }
      if (h.DLVSTA_0 === 3) return null;
      // delivery note + invoice
      const lines = await trx('SORDERQ').join('SORDERP', function () { this.on('SORDERP.SOHNUM_0', '=', 'SORDERQ.SOHNUM_0').andOn('SORDERP.SOPLIN_0', '=', 'SORDERQ.SOPLIN_0'); })
        .where('SORDERQ.SOHNUM_0', id).select('SORDERQ.*', 'SORDERP.NETPRI_0');
      const del = await this.nextNumber(trx, 'SDELIVERY', 'SDHNUM_0', 'DN-26-', 5300);
      const cust = await trx('BPCUSTOMER').where({ BPCNUM_0: h.BPCORD_0 }).first();
      const b2c = cust?.BCGCOD_0 === 'B2C';
      await trx('SDELIVERY').insert({ SDHNUM_0: del, SOHNUM_0: id, BPCORD_0: h.BPCORD_0, STOFCY_0: h.SALFCY_0, DLVDAT_0: h.DEMDLVDAT_0, SHIDAT_0: now(), BPTNUM_0: b2c ? 'BLUEDART' : 'VRL', ZTRKNUM_0: `VRL${4600000 + Number(del.slice(-5))}`, CFMFLG_0: 2 });
      // one delivery line per item (free goods ship with the paid quantity of the same item)
      const byItem = new Map<string, number>();
      for (const l of lines) byItem.set(l.ITMREF_0, (byItem.get(l.ITMREF_0) ?? 0) + Number(l.QTY_0) - Number(l.DLVQTY_0));
      let n = 0;
      for (const [item, qty] of byItem) { n += 1000; await trx('SDELIVERYD').insert({ SDHNUM_0: del, SDDLIN_0: n, ITMREF_0: item, QTY_0: qty }); }
      for (const l of lines) {
        const open = Number(l.QTY_0) - Number(l.DLVQTY_0);
        if (!l.STOLOC_0) await this.addStock(trx, l.ITMREF_0, h.SALFCY_0, -open, -open);
        await trx('SORDERQ').where({ SOHNUM_0: id, SOPLIN_0: l.SOPLIN_0 }).update({ DLVQTY_0: l.QTY_0 });
      }
      const inv = await this.nextNumber(trx, 'SINVOICE', 'NUM_0', 'INV-26-', 2210);
      const terms = await trx('TABPAYTERM').where({ PTE_0: cust?.PTE_0 ?? '' }).first();
      const days = b2c ? 0 : Number(String(terms?.DES_0 ?? '').match(/\d+/)?.[0] ?? 30);
      await trx('SINVOICE').insert({ NUM_0: inv, BPR_0: h.BPCORD_0, ACCDAT_0: now(), FCY_0: h.SALFCY_0, AMTATI_0: h.ORDINVATI_0 });
      await trx('SINVOICED').insert({ NUM_0: inv, SOHNUM_0: id });
      await trx('GACCDUDATE').insert({ NUM_0: inv, BPR_0: h.BPCORD_0, DUDDAT_0: new Date(Date.now() + days * DAY).toISOString(), TYP_0: 'INV', AMTCUR_0: h.ORDINVATI_0, PAYCUR_0: b2c ? h.ORDINVATI_0 : 0 });
      await trx('SORDER').where({ SOHNUM_0: id }).update({ DLVSTA_0: 3, INVSTA_0: 3 });
      return 'dispatched';
    });
  }

  async createPurchaseOrder(i: PurchaseOrderInput) {
    return this.k.transaction(async (trx) => {
      const id = await this.nextNumber(trx, 'PORDER', 'POHNUM_0', 'PO-26-', 7120);
      await trx('PORDER').insert({ POHNUM_0: id, BPSNUM_0: i.supplierId, POHFCY_0: i.site, ORDDAT_0: now(), EXTRCPDAT_0: i.expectedDate, ZPORTREF_0: i.ref, CLEFLG_0: 1 });
      let n = 0;
      for (const l of i.lines) { n += 1000; await trx('PORDERQ').insert({ POHNUM_0: id, POPLIN_0: n, ITMREF_0: l.productId, QTYUOM_0: l.quantity, RCPQTYUOM_0: 0, NETPRI_0: l.unitCost }); }
      return { id };
    });
  }

  async closePurchaseOrder(id: string) { await this.k('PORDER').where({ POHNUM_0: id }).update({ CLEFLG_0: 2 }); }

  async postGoodsReceipt(i: GoodsReceiptInput) {
    return this.k.transaction(async (trx) => {
      const id = await this.nextNumber(trx, 'PRECEIPT', 'PTHNUM_0', 'GRN-26-', 880);
      const sup = await trx('BPSUPPLIER').where({ BPSNUM_0: i.supplierId }).first();
      await trx('PRECEIPT').insert({ PTHNUM_0: id, BPSNUM_0: i.supplierId, PRHFCY_0: i.site, RCPDAT_0: now(), CREUSR_0: i.user });
      let n = 0;
      for (const l of i.lines) {
        n += 1000;
        await trx('PRECEIPTD').insert({ PTHNUM_0: id, PTDLIN_0: n, POHNUM_0: i.orderId, ITMREF_0: l.productId, QTYUOM_0: l.quantity });
        const pl = await trx('PORDERQ').where({ POHNUM_0: i.orderId, ITMREF_0: l.productId }).first();
        if (pl) await trx('PORDERQ').where({ POHNUM_0: i.orderId, POPLIN_0: pl.POPLIN_0 }).update({ RCPQTYUOM_0: Number(pl.RCPQTYUOM_0) + l.quantity });
        await this.addStock(trx, l.productId, i.site, l.quantity, 0);
        await this.journal(trx, { site: i.site, item: l.productId, qty: l.quantity, type: TRSTYP.receipt, ref: id, party: sup?.BPSNAM_0 });
      }
      return { id };
    });
  }

  async postCustomerReceipt(i: CustomerReceiptInput) {
    return this.k.transaction(async (trx) => {
      const id = await this.nextNumber(trx, 'PAYMENTH', 'NUM_0', 'RCP-26-', 900);
      await trx('PAYMENTH').insert({ NUM_0: id, BPR_0: i.customerId, ACCDAT_0: i.date, AMTCUR_0: i.amount, PAM_0: i.method, CHQNUM_0: i.reference, ZPORTREF_0: i.ref, FCY_0: i.site ?? '' });
      let n = 0;
      for (const a of i.allocations) {
        n += 1;
        await trx('PAYMENTD').insert({ NUM_0: id, LIN_0: n, VCRNUM_0: a.invoiceId, AMTLIN_0: a.amount });
        const due = await trx('GACCDUDATE').where({ NUM_0: a.invoiceId }).first();
        if (due) await trx('GACCDUDATE').where({ NUM_0: a.invoiceId }).update({ PAYCUR_0: r2(Number(due.PAYCUR_0) + a.amount) });
      }
      return { id };
    });
  }

  async shipTransfer(i: TransferInput) {
    return this.k.transaction(async (trx) => {
      const rows = await trx('STOJOU').where('VCRNUM_0', 'like', 'STR%').select('VCRNUM_0');
      const id = `STR${rows.reduce((m: number, r: { VCRNUM_0: string }) => Math.max(m, Number(r.VCRNUM_0.slice(3)) || 0), 522000) + 1}`;
      for (const l of i.lines) {
        await this.addStock(trx, l.productId, i.fromSite, -l.quantity, 0);
        await this.journal(trx, { site: i.fromSite, item: l.productId, qty: -l.quantity, type: TRSTYP.transferOut, ref: id, party: i.toSite });
      }
      return { id };
    });
  }

  async receiveTransfer(i: TransferInput & { erpRef: string }) {
    await this.k.transaction(async (trx) => {
      for (const l of i.lines) {
        if (l.quantity <= 0) continue;
        await this.addStock(trx, l.productId, i.toSite, l.quantity, 0);
        await this.journal(trx, { site: i.toSite, item: l.productId, qty: l.quantity, type: TRSTYP.transferIn, ref: i.erpRef, party: i.fromSite });
      }
    });
  }

  async moveToLocation(i: LocationMoveInput) {
    return this.k.transaction(async (trx) => {
      const id = `SCS${Date.now().toString().slice(-8)}`;
      const cust = await trx('BPCUSTOMER').where({ BPCNUM_0: i.customerId }).first();
      for (const l of i.lines) {
        await this.addStock(trx, l.productId, i.site, -l.quantity, 0);
        await this.addLocation(trx, l.productId, i.site, i.location, l.quantity);
        await this.journal(trx, { site: i.site, item: l.productId, qty: -l.quantity, type: TRSTYP.consignmentIn, ref: i.ref, party: cust?.BPCNAM_0, loc: i.location });
      }
      return { id };
    });
  }
}
