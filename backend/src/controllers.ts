import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Access, CtxParam, isManager, isRep, Public, Roles, type Ctx } from './common/ctx';
import { forbidden } from './common/errors';
import { AdminService } from './services/admin.service';
import { SalesService } from './services/sales.service';
import { RequestsService, type ConvertOptions, type SubmitInput } from './services/requests.service';
import { CommerceService } from './services/commerce.service';
import { InventoryService } from './services/inventory.service';
import { PurchasingService } from './services/purchasing.service';
import { EngageService } from './services/engage.service';
import { TeamService } from './services/team.service';
import { Erp } from './services/erp';
import type { Announcement, FollowUp, OfferPresentation, WorkflowSettings } from '@/types/domain';

type Q = Record<string, string | undefined>;

/* ---------------------------- health, auth, admin ---------------------------- */

@Controller()
export class HealthController {
  constructor(private erp: Erp) {}
  /** Load balancer / portal "Test connection": API up, portal DB and X3 views reachable. */
  @Public() @Get('health')
  async health() {
    const db = await this.erp.db.k.raw('SELECT 1 AS ok').then(() => 'ok', (e) => `error: ${e.message}`);
    const x3 = await this.erp.x3.ping().then(() => 'ok', (e) => `error: ${e.message}`);
    return { status: db === 'ok' && x3 === 'ok' ? 'ok' : 'degraded', portalDb: db, x3, x3Mode: this.erp.gateway.mode, at: new Date().toISOString() };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private admin: AdminService) {}
  @Public() @Post('login') @HttpCode(200)
  login(@Body() b: { email: string; password: string }) { return this.admin.login(b?.email, b?.password); }
  @Get('me') me(@CtxParam() c: Ctx) { return this.admin.me(c); }
}

@Controller()
export class AdminController {
  constructor(private admin: AdminService, private requests: RequestsService, private sales: SalesService) {}

  @Get('sites') sites() { return this.sales.sites(); }

  @Get('access/role-modules') roleModules() { return this.admin.roleModules(); }
  @Put('access/role-modules') @Roles('ADMIN') @Access('access')
  saveRoleModules(@CtxParam() c: Ctx, @Body() b: Record<string, string[]>) { return this.admin.saveRoleModules(c, b); }

  @Get('settings/workflow') workflow() { return this.requests.workflow(); }
  @Put('settings/workflow') @Roles('ADMIN', 'SUPERVISOR') @Access('workflow')
  saveWorkflow(@CtxParam() c: Ctx, @Body() b: WorkflowSettings) { return this.requests.saveWorkflow(c, b); }

  @Get('users')
  users(@CtxParam() c: Ctx, @Query() q: Q) {
    // managers and reps may list the sales team; everything else is user administration
    if (q.role === 'SALES_REP' && (isManager(c) || isRep(c))) return this.admin.salesReps();
    if (!c.modules.has('users')) throw forbidden();
    return this.admin.users(q);
  }
  @Get('users/:id') @Access('users') user(@Param('id') id: string) { return this.admin.user(id); }
  @Patch('users/:id') @Access('users') setStatus(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { status: 'active' | 'pending' | 'inactive' }) { return this.admin.setStatus(c, id, b?.status); }
  @Put('users/:id/sites') @Roles('ADMIN') @Access('users')
  setSites(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { allowedSites: string[]; defaultSite: string }) { return this.admin.setSites(c, id, b?.allowedSites, b?.defaultSite); }
}

/* ---------------------------- catalogue, customers, orders ---------------------------- */

@Controller()
export class SalesController {
  constructor(private sales: SalesService) {}

  @Get('products') products(@CtxParam() c: Ctx, @Query() q: Q) { return this.sales.products(c, q); }
  @Get('products/:id') product(@CtxParam() c: Ctx, @Param('id') id: string) { return this.sales.product(c, id); }

  @Get('customers') customers(@CtxParam() c: Ctx, @Query() q: Q) { return this.sales.customers(c, q); }
  @Get('customers/:id') customer(@CtxParam() c: Ctx, @Param('id') id: string) { return this.sales.customer(c, id); }
  @Get('customers/:id/account') account(@CtxParam() c: Ctx, @Param('id') id: string) { return this.sales.account(c, id); }

