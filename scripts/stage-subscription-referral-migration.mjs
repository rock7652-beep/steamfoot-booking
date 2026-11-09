import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function stageSubscriptionReferralMigration(repositoryRoot = root, temporaryParent = tmpdir()) {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot,
    'scripts/sql/subscription-referral-release-review/manifest.json'), 'utf8'));
  if (manifest.sqlFile !== 'docs/marketing/subscription-referral-schema.sql'
    || !/^\d{14}_subscription_referral_private_core$/.test(manifest.migrationName)) {
    throw new Error('Unexpected referral migration manifest');
  }
  const sql = readFileSync(join(repositoryRoot, manifest.sqlFile));
  const checksum = createHash('sha256').update(sql).digest('hex');
  if (checksum !== manifest.sha256) throw new Error('Referral migration checksum mismatch');
  const directory = mkdtempSync(join(temporaryParent, 'subscription-referral-migration-'));
  const migration = join(directory, 'migrations', manifest.migrationName);
  mkdirSync(migration, { recursive: true });
  writeFileSync(join(migration, 'migration.sql'), sql);
  writeFileSync(join(directory, 'migrations/migration_lock.toml'), 'provider = "postgresql"\n');
  writeFileSync(join(directory, 'schema.prisma'),
    'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}\n');
  return { directory, migrationName: manifest.migrationName, checksum,
    schema: join(directory, 'schema.prisma'), databaseWorkPerformed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).join(' ') !== '--stage') {
    console.error('Usage: node scripts/stage-subscription-referral-migration.mjs --stage (files only; no database connection)');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(stageSubscriptionReferralMigration(), null, 2)); }
    catch { console.error('Referral staging rejected; no database connection attempted.'); process.exitCode = 1; }
  }
}
