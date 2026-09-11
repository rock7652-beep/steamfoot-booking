import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// This release path intentionally cannot target Production.
const TEST_REF = "ttworfzgwejdeolegkxl";
function projectRef(value) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return null;
    const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    const pooler = url.hostname.endsWith('.pooler.supabase.com')
      ? url.username.match(/^postgres\.([a-z0-9]+)$/)?.[1] : null;
    return direct || pooler || null;
  } catch { return null; }
}

const mode = process.argv[2];
if (!['--rehearse', '--apply-preview'].includes(mode)) {
  console.error('Usage: node --env-file=.env.spa-preview scripts/spa-release.mjs --rehearse|--apply-preview');
  process.exit(1);
}
if ([process.env.DATABASE_URL, process.env.DIRECT_URL].some(url => projectRef(url) !== TEST_REF)
  || process.env.VERCEL_ENV === 'production') {
  console.error('SPA release refused: both connections must identify the allowlisted test project.');
  process.exit(1);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const schema = readFileSync(new URL('../prisma/reconciliation/spa-release-schema.sql', import.meta.url), 'utf8');
const fingerprint = readFileSync(new URL('../prisma/reconciliation/spa-release-fingerprint.sql', import.meta.url), 'utf8');
const rehearsal = mode === '--rehearse';
const prefix = rehearsal ? `
CREATE SCHEMA spa_release_rehearsal;
SET LOCAL search_path = spa_release_rehearsal, public;
CREATE TYPE "IndustryModule" AS ENUM ('STEAMFOOT', 'SPA');
CREATE TABLE "Store" (id TEXT PRIMARY KEY, "industryModule" "IndustryModule" NOT NULL DEFAULT 'STEAMFOOT');
CREATE TABLE "Customer" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, UNIQUE(id,"storeId"));
CREATE TABLE "Staff" (id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, UNIQUE(id,"storeId"));
` : 'SET LOCAL search_path = public;';
const sql = `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT pg_advisory_xact_lock(hashtext('spa-release-schema'));
${prefix}
${schema}
${rehearsal ? schema : ''}
${fingerprint}
${rehearsal ? 'ROLLBACK' : 'COMMIT'};`;
// Credentials stay in the child environment, never command arguments or output.
const result = spawnSync(process.execPath, [root + 'node_modules/prisma/build/index.js',
  'db', 'execute', '--schema', 'spa-prisma/schema.prisma', '--stdin'], {
  cwd: root, input: sql, encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: process.env.DIRECT_URL },
  maxBuffer: 1024 * 1024,
});
if (result.status !== 0) {
  console.error('SPA release failed; transaction was not committed. Inspect with an authorized database session; raw output is withheld to protect credentials.');
  process.exit(1);
}
console.log(rehearsal ? 'SPA empty-schema replay passed twice; rolled back.' : 'SPA test-project additive schema committed.');
