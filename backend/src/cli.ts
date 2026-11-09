import './alias';
import { loadConfig } from './config';
import { createKnex } from './db/knex';
import { migrate } from './db/migrations';
import { X3Reader } from './x3/x3-reader';
import { createInfra } from './app.module';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ROLES, type Role } from '@/types/domain';

/**
 * npm run db:migrate   create / upgrade the portal database schema
 * npm run x3:views     install the NX_* read views in the X3 database (needs a login allowed to create views)
 * npm run db:seed      load the demo data (simulation / development only)
 */
async function run() {
  const cmd = process.argv[2];
  const cfg = loadConfig();
  if (cmd === 'migrate') {
    const k = createKnex(cfg.portalDb);
    const applied = await migrate(k);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Portal database is up to date');
    await k.destroy();
  } else if (cmd === 'views') {
    const k = createKnex(cfg.x3.db);
    const n = await X3Reader.installViews(k, cfg.x3.folderSchema, cfg.x3.viewSchema);
    console.log(`Installed ${n} statements in ${cfg.x3.viewSchema || '(default schema)'} over ${cfg.x3.folderSchema || '(default schema)'}`);
    await k.destroy();
  } else if (cmd === 'seed') {
    const infra = await createInfra({ ...cfg, seedDemo: true });
    console.log('Done');
    await infra.portal.destroy(); await infra.x3.destroy();
  } else if (cmd === 'user') {
    // node dist/backend/src/cli.js user --email a@b.com --name "A B" --role ADMIN --password '...' --sites MAIN,MUM-WH
    //   [--customer BPCNUM] [--supplier BPSNUM] [--erp-code REPNUM] [--title "..."]
    const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
    const email = arg('email')?.toLowerCase(), name = arg('name'), role = arg('role') as Role, password = arg('password');
    const sites = (arg('sites') ?? '').split(',').filter(Boolean);
    if (!email || !name || !ROLES.includes(role) || !password || password.length < 10 || !sites.length) {
      console.log('Needs --email --name --role (' + ROLES.join('|') + ') --password (10+ characters) --sites A,B'); process.exit(1);
    }
    const k = createKnex(cfg.portalDb);
    await migrate(k);
    const row = {
      email, name, role, password_hash: await bcrypt.hash(password, 10), status: 'active', title: arg('title') ?? '', phone: '',
      customer_id: arg('customer') ?? null, supplier_id: arg('supplier') ?? null, erp_code: arg('erp-code') ?? arg('customer') ?? arg('supplier') ?? null,
      allowed_sites: JSON.stringify(sites), default_site: sites[0], failed_logins: 0,
    };
    const existing = await k('users').where({ email }).first();
    if (existing) await k('users').where({ id: existing.id }).update(row);
    else await k('users').insert({ id: `usr_${randomBytes(5).toString('hex')}`, created_at: new Date().toISOString(), ...row });
    console.log(`${existing ? 'Updated' : 'Created'} ${role} ${email}`);
    await k.destroy();
  } else {
    console.log('Usage: node dist/backend/src/cli.js migrate | views | seed | user');
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
