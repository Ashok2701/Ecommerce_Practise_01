#!/usr/bin/env node
/**
 * Translation checker.  Run:  npm run i18n:check   (add --strict to fail on missing translations)
 *
 * Reports:
 *  - keys used in code (t('...')) that don't exist in English          -> error
 *  - keys missing in a language (they fall back to English)            -> warning (error with --strict)
 *  - keys in a language that English doesn't have (stale or typo)      -> warning
 *  - placeholders that differ from English, e.g. {name} vs {nom}       -> error
 *  - override files with keys that don't exist (client typos)          -> warning
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASE_DIR = join(ROOT, 'lib/i18n/locales');
const CUSTOM_DIR = join(ROOT, 'client-config/i18n');
const OVERRIDE_DIR = join(ROOT, 'client-config/i18n/overrides');
const strict = process.argv.includes('--strict');
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const isPlural = (v) => v && typeof v === 'object' && Object.keys(v).length && Object.keys(v).every((k) => PLURAL.has(k));

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' || isPlural(v)) out[key] = v;
    else if (v && typeof v === 'object') flatten(v, key, out);
  }
  return out;
}
const placeholders = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort().join(',');
const jsonFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : []);

let errors = 0, warnings = 0;
const err = (m) => { errors++; console.log(`  ✗ ${m}`); };
const warn = (m) => { warnings++; console.log(`  ! ${m}`); };

const en = flatten(read(join(BASE_DIR, 'en.json')));
const langs = [
  ...jsonFiles(BASE_DIR).map((f) => ({ code: f.replace('.json', ''), file: join(BASE_DIR, f) })),
  ...jsonFiles(CUSTOM_DIR).map((f) => ({ code: f.replace('.json', ''), file: join(CUSTOM_DIR, f) })),
];

console.log(`English: ${Object.keys(en).length} keys\n`);

for (const { code, file } of langs) {
  if (code === 'en') continue;
  const d = flatten(read(file));
  const missing = Object.keys(en).filter((k) => !(k in d));
  const extra = Object.keys(d).filter((k) => !(k in en));
  const done = Object.keys(en).length - missing.length;
  console.log(`${code}  ${relative(ROOT, file)}  ${done}/${Object.keys(en).length} translated`);
  missing.forEach((k) => (strict ? err : warn)(`missing ${k}`));
  extra.forEach((k) => warn(`not in English (stale or typo) ${k}`));
  for (const k of Object.keys(d)) if (k in en && placeholders(d[k]) !== placeholders(en[k])) err(`placeholders differ in ${k}: ${placeholders(d[k])} vs English ${placeholders(en[k])}`);
}

console.log('\nOverrides (client-config/i18n/overrides)');
for (const f of jsonFiles(OVERRIDE_DIR)) {
  const d = flatten(read(join(OVERRIDE_DIR, f)));
  const n = Object.keys(d).length;
  console.log(`  ${f}: ${n} override${n === 1 ? '' : 's'}`);
  for (const k of Object.keys(d)) {
    if (!(k in en)) warn(`${f}: unknown key ${k}`);
    else if (placeholders(d[k]) !== placeholders(en[k])) err(`${f}: placeholders differ in ${k}`);
  }
}

console.log('\nKeys used in code');
const used = new Set();
function scan(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (['node_modules', '.next', '.git'].includes(f)) continue;
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.(tsx?|jsx?)$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z][\w.]+)'/g)) used.add(`${m[1]}\t${relative(ROOT, p)}`);
  }
}
['app', 'components', 'features', 'lib'].forEach((d) => existsSync(join(ROOT, d)) && scan(join(ROOT, d)));
const seen = new Set();
for (const u of used) {
  const [key, file] = u.split('\t');
  if (!(key in en) && !seen.has(key)) { seen.add(key); err(`${key} used in ${file} but not in en.json`); }
}
console.log(`  ${new Set([...used].map((u) => u.split('\t')[0])).size} distinct literal keys checked`);

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
