import { readFileSync } from "node:fs";

// Only these additive audit migrations are permitted in this branch's isolated Preview.
export function buildAuditPreviewMigrationSql() {
  const names = ["20261007001000_staff_login_audit", "20261007002000_verified_audit_actor"];
  const sql = names.map(name => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8")
    .replace(/ADD COLUMN /g, "ADD COLUMN IF NOT EXISTS ")
    .replace(/CREATE TABLE /g, "CREATE TABLE IF NOT EXISTS ")
    .replace(/CREATE INDEX /g, "CREATE INDEX IF NOT EXISTS ")
    .replace(/CREATE FUNCTION /g, "CREATE OR REPLACE FUNCTION ")
    .replace(/CREATE TRIGGER (\w+) BEFORE INSERT ON (public\."\w+")/g,
      (_, trigger, table) => `DROP TRIGGER IF EXISTS ${trigger} ON ${table};\nCREATE TRIGGER ${trigger} BEFORE INSERT ON ${table}`))
    .join("\n");
  return `BEGIN;\nSELECT pg_advisory_xact_lock(hashtextextended('hq-login-operation-audit-preview-migration', 0));\n${sql}\nCOMMIT;`;
}
