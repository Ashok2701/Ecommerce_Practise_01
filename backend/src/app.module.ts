import { DynamicModule, Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { Knex } from 'knex';
import { APP_CONFIG, type AppConfig } from './config';
import { createKnex, isSqlite } from './db/knex';
import { migrate } from './db/migrations';
import { PortalDb } from './db/portal-db';
import { X3Reader } from './x3/x3-reader';
import { withCallLog, X3_GATEWAY, type X3Gateway } from './x3/gateway';
import { SoapGateway } from './x3/soap-gateway';
import { SimGateway } from './x3/sim/sim-gateway';
import { createSimTables } from './x3/sim/schema';
import { AccessGuard, RoleModulesCache } from './common/ctx';
import { ErrorFilter } from './common/errors';
import { Erp } from './services/erp';
import { AdminService } from './services/admin.service';
import { SalesService } from './services/sales.service';
import { RequestsService } from './services/requests.service';
import { CommerceService } from './services/commerce.service';
import { InventoryService } from './services/inventory.service';
import { PurchasingService } from './services/purchasing.service';
import { EngageService } from './services/engage.service';
import { TeamService } from './services/team.service';
import { CONTROLLERS } from './controllers';
import { SimController } from './sim.controller';
import { demoData, seedPortal, seedSimX3 } from './seed/demo-seed';

export interface Infra { portal: Knex; x3: Knex; reader: X3Reader; gateway: X3Gateway; sim?: SimGateway }

/** Connects both databases, migrates the portal schema and, in simulation mode, prepares the simulated X3 folder. */
export async function createInfra(cfg: AppConfig): Promise<Infra> {
  const log = new Logger('Startup');
  const portal = createKnex(cfg.portalDb);
  const applied = await migrate(portal);
  if (applied.length) log.log(`Portal database migrated: ${applied.join(', ')}`);

  const x3 = createKnex(cfg.x3.db, { readOnly: cfg.x3.mode === 'live' });
  let sim: SimGateway | undefined;
  if (cfg.x3.mode === 'sim') {
    if (!isSqlite(x3) && !process.env.X3_SIM_ALLOW_MSSQL) throw new Error('X3_MODE=sim only runs on SQLite (it creates tables). Use X3_MODE=live against a real X3 database.');
    if (!(await x3.schema.hasTable('ITMMASTER'))) await createSimTables(x3);
    await X3Reader.installViews(x3, cfg.x3.folderSchema, cfg.x3.viewSchema);
    sim = new SimGateway(x3);
  }
  const reader = new X3Reader(x3, cfg.x3.viewSchema, cfg.x3.mode === 'sim' ? 0 : 60_000);
  const inner: X3Gateway = sim ?? new SoapGateway(cfg.x3.ws);
  const gateway = withCallLog(inner, portal, () => reader.invalidate());

  if (cfg.seedDemo && !(await portal('users').first())) {
    if (cfg.x3.mode !== 'sim') log.warn('SEED_DEMO only seeds the portal database in live mode; ERP data comes from X3.');
    const data = demoData();
    if (cfg.x3.mode === 'sim' && !(await x3('ITMMASTER').first())) await seedSimX3(x3, data);
    await seedPortal(portal, data);
    await new Erp(new PortalDb(portal), reader, gateway).syncOffers();
    log.log('Demo data loaded (password for every demo user: demo123)');
  }
  return { portal, x3, reader, gateway, sim };
}

@Module({})
export class AppModule {
  static forRoot(cfg: AppConfig, infra: Infra): DynamicModule {
    return {
      module: AppModule,
      controllers: [...CONTROLLERS, ...(infra.sim ? [SimController] : [])],
      providers: [
        { provide: APP_CONFIG, useValue: cfg },
        { provide: PortalDb, useValue: new PortalDb(infra.portal) },
        { provide: X3Reader, useValue: infra.reader },
        { provide: X3_GATEWAY, useValue: infra.gateway },
        { provide: SimGateway, useValue: infra.sim ?? null },
        RoleModulesCache, Erp, AdminService, SalesService, RequestsService, CommerceService, InventoryService, PurchasingService, EngageService, TeamService,
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
      ],
    };
  }
}