  @Get('orders') orders(@CtxParam() c: Ctx, @Query() q: Q) { return this.sales.orders(c, q); }
  @Get('orders/:id') order(@CtxParam() c: Ctx, @Param('id') id: string) { return this.sales.order(c, id); }
  @Get('orders/:id/credit-check') credit(@CtxParam() c: Ctx, @Param('id') id: string) { return this.sales.creditCheck(c, id); }
  @Post('orders/:id/comments') @HttpCode(200) comment(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { text: string }) { return this.sales.comment(c, id, b?.text); }
  @Post('orders/:id/cancel') @HttpCode(200) @Access('orders') cancel(@CtxParam() c: Ctx, @Param('id') id: string) { return this.sales.cancel(c, id); }

  @Get('invoices') invoices(@CtxParam() c: Ctx, @Query() q: Q) { return this.sales.invoices(c, q.customerId); }
  @Get('invoices/:id') invoice(@CtxParam() c: Ctx, @Param('id') id: string) { return this.sales.invoice(c, id); }
}

/* ---------------------------- sales requests ---------------------------- */

@Controller('requests')
@Access('requests', 'approvals', 'cart', 'quick_order', 'new_order', 'quotes', 'consignment', 'orders')
export class RequestsController {
  constructor(private requests: RequestsService) {}
  @Get() list(@CtxParam() c: Ctx, @Query() q: Q) { return this.requests.list(c, q); }
  @Post() submit(@CtxParam() c: Ctx, @Body() b: SubmitInput) { return this.requests.submit(c, b ?? ({} as SubmitInput)); }
  @Post('sync') @HttpCode(200) sync(@CtxParam() c: Ctx) { return this.requests.syncDrafts(c); }
  @Get(':id') get(@CtxParam() c: Ctx, @Param('id') id: string) { return this.requests.find(c, id); }
  @Get(':id/conversion-preview') @Access('approvals', 'requests') preview(@CtxParam() c: Ctx, @Param('id') id: string) { return this.requests.preview(c, id); }
  @Post(':id/convert') @HttpCode(200) @Roles('ADMIN', 'SUPERVISOR') @Access('approvals', 'requests')
  convert(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: ConvertOptions) { return this.requests.convert(c, id, b ?? ({} as ConvertOptions)); }
  @Post(':id/request-changes') @HttpCode(200) @Roles('ADMIN', 'SUPERVISOR') @Access('approvals', 'requests')
  changes(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { comment: string }) { return this.requests.review(c, id, 'changes', b?.comment); }
  @Post(':id/reject') @HttpCode(200) @Roles('ADMIN', 'SUPERVISOR') @Access('approvals', 'requests')
  reject(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { comment: string }) { return this.requests.review(c, id, 'reject', b?.comment); }
  @Post(':id/cancel') @HttpCode(200) cancel(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { note?: string }) { return this.requests.cancel(c, id, b?.note); }
  @Post(':id/comments') @HttpCode(200) comment(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { text: string }) { return this.requests.comment(c, id, b?.text); }
}

/* ---------------------------- quotes, deliveries, payments ---------------------------- */

@Controller()
export class CommerceController {
  constructor(private s: CommerceService) {}

  @Get('quotes') @Access('quotes', 'customers', 'assistant') quotes(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.quotes(c, q); }
  @Post('quotes') @Access('quotes') createQuote(@CtxParam() c: Ctx, @Body() b: Parameters<CommerceService['createQuote']>[1]) { return this.s.createQuote(c, b ?? ({} as never)); }
  @Get('quotes/:id') @Access('quotes', 'customers', 'requests') quote(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.quote(c, id); }
  @Put('quotes/:id') @Access('quotes') saveQuote(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: Parameters<CommerceService['saveQuote']>[2]) { return this.s.saveQuote(c, id, b ?? ({} as never)); }
  @Post('quotes/:id/send') @HttpCode(200) @Access('quotes') send(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.sendQuote(c, id); }
  @Post('quotes/:id/accept') @HttpCode(200) @Access('quotes') accept(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { poNumber?: string }) { return this.s.acceptQuote(c, id, b?.poNumber); }
  @Post('quotes/:id/decline') @HttpCode(200) @Access('quotes') decline(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { reason: string }) { return this.s.declineQuote(c, id, b?.reason); }
  @Post('quotes/:id/revision') @HttpCode(200) @Access('quotes') revise(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { comment: string }) { return this.s.reviseQuote(c, id, b?.comment); }
  @Post('quotes/:id/cancel') @HttpCode(200) @Access('quotes') cancelQuote(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.cancelQuote(c, id); }
  @Post('quotes/:id/comments') @HttpCode(200) @Access('quotes') commentQuote(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { text: string }) { return this.s.commentQuote(c, id, b?.text); }

