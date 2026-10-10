/**
 * Synthetic-only native PostgreSQL acceptance for the combined opening importer.
 * Every Prisma operation uses an explicit, guarded, loopback *_test datasource.
 * Authentication/Preview metadata are a test boundary; SQL, locks, constraints,
 * Serializable transactions, durable readback and rollback are not mocked.
 * The literal pilot store ID exists only as an invented row in a random schema.
 * No source export, Supabase connection, delivery worker, migration runner or UI.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ manager: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/course-db", () => ({ coursePrisma: { $transaction: boundary.transaction } }));
vi.mock("@/server/services/course-access", () => ({ courseManager: boundary.manager }));
vi.mock("../../scripts/music-opening-preview-scope.mjs", () => ({
  MUSIC_OPENING_STORE: "store-lubymusic",
  assertMusicOpeningPreviewEnvironment: vi.fn(),
}));
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { PrismaClient, type Prisma } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { importFixture, importProof } from "./fixtures/music-opening-import";
import { musicOpeningMakeupSourceKey } from "@/lib/music-opening-makeup";
import { type MusicOpeningImportInput } from "@/lib/music-opening-import";
import { importVerifiedMusicOpening, importVerifiedMusicOpeningInTransaction } from "@/server/services/music-opening-import";
import { lockCourseStore } from "@/server/services/course-store-lock";

const databaseUrl = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema = `opening_import_${randomUUID().replaceAll("-", "")}`;
const url = databaseUrl ? new URL(databaseUrl) : null;
url?.searchParams.set("schema", schema);
url?.searchParams.set("connection_limit", "5");
const db = url ? new PrismaClient({ datasourceUrl: url.toString() }) : null;
const database = () => { if (!db) throw new Error("Explicit disposable loopback PostgreSQL required"); return db; };
const actor = { storeId: "store-lubymusic", userId: "synthetic-import-manager", name: "Synthetic manager", role: "MANAGER" };
const transact = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>, serializable = false) => database().$transaction(async tx => {
  await tx.$executeRawUnsafe(`SET LOCAL search_path = "${schema}"`);
  return run(tx);
}, { timeout: 30_000, maxWait: 30_000, ...(serializable ? { isolationLevel: "Serializable" as const } : {}) });
// The production wrapper chooses the transaction options. The mocked module
// below forwards those exact options to a real, guarded loopback Prisma client.
const runImport = (data: MusicOpeningImportInput) => importVerifiedMusicOpening(data, importProof(data));

/** Preserve quoted strings and complete dollar-quoted PL/pgSQL bodies. */
function statements(sql: string) {
  const result: string[] = []; let start = 0, single = false, double = false, dollar = "", comment = false;
  for (let i = 0; i < sql.length; i++) {
    if (comment) { if (sql[i] === "\n") comment = false; continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = ""; } continue; }
    if (single) { if (sql[i] === "'") { if (sql[i + 1] === "'") i++; else single = false; } continue; }
    if (double) { if (sql[i] === '"') { if (sql[i + 1] === '"') i++; else double = false; } continue; }
    if (sql.startsWith("--", i)) { comment = true; i++; continue; }
    if (sql[i] === "'") { single = true; continue; }
    if (sql[i] === '"') { double = true; continue; }
    if (sql[i] === "$") { const match = sql.slice(i).match(/^\$[a-zA-Z_0-9]*\$/); if (match) { dollar = match[0]; i += dollar.length - 1; continue; } }
    if (sql[i] === ";") { const part = sql.slice(start, i).trim(); if (part) result.push(part); start = i + 1; }
  }
  const tail = sql.slice(start).trim(); if (tail && tail.replace(/--[^\n]*/g, "").trim()) result.push(tail);
  return result;
}
function adapt(sql: string) {
  return sql.replaceAll("public.", `"${schema}".`)
    .replace(/\btable_schema\s*=\s*'public'/g, `table_schema='${schema}'`)
    .replace(/\bnspname\s*=\s*'public'/g, `nspname='${schema}'`)
    .replace(/\bsearch_path\s*=\s*public/g, `search_path="${schema}"`);
}
async function applySql(tx: Prisma.TransactionClient, sql: string) {
  for (const statement of statements(adapt(sql))) {
    const executable = statement.replace(/--[^\n]*/g, "").trim();
    if (executable === "BEGIN" || executable === "COMMIT") continue;
    await tx.$executeRawUnsafe(statement);
  }
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

(databaseUrl ? describe : describe.skip)("combined music opening importer — native PostgreSQL transactions", () => {
  let created = false;
  beforeAll(async () => {
    await database().$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    await transact(async tx => {
      const version = await tx.$queryRaw<Array<{ version: string }>>`SELECT version()`;
      // CI's postgres:17.6 supplies a genuine multi-connection server. This also
      // gives the JSON test output a useful failure if a different engine is used.
      expect(version[0].version).toMatch(/^PostgreSQL 17\./);
      const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
      await applySql(tx, ddl);
      for (const statement of [
        'ALTER TABLE "CourseBooking" DROP COLUMN "musicOpeningMakeupEntitlementId" CASCADE',
        'DROP TABLE "CourseMusicOpeningMakeupEntitlement" CASCADE',
        'DROP TABLE "CourseMusicOpeningState" CASCADE',
        'ALTER TABLE "CourseBooking" DROP COLUMN "musicOpeningTermKey" CASCADE, DROP COLUMN "musicOpeningLessonOrdinal" CASCADE, DROP COLUMN "musicOpeningSourceLessonKey" CASCADE',
        'ALTER TABLE "CoursePointCard" DROP COLUMN "musicOpeningStateRequired" CASCADE, ALTER COLUMN "expiresAt" SET NOT NULL',
        'CREATE TABLE "Store"(id text PRIMARY KEY,slug text,"industryModule" text)',
        'CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text NOT NULL,name text,"serviceNote" text,"mergedIntoCustomerId" text,UNIQUE(id,"storeId"))',
        'CREATE TABLE "StoreFeatureEntitlement"("storeId" text,"featureKey" text,status text)',
        'CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text NOT NULL)',
        'CREATE TABLE "MessageTemplate"(id text PRIMARY KEY,"storeId" text NOT NULL,body text)',
        'CREATE TABLE "AuditLog"(id text PRIMARY KEY,"actorUserId" text,"actorNameSnapshot" text,"storeId" text,module text,summary text,"targetType" text,"targetId" text,action text,"beforeJson" jsonb,"afterJson" jsonb,"createdAt" timestamptz)',
        'CREATE TABLE "MessageLog"(id text PRIMARY KEY,"storeId" text NOT NULL)',
        'CREATE TABLE "ManagerNotificationLog"(id text PRIMARY KEY,"storeId" text NOT NULL)',
        'CREATE TABLE "SessionBalanceNotification"(id text PRIMARY KEY,"storeId" text NOT NULL)',
        'CREATE TABLE "OperationAuditOutbox"(id text PRIMARY KEY,payload jsonb NOT NULL)',
      ]) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(`DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      END $$`);
      await tx.$executeRaw`INSERT INTO "Store" VALUES(${actor.storeId},'lubymusic','COURSE')`;
      await tx.$executeRaw`INSERT INTO "StoreFeatureEntitlement" VALUES(${actor.storeId},'business.music','ENABLED')`;
      const priorValues = readFileSync("prisma/migrations/20260925191000_course_music_absence/migration.sql", "utf8")
        .match(/ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK \([\s\S]*?\n\);/)?.[0];
      const priorAbsence = readFileSync("prisma/migrations/20261001093000_course_teacher_absence_refund/migration.sql", "utf8")
        .match(/ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_absence_kind_check"[\s\S]*?;/)?.[0];
      if (!priorValues || !priorAbsence) throw new Error("Reviewed prior booking constraints missing");
      await tx.$executeRawUnsafe(priorValues); await tx.$executeRawUnsafe(priorAbsence);
      await applySql(tx, readFileSync("docs/sql/music-opening-state-draft-20261007.sql", "utf8"));
      await applySql(tx, readFileSync("docs/sql/music-opening-makeup-20261008.sql", "utf8"));
      await applySql(tx, readFileSync("docs/sql/music-opening-no-expiry-20261010.sql", "utf8"));
      await applySql(tx, readFileSync("supabase/migrations/20261002093141_course_coach_notifications.sql", "utf8"));
      await tx.$executeRaw`INSERT INTO "MessageTemplate" VALUES(${`course-coach-change:${actor.storeId}`},${actor.storeId},'enabled'),(${`course-coach-trial:${actor.storeId}`},${actor.storeId},'enabled')`;
    });
  }, 60_000);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-08T00:02:00Z")); vi.stubEnv("VERCEL", "1");
    boundary.manager.mockReset(); boundary.transaction.mockReset();
    boundary.manager.mockResolvedValue({ storeId: actor.storeId, user: { id: actor.userId, name: actor.name, role: actor.role } });
    boundary.transaction.mockImplementation((run: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => {
      expect(options).toMatchObject({ isolationLevel: "Serializable", timeout: 30_000 });
      return database().$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path = "${schema}"`);
        return run(tx);
      }, options);
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  afterAll(async () => {
    try { if (created) await database().$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await db?.$disconnect(); }
  });

  async function fixture(expiry: "SPECIFIED" | "NO_EXPIRY" | "UNKNOWN" = "SPECIFIED") {
    const token = randomUUID(), customerId = `synthetic-student-${token}`, coachId = `synthetic-coach-${token}`;
    const data = importFixture(), item = data.enrollments[0], right = data.makeup.records[0];
    item.record.sourceRecordKey = `synthetic-enrollment-${token}`;
    item.record.sourceStudentKey = `synthetic-source-student-${token}`;
    item.mapping.customerId = customerId;
    data.sourceManifestKey = `synthetic-manifest-${token}`;
    data.makeup.batchId = `synthetic-batch-${token}`;
    data.makeup.manifest.sourceManifestKey = data.sourceManifestKey;
    right.sourceEnrollmentKey = item.record.sourceRecordKey;
    right.sourceStudentKey = item.record.sourceStudentKey;
    right.sourceLessonKey = `synthetic-leave-${token}`;
    right.mapping.customerId = customerId;
    item.record.balance.separatedMakeup!.sourceLessonKeys = [right.sourceLessonKey];
    if (expiry !== "SPECIFIED") {
      item.record.expiresAt = null;
      item.record.expiryVerification = expiry === "NO_EXPIRY" ? { kind: "NO_EXPIRY", evidenceKey: `synthetic-expiry-${token}` } : { kind: "UNKNOWN" };
      item.dates.raw = [{ sourceFieldKey: "synthetic-duration", value: null }];
    }
    const seed = await transact(async tx => {
      const marker = `SOURCE_REPLICA|YINJIAOYUN|www.injiaoyun.com:store-lubymusic|STUDENT|${item.record.sourceStudentKey}`;
      await tx.$executeRaw`INSERT INTO "Customer" VALUES(${customerId},${actor.storeId},'Synthetic learner',${marker},NULL)`;
      await tx.$executeRaw`INSERT INTO "Staff" VALUES(${coachId},${actor.storeId})`;
      const template = await tx.courseTemplate.create({ data: { storeId: actor.storeId, name: `Synthetic template ${token}`, durationMinutes: 60, pointCost: 1, capacity: 2, classType: "PRIVATE" } });
      const plan = await tx.coursePointPlan.create({ data: { storeId: actor.storeId, name: `Synthetic plan ${token}`, points: 4, price: 3200, validDays: 35, unit: "SESSION", templateIds: [template.id], allowShared: false } });
      const sentinel = await tx.coursePointCard.create({ data: { storeId: actor.storeId, planId: plan.id, nameSnapshot: "Synthetic unchanged native sentinel", unit: "SESSION", remaining: 7, expiresAt: new Date("2027-01-01T00:00:00Z"), requestKey: randomUUID() } });
      return { template, plan, sentinel };
    });
    item.mapping.planId = seed.plan.id; item.mapping.templateId = seed.template.id; right.mapping.templateId = seed.template.id;
    const sourceKey = musicOpeningMakeupSourceKey(right);
    data.makeup.manifest.sourceKeys = [sourceKey];
    data.makeup.manifest.cutoffCoverage = [{ sourceEnrollmentKey: item.record.sourceRecordKey, customerId, expectedOutstandingAtCutoff: 1, openingSourceKeys: [sourceKey] }];
    return { data, token, customerId, coachId, ...seed };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function counts() {
    return transact(tx => tx.$queryRaw<Array<{ kind: string; n: number }>>`
      SELECT 'cards' AS kind,count(*)::int n FROM "CoursePointCard"
      UNION ALL SELECT 'members',count(*)::int FROM "CourseCardMember"
      UNION ALL SELECT 'states',count(*)::int FROM "CourseMusicOpeningState"
      UNION ALL SELECT 'rights',count(*)::int FROM "CourseMusicOpeningMakeupEntitlement"
      UNION ALL SELECT 'audit',count(*)::int FROM "AuditLog"
      UNION ALL SELECT 'coach',count(*)::int FROM "CourseCoachNotification"
      UNION ALL SELECT 'monthly',count(*)::int FROM "CourseMonthlyNotification"
      UNION ALL SELECT 'manager',count(*)::int FROM "ManagerNotificationLog"
      UNION ALL SELECT 'balance',count(*)::int FROM "SessionBalanceNotification"
      UNION ALL SELECT 'message',count(*)::int FROM "MessageLog"
      UNION ALL SELECT 'audit-outbox',count(*)::int FROM "OperationAuditOutbox" ORDER BY kind`);
  }
  async function unchanged(f: Fixture) {
    expect(await database().coursePointCard.findUnique({ where: { id: f.sentinel.id } })).toEqual(f.sentinel);
    for (const table of ["CoursePointEntry", "CoursePurchase", "CourseFeePayment", "CourseCompensationSnapshot", "CourseWaitlistEntry", "CourseBooking", "CourseCoachNotification", "CourseMonthlyNotification", "MessageLog", "ManagerNotificationLog", "SessionBalanceNotification", "OperationAuditOutbox"]) {
      const rows = await transact(tx => tx.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int n FROM "${table}"`));
      expect(rows[0].n, `${table} must have no synthetic import side effects`).toBe(0);
    }
  }
  async function importedRows(f: Fixture) {
    const states = await database().courseMusicOpeningState.findMany({ where: { storeId: actor.storeId, customerId: f.customerId }, include: { card: { include: { members: true } } } });
    const rights = await database().courseMusicOpeningMakeupEntitlement.findMany({ where: { storeId: actor.storeId, customerId: f.customerId } });
    const audits = await transact(tx => tx.$queryRaw<Array<{ id: string; action: string }>>`SELECT id,action FROM "AuditLog" WHERE "afterJson"->>'sourceManifestKey'=${f.data.sourceManifestKey} OR "afterJson"->'receipt'->'snapshot'->'mapping'->>'customerId'=${f.customerId} ORDER BY id`);
    return { states, rights, audits };
  }
  async function trigger(table: "AuditLog" | "CourseMusicOpeningState", body: string) {
    const name = `synthetic_fault_${randomUUID().replaceAll("-", "")}`;
    await transact(async tx => {
      await tx.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN ${body} RETURN NEW; END $fault$`);
      await tx.$executeRawUnsafe(`CREATE TRIGGER "${name}" AFTER INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
    });
    return async () => transact(async tx => {
      await tx.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "${table}"`);
      await tx.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    });
  }

  it.each(["SPECIFIED", "NO_EXPIRY"] as const)("imports %s ordinary balance and separate makeup atomically with real readback", async expiry => {
    const f = await fixture(expiry);
    const result = await runImport(f.data);
    expect(boundary.transaction).toHaveBeenCalledTimes(1);
    expect(boundary.manager).toHaveBeenNthCalledWith(1, "wallet.create");
    expect(boundary.manager).toHaveBeenNthCalledWith(2, "booking.update");
    expect(result).toMatchObject({ status: "IMPORTED", created: 1, skipped: 0, updated: 0, makeup: { created: 1, openingSourceRights: 1 } });
    const rows = await importedRows(f);
    expect(rows.states).toHaveLength(1); expect(rows.rights).toHaveLength(1); expect(rows.audits).toHaveLength(2);
    expect(rows.states[0].card).toMatchObject({ remaining: 2, musicOpeningStateRequired: true, musicValidityDays: null, members: [{ customerId: f.customerId, storeId: actor.storeId }] });
    expect(rows.states[0].card.expiresAt).toEqual(expiry === "NO_EXPIRY" ? null : new Date(f.data.enrollments[0].record.expiresAt!));
    expect(rows.states[0].snapshot).toMatchObject({ record: { expiresAt: f.data.enrollments[0].record.expiresAt, expiryVerification: { kind: expiry } } });
    await unchanged(f);
  });
  it("unknown empty expiry stays HOLD and creates no rows", async () => {
    const f = await fixture("UNKNOWN"), before = await counts();
    expect(await runImport(f.data)).toMatchObject({ status: "HOLD", issue: "SOURCE_DATE_UNVERIFIED" });
    expect(await counts()).toEqual(before); await unchanged(f);
  });
  it("no-expiry capability must include the validated reviewed check before any write", async () => {
    const f = await fixture("NO_EXPIRY"), before = await counts();
    await expect(transact(async tx => {
      await tx.$executeRawUnsafe('ALTER TABLE "CoursePointCard" DROP CONSTRAINT "CoursePointCard_opening_no_expiry"');
      expect(await importVerifiedMusicOpeningInTransaction(tx, actor, f.data, importProof(f.data)))
        .toMatchObject({ status: "HOLD", issue: "VERIFIED_NO_EXPIRY_TARGET_SCHEMA_UNSUPPORTED" });
      throw new Error("SYNTHETIC_CAPABILITY_PROBE_ROLLBACK");
    }, true)).rejects.toThrow("SYNTHETIC_CAPABILITY_PROBE_ROLLBACK");
    expect(await counts()).toEqual(before); await unchanged(f);
  });
  it("tampered no-expiry evidence cannot materialize an ordinary or makeup right", async () => {
    const f = await fixture("NO_EXPIRY"), before = await counts(), proof = importProof(f.data);
    f.data.enrollments[0].record.expiryVerification = { kind: "NO_EXPIRY", evidenceKey: "synthetic-tampered-evidence" };
    expect(await transact(tx => importVerifiedMusicOpeningInTransaction(tx, actor, f.data, proof), true))
      .toMatchObject({ status: "HOLD", issue: "SOURCE_PROOF_MISMATCH" });
    expect(await counts()).toEqual(before); expect(await importedRows(f)).toEqual({ states: [], rights: [], audits: [] }); await unchanged(f);
  });
  it("native cards still cannot acquire a null expiry", async () => {
    const f = await fixture();
    await expect(transact(tx => tx.$executeRaw`UPDATE "CoursePointCard" SET "expiresAt"=NULL WHERE id=${f.sentinel.id}`)).rejects.toThrow();
    await unchanged(f);
  });
  it("exact replay preserves IDs and audits and never refills spent credit or resets lifecycle", async () => {
    const f = await fixture("NO_EXPIRY"); await runImport(f.data);
    const initial = await importedRows(f), state = initial.states[0], right = initial.rights[0];
    await transact(async tx => {
      await tx.coursePointCard.update({ where: { id: state.cardId }, data: { remaining: 1 } });
      await tx.$executeRaw`UPDATE "CourseMusicOpeningMakeupEntitlement" SET version=version+1,"updatedAt"=GREATEST(clock_timestamp(),"updatedAt") WHERE id=${right.id}`;
    });
    const before = await counts();
    expect(await runImport(f.data)).toMatchObject({ status: "IMPORTED", created: 0, skipped: 1, makeup: { created: 0, skipped: 1 } });
    const again = await importedRows(f);
    expect(again.states[0].card).toMatchObject({ id: state.cardId, remaining: 1, expiresAt: null });
    expect(again.rights[0]).toMatchObject({ id: right.id, version: 1 });
    expect(again.audits).toEqual(initial.audits); expect(await counts()).toEqual(before); await unchanged(f);
  });
  it("a stale compare-and-swap prevalue cannot rewrite an existing import", async () => {
    const f = await fixture(); await runImport(f.data); const before = await importedRows(f), totals = await counts();
    f.data.enrollments[0].expected = { kind: "EXISTING", cardId: before.states[0].cardId, contentHash: "b".repeat(64) };
    await expect(runImport(f.data)).rejects.toThrow("SOURCE_CAS_CONFLICT");
    expect(await importedRows(f)).toEqual(before); expect(await counts()).toEqual(totals); await unchanged(f);
  });
  it("an audit failure after both entitlement types are staged rolls back every new row", async () => {
    const f = await fixture("NO_EXPIRY"), before = await counts();
    const cleanup = await trigger("AuditLog", `IF NEW.action='OPENING_IMPORT' AND NEW."afterJson"->>'sourceManifestKey'=${quote(f.data.sourceManifestKey)} THEN
      IF NOT EXISTS(SELECT 1 FROM "CourseMusicOpeningState" WHERE "cardId"=NEW."targetId") OR NOT EXISTS(SELECT 1 FROM "CourseMusicOpeningMakeupEntitlement" WHERE "customerId"=${quote(f.customerId)}) THEN RAISE EXCEPTION 'SYNTHETIC_STAGING_NOT_REACHED'; END IF;
      RAISE EXCEPTION 'SYNTHETIC_FAIL_AFTER_BOTH'; END IF;`);
    try { await expect(runImport(f.data)).rejects.toThrow("SYNTHETIC_FAIL_AFTER_BOTH"); } finally { await cleanup(); }
    expect(await counts()).toEqual(before); expect(await importedRows(f)).toEqual({ states: [], rights: [], audits: [] }); await unchanged(f);
  });
  it("a real SQL trigger corrupting persisted state is caught by final readback and rolled back", async () => {
    const f = await fixture(), before = await counts();
    const cleanup = await trigger("CourseMusicOpeningState", `IF NEW."customerId"=${quote(f.customerId)} THEN UPDATE "CourseMusicOpeningState" SET "contentHash"=repeat('b',64) WHERE id=NEW.id; END IF;`);
    try { await expect(runImport(f.data)).rejects.toThrow("READBACK"); } finally { await cleanup(); }
    expect(await counts()).toEqual(before); await unchanged(f);
  });
  it.each(["message", "coach", "monthly", "manager", "balance", "audit-outbox"] as const)("a real %s queue side effect aborts and rolls back the entire import", async kind => {
    const f = await fixture(), before = await counts(), id = quote(`synthetic-queue-${f.token}`), store = quote(actor.storeId);
    const inserts = {
      message: `INSERT INTO "MessageLog" VALUES(${id},${store});`,
      coach: `INSERT INTO "CourseCoachNotification"(id,"storeId","staffId",kind) VALUES(${id},${store},${quote(f.coachId)},'CHANGE');`,
      monthly: `INSERT INTO "CourseMonthlyNotification"(id,"storeId","settlementId","staffId","userId","customerId","recipientHash",channel,body,"retryKey",status,"leaseUntil","actorUserId") VALUES(${id},${store},${id},${quote(f.coachId)},'synthetic-user',${quote(f.customerId)},'synthetic-hash','SYNTHETIC','synthetic',${id},'READY',now(),'synthetic-actor');`,
      manager: `INSERT INTO "ManagerNotificationLog" VALUES(${id},${store});`,
      balance: `INSERT INTO "SessionBalanceNotification" VALUES(${id},${store});`,
      "audit-outbox": `INSERT INTO "OperationAuditOutbox" VALUES(${id},jsonb_build_object('storeId',${store}));`,
    };
    const cleanup = await trigger("AuditLog", `IF NEW.action='OPENING_IMPORT' AND NEW."afterJson"->>'sourceManifestKey'=${quote(f.data.sourceManifestKey)} THEN ${inserts[kind]} END IF;`);
    try { await expect(runImport(f.data)).rejects.toThrow("NOTIFICATION_SIDE_EFFECT_ROLLBACK"); } finally { await cleanup(); }
    expect(await counts()).toEqual(before); await unchanged(f);
  });
  it("real native notification triggers enqueue inside a rolled-back positive control", async () => {
    const f = await fixture(), before = await counts();
    await expect(transact(async tx => {
      const room = await tx.courseRoom.create({ data: { storeId: actor.storeId, name: "Synthetic positive control room" } });
      const session = await tx.courseSession.create({ data: { storeId: actor.storeId, templateId: f.template.id, roomId: room.id, coachId: f.coachId, nameSnapshot: "Synthetic positive control", startsAt: new Date("2099-10-15T02:00:00Z"), endsAt: new Date("2099-10-15T03:00:00Z"), pointCost: 1, capacity: 2, requestKey: randomUUID(), requestIndex: 0, createdById: actor.userId } });
      await tx.courseSession.update({ where: { id: session.id }, data: { startsAt: new Date("2099-10-15T04:00:00Z"), endsAt: new Date("2099-10-15T05:00:00Z") } });
      await tx.courseBooking.create({ data: { storeId: actor.storeId, sessionId: session.id, customerId: f.customerId, customerName: "Synthetic native control", bookingKind: "TRIAL", cardId: null, pointCost: 0, trialPrice: 100, operatorUserId: actor.userId, operatorName: actor.name, requestKey: randomUUID() } });
      expect(await tx.$queryRaw`SELECT kind,count(*)::int n FROM "CourseCoachNotification" GROUP BY kind ORDER BY kind`).toEqual([{ kind: "CHANGE", n: 1 }, { kind: "TRIAL", n: 1 }]);
      throw new Error("SYNTHETIC_NATIVE_CONTROL_ROLLBACK");
    })).rejects.toThrow("SYNTHETIC_NATIVE_CONTROL_ROLLBACK");
    expect(await counts()).toEqual(before); await unchanged(f);
  });
  it("wrong store and mismatched source-student marker reject without durable writes", async () => {
    const f = await fixture(), before = await counts();
    await expect(transact(tx => importVerifiedMusicOpeningInTransaction(tx, { ...actor, storeId: "synthetic-other-store" }, f.data, importProof(f.data)), true)).rejects.toThrow("IMPORT_ACTOR_SCOPE_MISMATCH");
    await transact(tx => tx.$executeRaw`UPDATE "Customer" SET "serviceNote"='synthetic-wrong-marker' WHERE id=${f.customerId}`);
    await expect(runImport(f.data)).rejects.toThrow("VERIFIED_MAPPING_NOT_FOUND");
    expect(await counts()).toEqual(before); await unchanged(f);
  });

  it("genuinely overlapping Serializable sessions cannot duplicate an identical source import", async () => {
    const f = await fixture("NO_EXPIRY");
    let releaseA!: () => void, signalA!: (pid: number) => void, signalB!: (pid: number) => void;
    const gate = new Promise<void>(resolve => { releaseA = resolve; });
    const aReady = new Promise<number>(resolve => { signalA = resolve; });
    const bReady = new Promise<number>(resolve => { signalB = resolve; });
    const a = transact(async tx => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
      await lockCourseStore(tx, actor.storeId); signalA(pid); await gate;
      return importVerifiedMusicOpeningInTransaction(tx, actor, f.data, importProof(f.data));
    }, true);
    // Attach rejection handlers before waiting, including setup-failure paths.
    const observedA = a.then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }));
    const pidA = await Promise.race([aReady, observedA.then(() => { throw new Error("First transaction exited before acquiring its row lock"); })]);
    const b = transact(async tx => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`;
      signalB(pid);
      return importVerifiedMusicOpeningInTransaction(tx, actor, f.data, importProof(f.data));
    }, true);
    const observedB = b.then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }));
    let overlapFailure: unknown;
    try {
      const pidB = await Promise.race([bReady, observedB.then(() => { throw new Error("Second transaction exited before exposing its backend"); })]);
      expect(pidA).not.toBe(pidB);
      const started = performance.now(); let blocked = false;
      while (performance.now() - started < 10_000) {
        const [row] = await database().$queryRaw<Array<{ blocked: boolean }>>`SELECT ${pidA}::int=ANY(pg_blocking_pids(${pidB}::int)) blocked`;
        if (row.blocked) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked, "second backend must actually wait for the first Store row lock").toBe(true);
    } catch (error) { overlapFailure = error; } finally { releaseA(); }
    const [first, second] = await Promise.all([observedA, observedB]);
    if (overlapFailure) throw overlapFailure;
    expect(first.status).toBe("fulfilled");
    if (first.status !== "fulfilled") throw first.reason;
    expect(first.value).toMatchObject({ status: "IMPORTED", created: 1 });
    if (second.status === "fulfilled") expect(second.value).toMatchObject({ status: "IMPORTED", created: 0, skipped: 1 });
    else {
      // A known Serializable/unique conflict has no successful commit to retry.
      // This acceptance test reconciles source identity in a NEW transaction;
      // it does not introduce a production retry loop or retry uncertain commits.
      const error = second.reason as { code?: string; message?: string };
      expect(error.code === "P2034" || error.code === "P2002" || /serialization|could not serialize|40001/i.test(error.message ?? "")).toBe(true);
    }
    const once = await importedRows(f), before = await counts();
    expect(once.states).toHaveLength(1); expect(once.rights).toHaveLength(1); expect(once.audits).toHaveLength(2);
    expect(await runImport(f.data)).toMatchObject({ status: "IMPORTED", created: 0, skipped: 1, makeup: { created: 0, skipped: 1 } });
    expect(await importedRows(f)).toEqual(once); expect(await counts()).toEqual(before); await unchanged(f);
  }, 45_000);
});
