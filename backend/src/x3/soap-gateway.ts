import { AppError } from '../common/errors';
import type {
  CustomerReceiptInput, GoodsReceiptInput, LocationMoveInput, PurchaseOrderInput, SalesOrderInput, TransferInput, X3Gateway,
} from './gateway';

/**
 * Sage X3 SOAP web services (classic CAdxWebServiceXmlCC).
 *
 * In X3 (Development > Web services), publish these objects and
 * sub-programs under the public names below, on the pool set in X3_WS_POOL:
 *
 *   NXSOH      object SOH  (sales order)            save
 *   NXSOHCLS   sub-program closing a sales order    run   (I: SOHNUM, REF)
 *   NXPOH      object POH  (purchase order)         save
 *   NXPOHCLS   sub-program closing a purchase order run   (I: POHNUM, REF)
 *   NXPTH      object PTH  (purchase receipt)       save
 *   NXPAY      object PAY  (customer receipt)       save
 *   NXSTR      sub-program: inter-site shipment     run   (I: REF, FCYFROM, FCYTO, ITMREF[], QTY[]  O: VCRNUM)
 *   NXSTRRCP   sub-program: inter-site receipt      run   (I: REF, VCRNUM, FCYTO, ITMREF[], QTY[])
 *   NXSCS      object SCS  (stock change: location transfer)  save
 *
 * Screen group ids (SOH0_1, SOH4_1 ...) differ between X3 versions and
 * screen customisations; they are kept in OBJECTS below so the client's X3
 * consultant can align them with the published object (the web-service test
 * page in X3 shows the exact XML it expects).
 */
const OBJECTS = {
  salesOrder: { publicName: 'NXSOH', header: 'SOH0_1', lines: 'SOH4_1', key: 'SOHNUM' },
  purchaseOrder: { publicName: 'NXPOH', header: 'POH0_1', lines: 'POH4_1', key: 'POHNUM' },
  receipt: { publicName: 'NXPTH', header: 'PTH0_1', lines: 'PTH1_3', key: 'PTHNUM' },
  payment: { publicName: 'NXPAY', header: 'PAYH_1', lines: 'PAYD_1', key: 'NUM' },
  stockChange: { publicName: 'NXSCS', header: 'SCS0_1', lines: 'SCS1_1', key: 'VCRNUM' },
};

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const x3Date = (iso: string) => iso.slice(0, 10).replace(/-/g, ''); // YYYYMMDD
const fld = (name: string, v: unknown) => `<FLD NAME="${name}">${esc(v)}</FLD>`;
const grp = (id: string, fields: Record<string, unknown>) => `<GRP ID="${id}">${Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => fld(k, v)).join('')}</GRP>`;
const tab = (id: string, rows: Record<string, unknown>[]) =>
  `<TAB ID="${id}">${rows.map((r, i) => `<LIN NUM="${i + 1}">${Object.entries(r).filter(([, v]) => v !== undefined).map(([k, v]) => fld(k, v)).join('')}</LIN>`).join('')}</TAB>`;

export interface SoapConfig { url: string; pool: string; user: string; password: string; lang: string; timeoutMs: number }

export class SoapGateway implements X3Gateway {
  readonly mode = 'live' as const;
  constructor(private cfg: SoapConfig, private fetchImpl: typeof fetch = fetch) {}

