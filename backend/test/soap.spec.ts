import { SoapGateway } from '../src/x3/soap-gateway';
import { AppError } from '../src/common/errors';

const cfg = { url: 'https://x3.test/soap', pool: 'NEXUS', user: 'ws', password: 'pw', lang: 'ENG', timeoutMs: 2000 };

describe('X3 SOAP gateway', () => {
  it('builds a save call for the sales order publication with escaped XML', async () => {
    let sent = '';
    let auth = '';
    const fake = (async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      sent = init.body; auth = init.headers.Authorization;
      return { ok: true, status: 200, text: async () => '<saveReturn><status>1</status><resultXml>&lt;RESULT&gt;&lt;GRP ID="SOH0_1"&gt;&lt;FLD NAME="SOHNUM"&gt;SON2611-0001&lt;/FLD&gt;&lt;/GRP&gt;&lt;/RESULT&gt;</resultXml></saveReturn>' };
    }) as unknown as typeof fetch;
    const gw = new SoapGateway(cfg, fake);
    const r = await gw.createSalesOrder({
      ref: 'SR-26-01001/k1', customerId: 'BP<1>', site: 'MAIN', expectedDelivery: '2026-11-20T00:00:00Z', net: 100, total: 118,
      lines: [{ productId: 'ITM1', name: 'Item', quantity: 2, grossPrice: 50, netPrice: 50, discountPct: 0 }],
    });
    expect(r.id).toBe('SON2611-0001');
    expect(sent).toContain('<publicName>NXSOH</publicName>');
    expect(sent).toContain('<poolAlias>NEXUS</poolAlias>');
    expect(sent).toContain('BP&amp;lt;1&amp;gt;'); // escaped in the object XML, then again inside the envelope
    expect(sent).toContain('ZPORTREF');
    expect(auth).toBe(`Basic ${Buffer.from('ws:pw').toString('base64')}`);
  });

  it('turns X3 errors into errors.erp.rejected with the X3 message', () => {
    try {
      SoapGateway.parse('<saveReturn><status>0</status><messages><message>Customer BP-1 is blocked</message></messages></saveReturn>');
      throw new Error('should fail');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('errors.erp.rejected');
      expect((e as AppError).message).toContain('Customer BP-1 is blocked');
    }
  });

  it('reports an unreachable X3 as errors.erp.unavailable', async () => {
    const down = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(new SoapGateway(cfg, down).closePurchaseOrder('PO1', 'r')).rejects.toMatchObject({ code: 'errors.erp.unavailable' });
  });
});
