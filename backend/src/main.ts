import './alias';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadConfig, type AppConfig } from './config';
import { AppModule, createInfra } from './app.module';

/** Builds the Nest application (also used by the end-to-end tests). */
export async function buildApp(cfg: AppConfig = loadConfig()) {
  const infra = await createInfra(cfg);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(cfg, infra), { logger: ['error', 'warn', 'log'] });
  app.enableCors({ origin: cfg.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization', 'X-Site', 'Accept-Language'], methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  // proof-of-delivery photos and signatures arrive as data URLs
  app.useBodyParser('json', { limit: '12mb' });
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  return { app, infra };
}

async function main() {
  const cfg = loadConfig();
  if (cfg.jwtSecret === 'dev-only-secret-change-me' && cfg.x3.mode === 'live') throw new Error('Set JWT_SECRET before running against a live X3.');
  const { app } = await buildApp(cfg);
  await app.listen(cfg.port);
  new Logger('API').log(`Nexus API on :${cfg.port} (portal DB: ${cfg.portalDb.client}, X3: ${cfg.x3.mode})`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
