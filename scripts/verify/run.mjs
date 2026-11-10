#!/usr/bin/env node
// Runs scripts/verify/assertions.sql (each "-- check:" block must return no rows) and rls_tests.sql
// (role/RLS tests inside a transaction that is always rolled back) against the database.
//
//   node scripts/verify/run.mjs [--no-rls] [--skip-data] [--only <text>] [--url <postgres url>]
//
// Connection: DATABASE_URL (env or .env.local), else supabase/.temp/pooler-url + SUPABASE_DB_PASSWORD.
// Never prints the connection string or password.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...loadEnvFile(path.join(root, '.env.local')), ...process.env };

function connectionUrl() {
  const given = opt('--url') || env.DATABASE_URL;
  if (given) return given;
  const pw = env.SUPABASE_DB_PASSWORD;
  const poolerFile = path.join(root, 'supabase', '.temp', 'pooler-url');
  if (pw && fs.existsSync(poolerFile)) {
    const u = new URL(fs.readFileSync(poolerFile, 'utf8').trim());
    u.password = pw;
    return u.toString();
  }
  return undefined;
}

async function loadPostgres() {
  const tries = [
    () => import('postgres'),
    () => import(pathToFileURL(createRequire(path.join(root, 'scripts', 'seed', 'package.json')).resolve('postgres')).href),
  ];
  for (const t of tries) {
    try { return (await t()).default; } catch { /* try next */ }
  }
  throw new Error('The "postgres" package is not installed. Run npm install in the repo root or scripts/seed.');
}

const url = connectionUrl();
if (!url) {
  console.error('No database URL. Set DATABASE_URL in .env.local (or link the project so supabase/.temp/pooler-url exists).');
  process.exit(2);
}
const postgres = await loadPostgres();
const sql = postgres(url, { max: 1, onnotice: () => {}, idle_timeout: 5, connect_timeout: 30, connection: { statement_timeout: 0 } });

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
let failures = 0;
let passes = 0;

// ---- assertions
const text = fs.readFileSync(path.join(here, 'assertions.sql'), 'utf8');
const blocks = text.split(/^-- check:\s*/m).slice(1).map((b) => {
  const nl = b.indexOf('\n');
  return { title: b.slice(0, nl).trim(), body: b.slice(nl + 1).trim() };
});
const only = opt('--only');
for (const b of blocks) {
  const needsData = b.title.includes('[needs-data]');
  const title = b.title.replace('[needs-data]', '').trim();
  if (only && !title.toLowerCase().includes(only.toLowerCase())) continue;
  if (needsData && flag('--skip-data')) { console.log(dim(`SKIP  ${title}`)); continue; }
  try {
    const rows = await sql.unsafe(b.body);
    if (rows.length === 0) { passes++; console.log(`${green('PASS')}  ${title}`); }
    else {
      failures++;
      console.log(`${red('FAIL')}  ${title}  (${rows.length} row${rows.length === 1 ? '' : 's'})`);
      for (const r of rows.slice(0, 5)) console.log('      ' + JSON.stringify(r));
      if (rows.length > 5) console.log(`      ... ${rows.length - 5} more`);
    }
  } catch (e) {
    failures++;
    console.log(`${red('FAIL')}  ${title}  (query error: ${e.message})`);
  }
}

// ---- RLS / RPC permission tests
if (!flag('--no-rls') && !only) {
  const rlsSql = fs.readFileSync(path.join(here, 'rls_tests.sql'), 'utf8');
  class Rollback extends Error {}
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(rlsSql);
      const rows = await tx.unsafe('select label, ok, detail from _rls_results');
      for (const r of rows) {
        if (r.ok) { passes++; console.log(`${green('PASS')}  rls: ${r.label}`); }
        else { failures++; console.log(`${red('FAIL')}  rls: ${r.label}${r.detail ? '  -> ' + r.detail : ''}`); }
      }
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) {
      failures++;
      console.log(`${red('FAIL')}  rls tests crashed: ${e.message}`);
    }
  }
}

await sql.end({ timeout: 5 });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
