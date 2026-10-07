import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ failAcknowledgement: false }));
vi.mock("@/lib/db", () => ({ prisma: {
  operationAuditOutbox: {
    findMany: async () => (await db.query<Record<string, unknown>>('SELECT * FROM "OperationAuditOutbox" WHERE "deliveredAt" IS NULL AND "nextAttemptAt" <= NOW() ORDER BY "createdAt", id LIMIT 50')).rows,
    updateMany: async ({ where, data }: { where: { id: string }; data: { nextAttemptAt: Date } }) => db.query<Record<string, unknown>>('UPDATE "OperationAuditOutbox" SET attempts=attempts+1, "nextAttemptAt"=$2 WHERE id=$1 AND "deliveredAt" IS NULL', [where.id, data.nextAttemptAt.toISOString()]),
  },
  $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
    await db.exec("BEGIN");
    try {
      const result = await work({
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql=strings.reduce((all, part, index) => all + (index ? `$${index}` : "") + part, "");
          return (await db.query<Record<string, unknown>>(sql, values.map(value => value instanceof Date ? value.toISOString() : value))).affectedRows;
        },
        auditLog: { createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
          const row=data[0];
          await db.query<Record<string, unknown>>('INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","actorRoleSnapshot","loginRecordId",source,"storeId",module,"targetType","targetId",action,summary,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING',
            [row.id,row.actorUserId,row.actorNameSnapshot,row.actorRoleSnapshot,row.loginRecordId,row.source,row.storeId,row.module,row.targetType,row.targetId,row.action,row.summary,(row.createdAt as Date).toISOString()]);
        } },
        operationAuditOutbox: { update: async ({ where }: { where: { id: string } }) => {
          if (state.failAcknowledgement) throw new Error("simulated acknowledgement failure");
          await db.query<Record<string, unknown>>('UPDATE "OperationAuditOutbox" SET "deliveredAt"=NOW() WHERE id=$1', [where.id]);
        } },
      });
      await db.exec("COMMIT"); return result;
    } catch (error) { await db.exec("ROLLBACK"); throw error; }
  },
} }));
import { maintainAuditRetention } from "@/server/services/audit-retention";
import { deliverOperationAudits } from "@/server/services/operation-audit-outbox";
// Match Prisma: timestamp-without-time-zone values represent UTC instants.
const db = new PGlite({ parsers: { 1114: value => new Date(value.replace(" ", "T") + "Z") } });
const migration = (name: string) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
const insert = (id: string, actor = "u1", action = "UPDATE") => db.query<Record<string, unknown>>(
  'INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action) VALUES ($1,$2,\'Booking\',\'b\',$3)', [id, actor, action]);
const context = (loginRecordId: string, id = "u1") => db.query<Record<string, unknown>>("SELECT set_config('steamfoot.audit_actor', $1, true)", [JSON.stringify({ id, name: "原店長", role: "OWNER", storeId: "s1", loginRecordId })]);