  @Get('deliveries') @Access('deliveries', 'orders', 'customers', 'assistant') deliveries(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.deliveries(c, q); }
  @Get('deliveries/:id') deliveryOne(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.delivery(c, id); }
  @Post('deliveries/:id/out-for-delivery') @HttpCode(200) @Access('deliveries') ofd(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { driver?: string; vehicle?: string }) { return this.s.outForDelivery(c, id, b?.driver, b?.vehicle); }
  @Post('deliveries/:id/pod') @HttpCode(200) @Access('deliveries', 'orders') pod(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: Parameters<CommerceService['pod']>[2]) { return this.s.pod(c, id, b ?? ({} as never)); }
  @Post('deliveries/:id/fail') @HttpCode(200) @Access('deliveries') fail(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { reason: string }) { return this.s.failDelivery(c, id, b?.reason); }
  @Post('deliveries/:id/reschedule') @HttpCode(200) @Access('deliveries') reschedule(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { date: string }) { return this.s.rescheduleDelivery(c, id, b?.date); }

  @Get('payments') payments(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.payments(c, q); }
  @Get('payments/:id') payment(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.payment(c, id); }
  @Post('payments/online') @Access('account', 'invoices') online(@CtxParam() c: Ctx, @Body() b: Parameters<CommerceService['payOnline']>[1]) { return this.s.payOnline(c, b ?? ({} as never)); }
  @Post('payments') @Access('account', 'invoices', 'collections') record(@CtxParam() c: Ctx, @Body() b: Parameters<CommerceService['record']>[1]) { return this.s.record(c, b ?? ({} as never)); }
  @Post('payments/:id/verify') @HttpCode(200) @Access('collections') verify(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.verify(c, id); }
  @Post('payments/:id/reject') @HttpCode(200) @Access('collections') rejectPay(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { reason: string }) { return this.s.rejectPayment(c, id, b?.reason); }

  @Get('collections/aging') @Access('collections', 'customers', 'dashboard') aging(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.aging(c, q); }
  @Get('collections/:customerId/notes') @Access('collections', 'customers') notes(@CtxParam() c: Ctx, @Param('customerId') id: string) { return this.s.notes(c, id); }
  @Post('collections/:customerId/notes') @Access('collections', 'customers') addNote(@CtxParam() c: Ctx, @Param('customerId') id: string, @Body() b: Parameters<CommerceService['addNote']>[2]) { return this.s.addNote(c, id, b ?? ({} as never)); }
  @Post('collections/:customerId/reminders') @Access('collections', 'customers') remind(@CtxParam() c: Ctx, @Param('customerId') id: string) { return this.s.remind(c, id); }
}

/* ---------------------------- inventory ---------------------------- */

@Controller()
export class InventoryController {
  constructor(private s: InventoryService) {}

  @Get('inventory') @Access('inventory') positions(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.positions(c, q); }
  @Get('inventory/availability') @Access('inventory', 'transfers') availability(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.availability(c, (q.sites ?? '').split(',').filter(Boolean)); }
  @Get('inventory/:productId') @Access('inventory') detail(@CtxParam() c: Ctx, @Param('productId') id: string) { return this.s.detailOf(c, id); }
  @Get('inventory/:productId/movements') @Access('inventory') movements(@CtxParam() c: Ctx, @Param('productId') id: string) { return this.s.movements(c, id); }
  @Get('inventory/:productId/available') @Access('inventory', 'transfers') available(@CtxParam() c: Ctx, @Param('productId') id: string, @Query() q: Q) { return this.s.availableAt(c, id, q.site ?? c.site); }

  @Get('consignments') @Access('consignment') consignments(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.consignments(c, q); }
  @Get('consignments/:id') @Access('consignment', 'inventory') consignment(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.consignment(c, id); }
  @Post('consignments/:id/call-offs') @Access('consignment') callOff(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: Parameters<InventoryService['callOff']>[2]) { return this.s.callOff(c, id, b ?? ({} as never)); }
  @Post('consignments/:id/top-ups') @Access('consignment') topUp(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { items: unknown }) { return this.s.topUp(c, id, b?.items); }

