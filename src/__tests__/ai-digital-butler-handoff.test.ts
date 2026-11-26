import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { AiHandoffRepository, aiHandoffViewKey, aiHandoffCommandKeys } from "@/server/ai/handoff-repository";
import { AiButlerRepository, type AiDatabase, type AiSql } from "@/server/ai/repository";
import { AiRoutingRepository } from "@/server/ai/routing-repository";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
const now = new Date("2026-11-26T04:00:00Z"), storeId = "ai-preview-steamfoot", scopeKey = "a".repeat(64), secret = "s".repeat(40);
let db: PGlite, database: AiDatabase, queue: AiHandoffRepository, conversations: AiButlerRepository;
const keys = aiHandoffCommandKeys(storeId, "owner", "command", secret);
const command = () => ({ storeId, scopeKey, revision: 1, ...keys });
const authorize = vi.fn(async () => undefined);
const adapt = (c: Pick<PGlite, "query">): AiSql => ({ query: async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => (await c.query<T>(sql, values)).rows });
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE steamfoot_ai_preview_20261125;CREATE TABLE "Store" (id text PRIMARY KEY);CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz);');
  for (const name of ["preview-install", "preview-routing", "preview-handoff"]) await db.exec(readFileSync(`scripts/sql/ai-digital-butler/${name}.sql`, "utf8"));
  for (const id of [storeId, "ai-preview-beauty", "foreign"]) {
    await db.query('INSERT INTO "Store" VALUES ($1)', [id]);
    await db.query('INSERT INTO "StoreFeatureEntitlement" VALUES ($1,\'ai_digital_butler\',\'ENABLED\',NULL,NULL)', [id]);
  }
  database = { ...adapt(db), transaction: work => db.transaction(tx => work(adapt(tx))) };
  queue = new AiHandoffRepository(database); conversations = new AiButlerRepository(database);
}, 30_000);
beforeEach(async () => {
  authorize.mockReset().mockResolvedValue(undefined);
  await db.exec('RESET ROLE;TRUNCATE "AiButlerHandoffAudit","AiButlerRequest","AiButlerDispatch","AiButlerConversation","AiButlerSetting";UPDATE "AiButlerControl" SET stopped=true');
  await conversations.saveSetting(storeId, { ...DEFAULT_AI_SETTING, enabled: false }, 0, now);
  await conversations.handoff({ storeId, scopeKey }, true, now);
});
afterAll(async () => db.close());
it("lists real handoff state across actors, but never another store", async () => {
  await conversations.handoff({ storeId: "ai-preview-beauty", scopeKey: "b".repeat(64) }, true, now);
  expect(await queue.list(storeId)).toMatchObject({ total: 1, rows: [{ scopeKey, revision: 1, needsReview: false }] });
  expect(await queue.list("ai-preview-beauty")).toMatchObject({ total: 1, rows: [{ scopeKey: "b".repeat(64) }] });
});
it("resumes exactly one scope, records the operator, and leaves AI stopped/disabled", async () => {
  expect(await queue.resume(command(), now, authorize)).toEqual({ duplicate: false, revision: 2 });
  expect(await conversations.conversationState({ storeId, scopeKey })).toEqual({ handoff: false, revision: 2 });
  expect(await queue.list(storeId)).toMatchObject({ total: 0, rows: [] });
  expect((await db.query('SELECT * FROM "AiButlerHandoffAudit"')).rows).toMatchObject([{ actorKey: keys.actorKey, expectedRevision: 1, resultRevision: 2 }]);
  expect(await new AiRoutingRepository(database).globalStopped()).toBe(true);
  expect((await conversations.setting(storeId)).setting.enabled).toBe(false);
});
it("a lost-response retry returns the old receipt and never resumes a later human intervention", async () => {
  await queue.resume(command(), now, authorize);
  await conversations.handoff({ storeId, scopeKey }, true, now);
  expect(await queue.resume(command(), now, authorize)).toEqual({ duplicate: true, revision: 2 });
  expect(await conversations.conversationState({ storeId, scopeKey })).toEqual({ handoff: true, revision: 3 });
  expect((await db.query('SELECT COUNT(*)::int AS n FROM "AiButlerHandoffAudit"')).rows[0]).toEqual({ n: 1 });
});
it.each(["actorKey", "scopeKey", "revision"] as const)("an old command cannot be repurposed with changed %s", async field => {
  await queue.resume(command(), now, authorize);
  await expect(queue.resume({ ...command(), [field]: field === "revision" ? 2 : "c".repeat(64) }, now, authorize)).rejects.toThrow("AI_HANDOFF_CONFLICT");
});
it("stale versions, foreign fixture targets and denied authority do not update or audit", async () => {
  await expect(queue.resume({ ...command(), revision: 0 }, now, authorize)).rejects.toThrow("AI_HANDOFF_CONFLICT");
  await expect(queue.resume({ ...command(), storeId: "ai-preview-beauty" }, now, authorize)).rejects.toThrow("AI_HANDOFF_CONFLICT");
  authorize.mockRejectedValue(new Error("DENIED"));
  await expect(queue.resume(command(), now, authorize)).rejects.toThrow("DENIED");
  expect(await conversations.conversationState({ storeId, scopeKey })).toEqual({ handoff: true, revision: 1 });
  expect((await db.query('SELECT * FROM "AiButlerHandoffAudit"')).rows).toHaveLength(0);
});
it.each(["RESERVED", "UNKNOWN"])("%s model usage requires reconciliation instead of a new generation", async status => {
  await db.query(`INSERT INTO "AiButlerRequest" ("storeId","scopeKey","eventKey",provider,model,status,"heldMicros","createdAt") VALUES ($1,$2,'pending','openai','gpt-6-luna',$3,100,$4)`, [storeId, scopeKey, status, now]);
  expect((await queue.list(storeId)).rows[0].needsReview).toBe(true);
  await expect(queue.resume(command(), now, authorize)).rejects.toThrow("AI_HANDOFF_REVIEW_REQUIRED");
  expect((await db.query<{ heldMicros: number }>('SELECT "heldMicros" FROM "AiButlerRequest"')).rows[0].heldMicros).toBe(100);
});
it.each(["CLAIMED", "UNKNOWN"])("%s dispatch cannot be bypassed from the operator queue", async status => {
  await db.query(`INSERT INTO "AiButlerDispatch" ("storeId","scopeKey","eventKey",fingerprint,"scopeRevision",status,"createdAt") VALUES ($1,$2,'event','fingerprint',1,$3,$4)`, [storeId, scopeKey, status, now]);
  await expect(queue.resume(command(), now, authorize)).rejects.toThrow("AI_HANDOFF_REVIEW_REQUIRED");
});
it("failure to write the audit rolls back the handoff change", async () => {
  const broken: AiDatabase = { ...database, transaction: work => database.transaction(tx => work({ query: async (sql, values) => {
    if (sql.startsWith('INSERT INTO "AiButlerHandoffAudit"')) throw new Error("AUDIT_FAILED");
    return tx.query(sql, values);
  } })) };
  await expect(new AiHandoffRepository(broken).resume(command(), now, authorize)).rejects.toThrow("AUDIT_FAILED");
  expect(await conversations.conversationState({ storeId, scopeKey })).toEqual({ handoff: true, revision: 1 });
});
it("a 51-row queue is paged without repeats and does not hide the remaining count", async () => {
  for (let i = 1; i <= 50; i++) await conversations.handoff({ storeId, scopeKey: i.toString(16).padStart(64, "0") }, true, now);
  const first = await queue.list(storeId), second = await queue.list(storeId, first.nextCursor!), third = await queue.list(storeId, second.nextCursor!);
  expect([first.rows.length, second.rows.length, third.rows.length]).toEqual([25, 25, 1]);
  expect(first.total).toBe(51); expect(third.nextCursor).toBe(null);
  expect(new Set([...first.rows, ...second.rows, ...third.rows].map(row => row.scopeKey)).size).toBe(51);
});
it("operator view and command keys are separated by actor, store and purpose", () => {
  expect(aiHandoffViewKey(storeId, "owner", secret)).not.toBe(aiHandoffViewKey(storeId, "staff", secret));
  expect(aiHandoffViewKey(storeId, "owner", secret)).not.toBe(aiHandoffViewKey("ai-preview-beauty", "owner", secret));
  expect(keys.actorKey).not.toBe(keys.commandKey);
});
it("only the existing fixture role can insert scoped audit records; no browser/update/delete grants", async () => {
  const [privileges] = (await db.query(`SELECT has_table_privilege('anon','"AiButlerHandoffAudit"','SELECT') AS anon,
    has_table_privilege('authenticated','"AiButlerHandoffAudit"','SELECT') AS authenticated,
    has_table_privilege('steamfoot_ai_preview_20261125','"AiButlerHandoffAudit"','UPDATE') AS update,
    has_table_privilege('steamfoot_ai_preview_20261125','"AiButlerHandoffAudit"','DELETE') AS delete`)).rows;
  expect(privileges).toEqual({ anon: false, authenticated: false, update: false, delete: false });
  await queue.resume(command(), now, authorize);
  await db.query(`INSERT INTO "AiButlerHandoffAudit" ("storeId","commandKey","scopeKey","actorKey","expectedRevision","resultRevision","createdAt") VALUES ('foreign',$1,$1,$1,0,1,$2)`, ["f".repeat(64), now]);
  await db.exec('SET ROLE steamfoot_ai_preview_20261125');
  try { expect((await db.query('SELECT "storeId" FROM "AiButlerHandoffAudit"')).rows).toEqual([{ storeId }]); }
  finally { await db.exec('RESET ROLE'); }
});