describe("audit migrations in isolated PostgreSQL (PGlite)", () => {
  beforeAll(async () => {
    await db.exec(`SET TIME ZONE 'UTC'; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE "Store" (id text PRIMARY KEY); INSERT INTO "Store" VALUES ('s1');
      CREATE TABLE "StoreFeatureEntitlement" ("storeId" text, "featureKey" text, status text);
      CREATE TABLE "Booking" (id text PRIMARY KEY, "storeId" text); INSERT INTO "Booking" VALUES ('b','s1');
      CREATE TABLE "User" (id text PRIMARY KEY); INSERT INTO "User" VALUES ('u1'),('u2');
      CREATE TABLE "AuditLog" (id text PRIMARY KEY, "actorUserId" text REFERENCES "User"(id),
        "actorNameSnapshot" text, "storeId" text, module text, "targetType" text,
        "targetId" text, action text, summary text, "beforeJson" jsonb, "afterJson" jsonb,
        "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP);`);
    await db.exec(migration("20261007001000_staff_login_audit"));
    await db.exec(migration("20261007002000_verified_audit_actor"));
    await db.exec(`INSERT INTO "StaffLoginRecord" (id,"actorUserId",outcome,device) VALUES
      ('good','u1','SUCCESS','iPad'), ('other','u2','SUCCESS','手機'), ('failed','u1','FAILURE','桌機');`);
  }, 30000);
  afterAll(() => db.close());
  it("reapplies only the isolated Preview audit migrations without losing evidence", async () => {
    // The builder is a Node script used by the isolated-branch build preflight.
    const { buildAuditPreviewMigrationSql } = await import("../../scripts/audit-preview-migrations.mjs");
    await db.exec(buildAuditPreviewMigrationSql());
    await db.exec(buildAuditPreviewMigrationSql());
    expect((await db.query<Record<string, unknown>>('SELECT id FROM "StaffLoginRecord"')).rows).toHaveLength(3);
  });
  it("links legacy raw SQL writes and marks automatic operations", async () => {
    await db.exec("BEGIN"); await context("good"); await insert("raw-good", "u1", "CAPACITY_AUTO_PROMOTE"); await db.exec("COMMIT");
    const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM "AuditLog" WHERE id=\'raw-good\'');
    expect(rows[0]).toMatchObject({ actorNameSnapshot: "原店長", actorRoleSnapshot: "OWNER", loginRecordId: "good", source: "SYSTEM", storeId: "s1" });
  });
  it("redacts legacy SQL snapshots and derives HQ store scope from the target", async () => {
    await db.exec("BEGIN");
    await db.query<Record<string, unknown>>("SELECT set_config('steamfoot.audit_actor', $1, true)", [JSON.stringify({ id:"u1", name:"總部", role:"ADMIN", loginRecordId:"good" })]);
    await db.query<Record<string, unknown>>('INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson") VALUES (\'hq-raw\',\'u1\',\'Booking\',\'b\',\'UPDATE\',$1::jsonb)', [JSON.stringify({ items:[{ passwordHash:"never-store", token:"never-store", note:"正常備註" }] })]);
    await db.exec("COMMIT");
    const row=(await db.query<Record<string, unknown>>('SELECT * FROM "AuditLog" WHERE id=\'hq-raw\'')).rows[0];
    expect(row).toMatchObject({storeId:"s1",loginRecordId:"good",actorRoleSnapshot:"ADMIN",afterJson:{items:[{passwordHash:"[已隱藏]",token:"[已隱藏]",note:"正常備註"}]}});
  });
  it("does not reuse transaction context after commit or rollback", async () => {
    await insert("after-commit");
    await db.exec("BEGIN"); await context("good"); await insert("rolled-back"); await db.exec("ROLLBACK");
    await insert("after-rollback");
    const { rows } = await db.query<Record<string, unknown>>('SELECT id,"loginRecordId" FROM "AuditLog" WHERE id IN (\'after-commit\',\'after-rollback\',\'rolled-back\')');
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.loginRecordId === null)).toBe(true);
  });
  it("rejects another account's login and failed login links", async () => {
    for (const login of ["other", "failed"]) {
      await db.exec("BEGIN"); await context(login); await insert(`invalid-${login}`); await db.exec("COMMIT");
    }
    await db.exec("BEGIN"); await context("good"); await insert("different-actor", "u2"); await db.exec("COMMIT");
    const { rows } = await db.query<Record<string, unknown>>('SELECT "loginRecordId" FROM "AuditLog" WHERE id LIKE \'invalid-%\' OR id=\'different-actor\'');
    expect(rows.every(row => row.loginRecordId === null)).toBe(true);
  });
  it("rolls back business writes when enqueue fails; retries preserve one intent", async () => {
    await db.exec("CREATE TABLE test_business (id text PRIMARY KEY)");
    await db.exec("BEGIN; INSERT INTO test_business VALUES ('failure')");
    await expect(db.exec('INSERT INTO "OperationAuditOutbox" (id,payload) VALUES (\'x\',NULL)')).rejects.toThrow();
    await db.exec("ROLLBACK");
    expect((await db.query<Record<string, unknown>>("SELECT * FROM test_business")).rows).toHaveLength(0);
    await db.exec(`INSERT INTO "OperationAuditOutbox" (id,payload) VALUES ('event','{}') ON CONFLICT (id) DO NOTHING;
      INSERT INTO "OperationAuditOutbox" (id,payload) VALUES ('event','{}') ON CONFLICT (id) DO NOTHING;`);
    expect((await db.query<Record<string, unknown>>('SELECT * FROM "OperationAuditOutbox"')).rows).toHaveLength(1);
  });
  it("recovers from acknowledgement failure without losing or duplicating original evidence", async () => {
    // Remove the deliberately invalid payload used by the SQL idempotency test.
    await db.exec('DELETE FROM "OperationAuditOutbox"');
    const payload={actorUserId:"u1",actorNameSnapshot:"原店長",actorRoleSnapshot:"OWNER",loginRecordId:"good",source:"MANUAL",storeId:"s1",module:"STEAM",targetType:"Booking",targetId:"b",action:"UPDATE",summary:"修改預約"};
    await db.query<Record<string, unknown>>('INSERT INTO "OperationAuditOutbox" (id,payload,"createdAt") VALUES ($1,$2::jsonb,$3)', ["retry-event", JSON.stringify(payload), "2026-01-01T00:00:00.000Z"]);
    state.failAcknowledgement=true;
    expect(await deliverOperationAudits()).toEqual({delivered:0,pending:1});
    expect((await db.query<Record<string, unknown>>('SELECT * FROM "AuditLog" WHERE id=\'audit-outbox:retry-event\'')).rows).toHaveLength(0);
    expect((await db.query<Record<string, unknown>>('SELECT attempts,"deliveredAt" FROM "OperationAuditOutbox"')).rows[0]).toMatchObject({attempts:1,deliveredAt:null});
    state.failAcknowledgement=false;
    await db.exec('UPDATE "OperationAuditOutbox" SET "nextAttemptAt"=NOW()');
    expect(await deliverOperationAudits()).toEqual({delivered:1,pending:0});
    // Simulate losing the acknowledgement response and replaying the intent.
    await db.exec('UPDATE "OperationAuditOutbox" SET "deliveredAt"=NULL');
    await deliverOperationAudits();
    const rows=(await db.query<Record<string, unknown>>('SELECT * FROM "AuditLog" WHERE id=\'audit-outbox:retry-event\'')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({loginRecordId:"good",actorNameSnapshot:"原店長",actorRoleSnapshot:"OWNER"});
    expect(new Date(rows[0].createdAt as string).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
  it("keeps pending evidence and active logins while deleting only expired audit data", async () => {
    vi.stubEnv("AUDIT_RETENTION_ENABLED", "");
    expect(await maintainAuditRetention()).toEqual({enabled:false});
    await db.exec(`INSERT INTO "StaffLoginRecord" (id,outcome,device,"createdAt","lastUsedAt") VALUES
      ('expired','SUCCESS','桌機','2024-01-01',NULL),
      ('recently-used','SUCCESS','桌機','2024-01-01','2026-10-01'),
      ('pending-login','SUCCESS','桌機','2024-01-01',NULL);
      INSERT INTO "OperationAuditOutbox" (id,payload,"createdAt","nextAttemptAt") VALUES
      ('old-pending','{"loginRecordId":"pending-login"}','2024-01-01','2024-01-01');
      INSERT INTO "OperationAuditOutbox" (id,payload,"createdAt","deliveredAt") VALUES
      ('old-delivered','{}','2024-01-01','2024-01-02');
      INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"createdAt") VALUES
      ('expired-audit','u1','Booking','b','UPDATE','2024-01-01');`);
    vi.stubEnv("AUDIT_RETENTION_ENABLED", "1");
    await maintainAuditRetention(new Date("2026-10-07T00:00:00Z"));
    const logins=(await db.query<Record<string, unknown>>('SELECT id FROM "StaffLoginRecord"')).rows.map(row=>row.id);
    expect(logins).not.toContain("expired");
    expect(logins).toEqual(expect.arrayContaining(["recently-used","pending-login"]));
    const outbox=(await db.query<Record<string, unknown>>('SELECT id FROM "OperationAuditOutbox"')).rows.map(row=>row.id);
    expect(outbox).toContain("old-pending");expect(outbox).not.toContain("old-delivered");
    expect((await db.query<Record<string, unknown>>('SELECT id FROM "AuditLog" WHERE id=\'expired-audit\'')).rows).toHaveLength(0);
    vi.unstubAllEnvs();
  });
  it("keeps the original course category even when the store configuration changes before delivery", async () => {
    await db.exec(`INSERT INTO "StoreFeatureEntitlement" VALUES ('s1','business.music','ENABLED');
      INSERT INTO "OperationAuditOutbox" (id,payload) VALUES ('music-snapshot','{"storeId":"s1","module":"COURSE"}');
      UPDATE "StoreFeatureEntitlement" SET status='DISABLED';`);
    const row=(await db.query<Record<string, unknown>>('SELECT payload FROM "OperationAuditOutbox" WHERE id=\'music-snapshot\'')).rows[0];
    expect(row.payload).toMatchObject({module:"MUSIC"});
  });
  it("blocks browser roles from reading or writing pending evidence", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query<Record<string, unknown>>('SELECT * FROM "OperationAuditOutbox"')).rejects.toThrow();
      await expect(db.exec('INSERT INTO "OperationAuditOutbox" (id,payload) VALUES (\'forged\',\'{}\')')).rejects.toThrow();
      await db.exec("RESET ROLE");
    }
  });
});