  @Get('transfers') @Access('transfers', 'inventory') transfers(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.transfers(c, q); }
  @Post('transfers') @Access('transfers') create(@CtxParam() c: Ctx, @Body() b: Parameters<InventoryService['createTransfer']>[1]) { return this.s.createTransfer(c, b ?? ({} as never)); }
  @Get('transfers/:id') @Access('transfers', 'inventory') transfer(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.getTransfer(c, id); }
  @Post('transfers/:id/approve') @HttpCode(200) @Access('transfers') approve(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.approveTransfer(c, id); }
  @Post('transfers/:id/reject') @HttpCode(200) @Access('transfers') reject(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { comment: string }) { return this.s.rejectTransfer(c, id, b?.comment); }
  @Post('transfers/:id/initiate') @HttpCode(200) @Access('transfers') initiate(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.initiateTransfer(c, id); }
  @Post('transfers/:id/receive') @HttpCode(200) @Access('transfers') receive(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { lines: unknown }) { return this.s.receiveTransfer(c, id, b?.lines); }
  @Post('transfers/:id/complete') @HttpCode(200) @Access('transfers') complete(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.completeTransfer(c, id); }
  @Post('transfers/:id/cancel') @HttpCode(200) @Access('transfers') cancel(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.cancelTransfer(c, id); }
  @Post('transfers/:id/comments') @HttpCode(200) @Access('transfers') comment(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { text: string }) { return this.s.commentTransfer(c, id, b?.text); }
}

/* ---------------------------- purchasing ---------------------------- */

@Controller()
@Access('purchase_requests', 'purchase_orders', 'suppliers', 'supplier_catalog', 'inventory')
export class PurchasingController {
  constructor(private s: PurchasingService) {}

  @Get('suppliers') suppliers(@CtxParam() c: Ctx) { return this.s.suppliers(c); }
  @Get('suppliers/:id') supplier(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.supplier(c, id); }
  @Get('suppliers/:id/catalog') catalog(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.catalog(c, id); }
  @Get('suppliers/:id/summary') summary(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.summary(c, id); }
  @Get('suppliers/:id/reorder-suggestions') suggestions(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.reorderSuggestions(c, id); }

  @Get('purchase-requests') requests(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.requests(c, q); }
  @Post('purchase-requests') createRequest(@CtxParam() c: Ctx, @Body() b: Parameters<PurchasingService['createRequest']>[1]) { return this.s.createRequest(c, b ?? ({} as never)); }
  @Get('purchase-requests/:id') request(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.request(c, id); }
  @Post('purchase-requests/:id/convert') @HttpCode(200) convert(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { expectedDate: string }) { return this.s.convert(c, id, b?.expectedDate); }
  @Post('purchase-requests/:id/request-changes') @HttpCode(200) changes(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { comment: string }) { return this.s.review(c, id, 'changes', b?.comment); }
  @Post('purchase-requests/:id/reject') @HttpCode(200) reject(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { comment: string }) { return this.s.review(c, id, 'reject', b?.comment); }
  @Post('purchase-requests/:id/review') @HttpCode(200) review(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { decision: 'changes' | 'reject'; comment: string }) { return this.s.review(c, id, b?.decision === 'reject' ? 'reject' : 'changes', b?.comment); }
  @Post('purchase-requests/:id/cancel') @HttpCode(200) cancelRequest(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.cancelRequest(c, id); }
  @Post('purchase-requests/:id/comments') @HttpCode(200) commentRequest(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { text: string }) { return this.s.commentRequest(c, id, b?.text); }

  @Get('purchase-orders') orders(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.orders(c, q); }
  @Get('purchase-orders/:id') order(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.order(c, id); }
  @Post('purchase-orders/:id/acknowledge') @HttpCode(200) ack(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.acknowledge(c, id); }
  @Post('purchase-orders/:id/pickup') @HttpCode(200) pickup(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: Parameters<PurchasingService['pickup']>[2]) { return this.s.pickup(c, id, b ?? ({} as never)); }
  @Post('purchase-orders/:id/dispatch') @HttpCode(200) dispatch(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.dispatch(c, id); }
  @Post('purchase-orders/:id/receipts') @HttpCode(200) receive(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { lines: unknown }) { return this.s.receive(c, id, b?.lines); }
  @Post('purchase-orders/:id/cancel') @HttpCode(200) cancel(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { reason: string }) { return this.s.cancel(c, id, b?.reason); }
}

/* ---------------------------- content and communication ---------------------------- */

@Controller()
export class EngageController {
  constructor(private s: EngageService) {}