  /** SOAP envelope for save / run. Exposed for tests. */
  envelope(op: 'save' | 'run', publicName: string, xml: string) {
    const body = op === 'save' ? `<objectXml>${esc(xml)}</objectXml>` : `<inputXml>${esc(xml)}</inputXml>`;
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wss="http://www.adonix.com/WSS">
<soapenv:Header/>
<soapenv:Body>
<wss:${op}>
<callContext><codeLang>${esc(this.cfg.lang)}</codeLang><poolAlias>${esc(this.cfg.pool)}</poolAlias><poolId></poolId><requestConfig>adxwss.optreturn=XML&amp;adxwss.beautify=false</requestConfig></callContext>
<publicName>${esc(publicName)}</publicName>
${body}
</wss:${op}>
</soapenv:Body>
</soapenv:Envelope>`;
  }

  /** Calls X3 and returns the result XML; X3 errors become errors.erp.rejected with X3's own message. */
  async call(op: 'save' | 'run', publicName: string, xml: string): Promise<string> {
    if (!this.cfg.url) throw new AppError('errors.erp.unavailable', 503, 'X3_WS_URL is not set');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    let text: string;
    try {
      const res = await this.fetchImpl(this.cfg.url, {
        method: 'POST', signal: ctrl.signal,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""',
          Authorization: `Basic ${Buffer.from(`${this.cfg.user}:${this.cfg.password}`).toString('base64')}`,
        },
        body: this.envelope(op, publicName, xml),
      });
      text = await res.text();
      if (!res.ok && !text.includes('<status>')) throw new AppError('errors.erp.unavailable', 503, `X3 HTTP ${res.status}`);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('errors.erp.unavailable', 503, `X3 not reachable: ${(e as Error).message}`);
    } finally { clearTimeout(timer); }
    return SoapGateway.parse(text);
  }

  /** status 1 = success; otherwise X3's messages are returned in the error. */
  static parse(text: string): string {
    const status = text.match(/<status[^>]*>(\d)<\/status>/)?.[1];
    const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const result = unescape(text.match(/<resultXml[^>]*>([\s\S]*?)<\/resultXml>/)?.[1] ?? '').replace(/^<!\[CDATA\[|\]\]>$/g, '');
    if (status !== '1') {
      const msgs = [...text.matchAll(/<message[^>]*>([\s\S]*?)<\/message>/g)].map((m) => unescape(m[1]).trim()).filter(Boolean);
      throw new AppError('errors.erp.rejected', 422, `X3: ${msgs.join(' | ') || 'call failed'}`);
    }
    return result;
  }

  static field(xml: string, name: string) { return xml.match(new RegExp(`<FLD[^>]*NAME="${name}"[^>]*>([^<]*)</FLD>`))?.[1]?.trim() ?? ''; }

  private async save(o: (typeof OBJECTS)[keyof typeof OBJECTS], xml: string) {
    const out = await this.call('save', o.publicName, xml);
    const id = SoapGateway.field(out, o.key);
    if (!id) throw new AppError('errors.erp.rejected', 422, `X3 did not return ${o.key}`);
    return { id };
  }

  createSalesOrder(i: SalesOrderInput) {
    const o = OBJECTS.salesOrder;
    const xml = `<PARAM>${grp(o.header, { SALFCY: i.site, SOHTYP: 'SON', BPCORD: i.customerId, ORDDAT: x3Date(new Date().toISOString()), CUSORDREF: i.poNumber, REP: i.repCode, DEMDLVDAT: x3Date(i.expectedDelivery), ZPORTREF: i.ref })}${tab(o.lines,
      i.lines.map((l) => ({ ITMREF: l.productId, QTY: l.quantity, GROPRI: l.grossPrice, DISCRGVAL1: l.discountPct, FOCFLG: l.free ? 2 : 1, STOLOC: l.location })))}</PARAM>`;
    return this.save(o, xml);
  }

  async cancelSalesOrder(id: string, ref: string) { await this.call('run', 'NXSOHCLS', `<PARAM>${grp('GRP1', { SOHNUM: id, REF: ref })}</PARAM>`); }

  createPurchaseOrder(i: PurchaseOrderInput) {
    const o = OBJECTS.purchaseOrder;
    const xml = `<PARAM>${grp(o.header, { POHFCY: i.site, BPSNUM: i.supplierId, ORDDAT: x3Date(new Date().toISOString()), ZPORTREF: i.ref })}${tab(o.lines,
      i.lines.map((l) => ({ ITMREF: l.productId, QTYUOM: l.quantity, GROPRI: l.unitCost, EXTRCPDAT: x3Date(i.expectedDate) })))}</PARAM>`;
    return this.save(o, xml);
  }

  async closePurchaseOrder(id: string, ref: string) { await this.call('run', 'NXPOHCLS', `<PARAM>${grp('GRP1', { POHNUM: id, REF: ref })}</PARAM>`); }

  postGoodsReceipt(i: GoodsReceiptInput) {
    const o = OBJECTS.receipt;
    const xml = `<PARAM>${grp(o.header, { PRHFCY: i.site, BPSNUM: i.supplierId, RCPDAT: x3Date(new Date().toISOString()), ZPORTREF: i.ref })}${tab(o.lines,
      i.lines.map((l) => ({ POHNUM: i.orderId, ITMREF: l.productId, QTYUOM: l.quantity })))}</PARAM>`;
    return this.save(o, xml);
  }

  postCustomerReceipt(i: CustomerReceiptInput) {
    const o = OBJECTS.payment;
    const xml = `<PARAM>${grp(o.header, { BPR: i.customerId, FCY: i.site, ACCDAT: x3Date(i.date), AMTCUR: i.amount, PAM: i.method, CHQNUM: i.reference, ZPORTREF: i.ref })}${tab(o.lines,
      i.allocations.map((a) => ({ VCRNUM: a.invoiceId, AMTLIN: a.amount })))}</PARAM>`;
    return this.save(o, xml);
  }

  async shipTransfer(i: TransferInput) {
    const out = await this.call('run', 'NXSTR', `<PARAM>${grp('GRP1', { REF: i.ref, FCYFROM: i.fromSite, FCYTO: i.toSite })}${tab('GRP2', i.lines.map((l) => ({ ITMREF: l.productId, QTY: l.quantity })))}</PARAM>`);
    const id = SoapGateway.field(out, 'VCRNUM');
    if (!id) throw new AppError('errors.erp.rejected', 422, 'X3 did not return the transfer number');
    return { id };
  }

  async receiveTransfer(i: TransferInput & { erpRef: string }) {
    await this.call('run', 'NXSTRRCP', `<PARAM>${grp('GRP1', { REF: i.ref, VCRNUM: i.erpRef, FCYTO: i.toSite })}${tab('GRP2', i.lines.map((l) => ({ ITMREF: l.productId, QTY: l.quantity })))}</PARAM>`);
  }

  moveToLocation(i: LocationMoveInput) {
    const o = OBJECTS.stockChange;
    const xml = `<PARAM>${grp(o.header, { STOFCY: i.site, IPTDAT: x3Date(new Date().toISOString()), VCRDES: i.ref })}${tab(o.lines,
      i.lines.map((l) => ({ ITMREF: l.productId, QTYSTU: l.quantity, LOCDES: i.location })))}</PARAM>`;
    return this.save(o, xml);
  }
}