  @Get('announcements') announcements(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.announcements(c, q.manage === 'true'); }
  @Get('announcements/:id') announcement(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.announcement(c, id); }
  @Post('announcements') @Access('announcements') create(@CtxParam() c: Ctx, @Body() b: Partial<Announcement>) { return this.s.saveAnnouncement(c, b); }
  @Patch('announcements/:id') @Access('announcements') update(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: Partial<Announcement>) { return this.s.saveAnnouncement(c, b, id); }
  @Delete('announcements/:id') @Access('announcements') remove(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.deleteAnnouncement(c, id); }

  @Get('offers') offers(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.offers(c, q); }
  /** Plain strings go out as JSON strings (the portal parses every response as JSON). */
  @Get('offers/sync-status') @Header('Content-Type', 'application/json') async syncStatus() { return JSON.stringify(await this.s.syncStatus()); }
  @Post('offers/sync') @HttpCode(200) @Access('offers') @Header('Content-Type', 'application/json') async sync(@CtxParam() c: Ctx) { return JSON.stringify(await this.s.sync(c)); }
  @Get('offers/:id') offer(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.offer(c, id); }
  @Put('offers/:id/presentation') @Access('offers') presentation(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: OfferPresentation) { return this.s.savePresentation(c, id, b); }

  @Get('conversations') @Access('messages') conversations(@CtxParam() c: Ctx) { return this.s.conversations(c); }
  @Post('conversations') @Access('messages') createConversation(@CtxParam() c: Ctx, @Body() b: { subject: string; body: string }) { return this.s.createConversation(c, b?.subject, b?.body); }
  @Post('conversations/:id/messages') @Access('messages') send(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { body: string }) { return this.s.send(c, id, b?.body); }
  @Post('conversations/:id/read') @HttpCode(200) @Access('messages') read(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.markRead(c, id); }

  @Get('notifications') notifications(@CtxParam() c: Ctx) { return this.s.notifications(c); }
  @Post('notifications/read-all') @HttpCode(200) readAll(@CtxParam() c: Ctx) { return this.s.readAll(c); }
  @Patch('notifications/:id') readOne(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.readNotification(c, id); }
}

/* ---------------------------- sales team and dashboards ---------------------------- */

@Controller()
export class TeamController {
  constructor(private s: TeamService) {}

  @Get('sales-reps/performance') @Access('team', 'performance', 'dashboard') team(@CtxParam() c: Ctx) { return this.s.team(c); }
  @Get('sales-reps/:id/performance') @Access('team', 'performance', 'dashboard') perf(@CtxParam() c: Ctx, @Param('id') id: string) { return this.s.performance(c, id); }
  @Get('follow-ups') @Access('follow_ups', 'customers', 'dashboard') followUps(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.followUps(c, q.repId); }
  @Post('follow-ups') @Access('follow_ups', 'customers') createFollowUp(@CtxParam() c: Ctx, @Body() b: Partial<FollowUp>) { return this.s.saveFollowUp(c, b); }
  @Patch('follow-ups/:id') @Access('follow_ups', 'customers') updateFollowUp(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: Partial<FollowUp>) { return this.s.saveFollowUp(c, b, id); }
  @Get('visits') @Access('follow_ups', 'dashboard', 'customers') visits(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.visits(c, q.repId); }
  @Patch('visits/:id') @Access('follow_ups', 'dashboard', 'customers') visit(@CtxParam() c: Ctx, @Param('id') id: string, @Body() b: { status: 'planned' | 'checked_in' | 'completed' }) { return this.s.setVisitStatus(c, id, b?.status); }
  @Get('visit-reports') @Access('follow_ups', 'customers', 'dashboard') reports(@CtxParam() c: Ctx, @Query() q: Q) { return this.s.visitReports(c, q); }
  @Post('visit-reports') @Access('follow_ups', 'customers', 'dashboard') report(@CtxParam() c: Ctx, @Body() b: Parameters<TeamService['saveVisitReport']>[1]) { return this.s.saveVisitReport(c, b ?? ({} as never)); }

  @Get('dashboard/admin') admin(@CtxParam() c: Ctx) { return this.s.admin(c); }
  @Get('dashboard/manager') manager(@CtxParam() c: Ctx) { return this.s.manager(c); }
  @Get('dashboard/customer/:customerId') customer(@CtxParam() c: Ctx, @Param('customerId') id: string) { return this.s.customer(c, id); }
}

export const CONTROLLERS = [HealthController, AuthController, AdminController, SalesController, RequestsController, CommerceController, InventoryController, PurchasingController, EngageController, TeamController];
