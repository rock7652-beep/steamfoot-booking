import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBrandAi } from "@/server/ai/brand";
import { brandIdentity, type TrustedBrandScope } from "@/server/ai/principal";
import { projectBrandKnowledge, selectBrandKnowledge } from "@/server/ai/brand-knowledge";
import { AiOwnerRepository } from "@/server/ai/owner-repository";
import { AiButlerRepository, type AiDatabase, type AiSql } from "@/server/ai/repository";
import { AiButlerService, aiIdentity } from "@/server/ai/service";
import { MockAiProvider, OpenAiResponsesProvider, type AiProvider, type AiRate } from "@/server/ai/provider";
import { DEFAULT_AI_SETTING, AI_LIMITS } from "@/server/ai/contracts";
import { EMPTY_AI_KNOWLEDGE } from "@/server/ai/knowledge-document";
import { selectAiKnowledge, syntheticAiKnowledge } from "@/server/ai/knowledge";
import { AiToolRegistry } from "@/server/ai/tools";
import type { DigitalButlerRuntimeResult } from "@/server/services/digital-butler-runtime";

const now = new Date("2026-11-26T10:00:00Z"), secret = "offline-brand-principal-secret-".repeat(2);
const scope: TrustedBrandScope = { principal: { kind: "BRAND", serviceId: "steamfoot" }, channel: "TEST", channelAccountId: "oa", actorId: "tester" };
const storeScope = { storeId: "steamfoot", channel: "TEST" as const, channelAccountId: "oa", actorId: "tester", module: "STEAMFOOT" as const };
const draft = { ...EMPTY_AI_KNOWLEDGE, faqs: [{ question: "產品價格？", answer: "這是合成品牌方案，測試價格每月 NT$999。" }] };
const rate: AiRate = { inputMicrosPerToken: 1, outputMicrosPerToken: 1, responses: true, jsonSchema: true, verifiedAt: "2026-11-26T00:00:00Z", validUntil: "2026-11-27T00:00:00Z", source: "https://developers.openai.com/api/docs/models/gpt-6-luna" };
let db: PGlite, database: AiDatabase, owners: AiOwnerRepository, stores: AiButlerRepository;
const sql = (client: Pick<PGlite, "query">): AiSql => ({ query: async <T extends Record<string, unknown>>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows });
const brand = (provider: AiProvider = new MockAiProvider(), extra: Partial<Parameters<typeof createBrandAi>[0]> = {}) => createBrandAi({ serviceId: "steamfoot", database, provider, identitySecret: secret, authorize: async () => {}, authorizeOperator: async () => {}, rateForModel: () => provider.kind === "mock" ? null : rate, enabled: () => true, clock: () => now, ...extra });
async function published(app = brand()) {
  await app.knowledge.change(0, "save", draft, now);
  const doc = await app.knowledge.change(1, "publish", undefined, now);
  return projectBrandKnowledge("steamfoot", doc, now);
}
const rows = (table: "AiBrandRequest" | "AiButlerRequest" | "AiBrandDispatch" | "AiBrandHandoffAudit") => db.query<Record<string, unknown>>(`SELECT * FROM "${table}"`);
const request = (event: string, serviceId = "steamfoot", heldMicros = 100) => owners.reserve({ ...brandIdentity({ ...scope, principal: { kind: "BRAND", serviceId } }, event, secret), model: "gpt-6-luna", provider: "openai", heldMicros, now }, "TEST");

beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE steamfoot_ai_preview_20261125; CREATE TABLE "Store" (id text PRIMARY KEY); CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz);');
  for (const file of ["preview-install.sql", "preview-routing.sql", "preview-handoff.sql"]) await db.exec(readFileSync(`scripts/sql/ai-digital-butler/${file}`, "utf8"));
  await db.exec(readFileSync("scripts/sql/ai-digital-butler/brand-owner-schema.draft.sql", "utf8"));
  database = { ...sql(db), transaction: work => db.transaction(tx => work(sql(tx))) };
  owners = new AiOwnerRepository(database, "BRAND"); stores = new AiButlerRepository(database);
}, 30_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("NETWORK_FORBIDDEN"); }));
  await db.exec('TRUNCATE "AiBrandRequest","AiBrandDispatch","AiBrandConversation","AiBrandSetting","AiBrandKnowledgeDocument","AiBrandHandoffAudit","AiBrandGrant","AiBrandService","AiButlerHandoffAudit","AiButlerRequest","AiButlerDispatch","AiButlerConversation","AiButlerSetting","StoreFeatureEntitlement","Store"; UPDATE "AiButlerControl" SET stopped=false; INSERT INTO "AiBrandService" VALUES (\'steamfoot\',\'合成品牌\'),(\'other\',\'另一品牌\'); INSERT INTO "AiBrandGrant" ("serviceId",status) VALUES (\'steamfoot\',\'ENABLED\'),(\'other\',\'ENABLED\');');
  for (const serviceId of ["steamfoot", "other"]) await owners.saveSetting(serviceId, { ...DEFAULT_AI_SETTING, enabled: true }, 0, now);
});

afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

it("answers with a brand principal and durable data, without creating any Store", async () => {
  const app = brand(), snapshot = await published(app);
  expect(await app.service.respond(scope, "first", "產品價格？", snapshot.records, { snapshot, reload: async () => snapshot })).toMatchObject({ outcome: "ANSWER", text: draft.faqs[0].answer, sourceIds: [snapshot.records[0].id] });
  expect((await db.query('SELECT * FROM "Store"')).rows).toHaveLength(0);
  expect((await rows("AiBrandRequest")).rows).toHaveLength(1); expect((await rows("AiButlerRequest")).rows).toHaveLength(0);
});
it("preserves Store HMAC keys and separates identical Store/Brand owner IDs, actor and OA", () => {
  const hash = (parts: string[]) => createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
  const scopeKey = hash([storeScope.storeId, storeScope.channel, storeScope.channelAccountId, storeScope.actorId]);
  expect(aiIdentity(storeScope, "same", secret)).toEqual({ storeId: "steamfoot", scopeKey, eventKey: hash([scopeKey, "same"]) });
  const identities = [scope, { ...scope, actorId: "other" }, { ...scope, channelAccountId: "other" }, { ...scope, principal: { kind: "BRAND" as const, serviceId: "other" } }].map(s => brandIdentity(s, "same", secret).eventKey);
  expect(new Set([...identities, aiIdentity(storeScope, "same", secret).eventKey]).size).toBe(5);
});
it.each(["storeId", "module", "customerId", "serviceMode"])("rejects mixed brand scope %s before provider or persistence", async key => {
  const respond = vi.fn(), app = brand({ kind: "mock", respond });
  expect(await app.service.respond({ ...scope, [key]: "forged" }, "x", "產品價格？", [])).toMatchObject({ outcome: "STOPPED" });
  expect(respond).not.toHaveBeenCalled(); expect((await rows("AiBrandRequest")).rows).toHaveLength(0);
});
it("rejects principal smuggling through the legacy Store facade", () => {
  expect(() => aiIdentity(Object.assign({}, storeScope, { principal: scope.principal }), "event", secret)).toThrow("SCOPE");
});
it("never publishes BRAND knowledge into SYSTEM or another brand or Store", async () => {
  const snapshot = await published();
  expect(selectBrandKnowledge({ ...scope, principal: { kind: "BRAND", serviceId: "other" } }, snapshot.records, now)).toEqual([]);
  expect(() => selectAiKnowledge("steamfoot", "STEAMFOOT", snapshot.records, now)).toThrow();
  expect(() => selectAiKnowledge("steamfoot", "STEAMFOOT", [{ ...snapshot.records[0], scope: "SYSTEM", storeId: null, module: null }], now)).toThrow();
  expect(() => selectBrandKnowledge(scope, syntheticAiKnowledge("x", "STEAMFOOT", now), now)).toThrow();
});
it.each(["hours", "services", "prices"])("brand draft forbids operational reference %s", async key => {
  await expect(brand().knowledge.change(0, "save", { ...draft, references: { ...draft.references, [key]: true } }, now)).rejects.toThrow("OPERATIONAL_REFERENCE");
  expect((await brand().knowledge.read()).revision).toBe(0);
});
it("knowledge versions, withdrawal, optimistic conflicts and owner documents are independent", async () => {
  const app = brand(); await published(app);
  await expect(app.knowledge.change(1, "withdraw", undefined, now)).rejects.toThrow("CONFLICT");
  expect((await brand(undefined, { serviceId: "other" }).knowledge.read()).published).toBeNull();
  const withdrawn = await app.knowledge.change(2, "withdraw", undefined, now);
  expect(projectBrandKnowledge("steamfoot", withdrawn, now).records).toEqual([]);
});
it("withdrawal during the provider await suppresses stale approved text", async () => {
  const mock = new MockAiProvider();
  const app = brand({ kind: "mock", respond: async input => { await app.knowledge.change(2, "withdraw", undefined, now); return mock.respond(input); } });
  const snapshot = await published(app);
  expect(await app.service.respond(scope, "stale", "產品價格？", snapshot.records, { snapshot, reload: async () => projectBrandKnowledge("steamfoot", await app.knowledge.read(), now) })).toMatchObject({ outcome: "HANDOFF", sourceIds: [] });
});
it.each(["HIDDEN", "LOCKED"])("HQ %s independently denies brand AI while Store remains usable", async status => {
  await db.query('UPDATE "AiBrandGrant" SET status=$1 WHERE "serviceId"=\'steamfoot\'', [status]);
  await expect(request("x")).rejects.toThrow("NOT_ENTITLED");
  await db.exec('INSERT INTO "Store" VALUES (\'steamfoot\'); INSERT INTO "StoreFeatureEntitlement" VALUES (\'steamfoot\',\'ai_digital_butler\',\'ENABLED\',NULL,NULL);');
  await stores.saveSetting("steamfoot", { ...DEFAULT_AI_SETTING, enabled: true }, 0, now);
  const service = new AiButlerService(stores, new MockAiProvider(), async () => {}, secret, () => null, () => true, () => now);
  expect(await service.respond(storeScope, "x", "營業時間？", syntheticAiKnowledge("steamfoot", "STEAMFOOT", now))).toMatchObject({ outcome: "ANSWER" });
});
it("one brand being disabled does not disable another owner", async () => {
  await owners.saveSetting("steamfoot", DEFAULT_AI_SETTING, 1, now);
  await expect(request("x")).rejects.toThrow("DISABLED"); await expect(request("x", "other")).resolves.toMatchObject({ duplicate: false });
});
it.each(["expired", "future"])("brand grant %s fails closed", async state => {
  await db.query(`UPDATE "AiBrandGrant" SET ${state === "expired" ? '"expiresAt"' : '"startsAt"'}=$1 WHERE "serviceId"='steamfoot'`, [new Date(now.getTime() + (state === "expired" ? -1 : 1))]);
  await expect(request("x")).rejects.toThrow("NOT_ENTITLED");
});
it("budget and per-owner daily ceilings cannot be bypassed through a second principal", async () => {
  await owners.saveSetting("steamfoot", { ...DEFAULT_AI_SETTING, enabled: true, monthlyBudgetMicros: 50 }, 1, now);
  await expect(request("x")).rejects.toThrow("BUDGET_EXCEEDED"); await request("x", "other");
  expect((await owners.usage("steamfoot", now)).requests).toBe("0"); expect((await owners.usage("other", now)).requests).toBe("1");
});
it("both modes share the lifetime global budget and concurrency lock", async () => {
  await db.exec('INSERT INTO "Store" VALUES (\'steamfoot\'); INSERT INTO "StoreFeatureEntitlement" VALUES (\'steamfoot\',\'ai_digital_butler\',\'ENABLED\',NULL,NULL);');
  await stores.saveSetting("steamfoot", { ...DEFAULT_AI_SETTING, enabled: true }, 0, now);
  await request("brand-1"); await request("brand-2", "other");
  const reserveStore = () => stores.reserve({ ...aiIdentity(storeScope, "s", secret), model: "gpt-6-luna", heldMicros: 1, provider: "openai", now }, "TEST");
  await expect(reserveStore()).rejects.toThrow("CONCURRENCY_LIMIT");
  await db.exec('UPDATE "AiBrandRequest" SET status=\'UNKNOWN\',"heldMicros"=10000000');
  await expect(reserveStore()).rejects.toThrow("BUDGET_EXCEEDED");
  await db.exec('UPDATE "AiBrandRequest" SET "heldMicros"=0; INSERT INTO "AiButlerRequest" ("storeId","eventKey","scopeKey",provider,model,status,"heldMicros","createdAt") VALUES (\'steamfoot\',\'legacy\',\'legacy\',\'openai\',\'gpt-6-luna\',\'UNKNOWN\',20000000,CURRENT_TIMESTAMP)');
  await expect(request("brand-new")).rejects.toThrow("BUDGET_EXCEEDED");
});
it("default adapter remains stopped and LINE is not enabled even with a TEST entitlement", async () => {
  const respond = vi.fn(), app = brand({ kind: "mock", respond }, { enabled: undefined });
  expect(await app.service.respond(scope, "off", "產品價格？", [])).toMatchObject({ outcome: "STOPPED" });
  expect(await brand({ kind: "mock", respond }).service.respond({ ...scope, channel: "LINE" }, "line", "產品價格？", [])).toMatchObject({ outcome: "STOPPED" });
  expect(respond).not.toHaveBeenCalled();
});
it("rechecks global stop, grant and human takeover after await", async () => {
  for (const change of ["stop", "grant", "human"] as const) {
    const localScope = { ...scope, actorId: change };
    const snapshot = projectBrandKnowledge("steamfoot", { draft, published: draft, revision: 2, publishedVersion: 1, publishedAt: now.toISOString() }, now);
    const mock = new MockAiProvider();
    const app = brand({ kind: "mock", respond: async input => {
      if (change === "stop") await db.exec('UPDATE "AiButlerControl" SET stopped=true');
      if (change === "grant") await db.exec('UPDATE "AiBrandGrant" SET status=\'LOCKED\' WHERE "serviceId"=\'steamfoot\'');
      if (change === "human") await owners.handoff(brandIdentity(localScope, change, secret), true, now);
      return mock.respond(input);
    } });
    expect(await app.service.respond(localScope, change, "產品價格？", snapshot.records)).toMatchObject({ outcome: change === "grant" ? "HANDOFF" : "STOPPED" });
    await db.exec('UPDATE "AiButlerControl" SET stopped=false; UPDATE "AiBrandGrant" SET status=\'ENABLED\'');
  }
});
it("retains unknown API reservations, handoff and dedup across fresh adapter instances", async () => {
  const respond = vi.fn(async () => { throw Error("ambiguous transport"); });
  const app = brand({ kind: "openai", respond }), snapshot = await published(app);
  expect(await app.service.respond(scope, "unknown", "產品價格？", snapshot.records)).toMatchObject({ outcome: "HANDOFF" });
  expect(await brand({ kind: "openai", respond }).service.respond(scope, "unknown", "產品價格？", snapshot.records)).toMatchObject({ outcome: "DUPLICATE" });
  const request = (await rows("AiBrandRequest")).rows[0]; expect(request.status).toBe("UNKNOWN"); expect(Number(request.heldMicros)).toBe(AI_LIMITS.maxInputTokens + AI_LIMITS.maxOutputTokens);
  const page = await brand().handoff.list(); expect(page.rows[0].needsReview).toBe(true); expect(respond).toHaveBeenCalledTimes(1);
  await expect(app.handoff.resume({ scopeKey: page.rows[0].scopeKey, revision: page.rows[0].revision, actorKey: "a".repeat(64), commandKey: "b".repeat(64) }, now, async () => {})).rejects.toThrow("REVIEW_REQUIRED");
});
it("brand cannot invoke operational tools even when a caller adds forged Store credentials", async () => {
  const authorize = vi.fn(), execute = vi.fn(), tools = new AiToolRegistry();
  tools.register({ name: "availability", module: "STEAMFOOT", mode: "READ", parameters: z.object({}).strict(), authorize, execute });
  await expect(tools.invoke(Object.assign({}, storeScope, { principal: scope.principal }), { name: "availability", arguments: {} }, "READ_ONLY")).rejects.toThrow("NOT_AUTHORIZED");
  expect(authorize).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
it("management permissions are explicit and cannot be replaced by consumer authorization", async () => {
  const deny = vi.fn(async () => { throw Error("BRAND_OPERATOR_DENIED"); });
  const app = brand(undefined, { authorizeOperator: deny });
  await expect(app.knowledge.read()).rejects.toThrow("OPERATOR_DENIED");
  await expect(app.knowledge.change(0, "save", draft, now)).rejects.toThrow("OPERATOR_DENIED");
  await expect(app.settings.read()).rejects.toThrow("OPERATOR_DENIED");
  await expect(app.handoff.list()).rejects.toThrow("OPERATOR_DENIED");
  expect((await db.query('SELECT * FROM "AiBrandKnowledgeDocument"')).rows).toHaveLength(0);
});
it("frozen principal snapshot prevents a caller from changing owners during authorization", async () => {
  const mutable = structuredClone(scope), app = brand(undefined, { authorize: async () => { mutable.principal.serviceId = "other"; mutable.actorId = "forged"; } }), snapshot = await published(app);
  expect(await app.service.respond(mutable, "immutable", "產品價格？", snapshot.records)).toMatchObject({ outcome: "ANSWER" });
  expect((await rows("AiBrandRequest")).rows[0]).toMatchObject({ serviceId: "steamfoot", scopeKey: brandIdentity(scope, "immutable", secret).scopeKey });
});
it("real Responses parser is reusable with a fake transport, without real credentials or network", async () => {
  const snapshot = await published();
  const transport = vi.fn(async (_url, options) => {
    const body = JSON.parse(String(options?.body)); expect(body.store).toBe(false); expect(body.tools).toBeUndefined();
    expect(body.input[0].content).not.toContain('"serviceId"'); expect(body.input[0].content).not.toContain('"storeId"');
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ action: "answer", sourceIds: [snapshot.records[0].id] }) }] }], usage: { input_tokens: 100, output_tokens: 20 } }));
  }) as unknown as typeof fetch;
  expect(await brand(new OpenAiResponsesProvider("offline-not-a-key", transport)).service.respond(scope, "parser", "產品價格？", snapshot.records)).toMatchObject({ outcome: "ANSWER" });
  expect(transport).toHaveBeenCalledTimes(1); expect((await owners.usage("steamfoot", now)).reservedMicros).toBe("120");
});
it("routing preserves original priority, durable handoff, replay and audited resume", async () => {
  const provider = new MockAiProvider(), respond = vi.fn(provider.respond.bind(provider)), app = brand({ kind: "mock", respond }), snapshot = await published(app);
  const run = (event: string, text = "產品價格？", handled = false) => app.routing.respond(scope, event, "brand-test", text, {
    authorize: async () => {}, original: async () => ({ handled, outcome: handled ? "MATCHED" : "NO_MATCH", messages: handled ? [{ type: "text", text: "既有流程" }] : [] }) as DigitalButlerRuntimeResult,
    originalReplyAllowed: async () => true, ai: (message, conversationRevision) => app.service.respond(scope, event, message, snapshot.records, { snapshot, reload: async () => snapshot, conversationRevision }), providerCalls: () => respond.mock.calls.length,
  });
  expect(await run("original", "操作指南", true)).toMatchObject({ route: "ORIGINAL", text: "既有流程" }); expect(respond).not.toHaveBeenCalled();
  expect(await run("answer")).toMatchObject({ route: "AI" }); expect(await run("answer")).toMatchObject({ route: "DUPLICATE" }); expect(respond).toHaveBeenCalledTimes(1);
  expect(await run("human", "真人客服")).toMatchObject({ route: "HUMAN" });
  const next = brand(); expect((await next.handoff.list()).total).toBe(1);
  expect(await run("silent")).toMatchObject({ route: "SILENT", outcome: "HUMAN_ACTIVE" }); expect(respond).toHaveBeenCalledTimes(1);
  const page = await next.handoff.list(), command = { scopeKey: page.rows[0].scopeKey, revision: page.rows[0].revision, actorKey: "a".repeat(64), commandKey: "b".repeat(64) };
  expect(await next.handoff.resume(command, now, async () => {})).toMatchObject({ duplicate: false });
  expect(await next.handoff.resume(command, now, async () => {})).toMatchObject({ duplicate: true });
  expect((await rows("AiBrandHandoffAudit")).rows).toHaveLength(1);
  expect(await run("resumed")).toMatchObject({ route: "AI" });
});
it("brand runtime cannot fall back to a Store when its schema is absent", async () => {
  await db.exec('ALTER TABLE "AiBrandSetting" RENAME TO "AiBrandSettingAbsent"');
  try { expect(await brand().service.respond(scope, "missing", "產品價格？", [])).toMatchObject({ outcome: "STOPPED" }); }
  finally { await db.exec('ALTER TABLE "AiBrandSettingAbsent" RENAME TO "AiBrandSetting"'); }
  expect((await rows("AiButlerRequest")).rows).toHaveLength(0);
});
it("new Brand tables are private and have no operational Store foreign keys", async () => {
  const tables = await db.query<{ tablename: string; rowsecurity: boolean }>("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'AiBrand%'");
  expect(tables.rows).toHaveLength(8); expect(tables.rows.every(row => row.rowsecurity)).toBe(true);
  const foreign = await db.query<{ target: string }>("SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text LIKE '%AiBrand%'");
  expect(foreign.rows.every(row => row.target === '"AiBrandService"')).toBe(true);
  await db.exec('SET ROLE anon');
  try { await expect(db.query('SELECT * FROM "AiBrandKnowledgeDocument"')).rejects.toThrow("permission denied"); }
  finally { await db.exec('RESET ROLE'); }
});
it("a bound brand adapter rejects another principal before model access", async () => {
  const respond = vi.fn();
  expect(await brand({ kind: "mock", respond }).service.respond({ ...scope, principal: { kind: "BRAND", serviceId: "other" } }, "foreign", "產品價格？", [])).toMatchObject({ outcome: "STOPPED" });
  expect(respond).not.toHaveBeenCalled(); expect((await rows("AiBrandRequest")).rows).toHaveLength(0);
});
it("brand daily usage is retained when the adapter is recreated", async () => {
  await owners.saveSetting("steamfoot", { ...DEFAULT_AI_SETTING, enabled: true, dailyRequests: 1 }, 1, now);
  const first = brand(), snapshot = await published(first);
  expect(await first.service.respond(scope, "first", "產品價格？", snapshot.records)).toMatchObject({ outcome: "ANSWER" });
  expect(await brand().service.respond(scope, "second", "產品價格？", snapshot.records)).toMatchObject({ outcome: "STOPPED" });
  await expect(request("independent", "other")).resolves.toMatchObject({ duplicate: false });
});
it("provider usage overrun stops both modes through the same emergency control", async () => {
  const snapshot = await published();
  const app = brand({ kind: "mock", respond: async () => ({ answer: { action: "answer", sourceIds: [snapshot.records[0].id] }, inputTokens: AI_LIMITS.maxInputTokens + 1, outputTokens: 1 }) });
  expect(await app.service.respond(scope, "overrun", "產品價格？", snapshot.records)).toMatchObject({ outcome: "STOPPED" });
  expect((await db.query<{ stopped: boolean }>('SELECT stopped FROM "AiButlerControl"')).rows[0].stopped).toBe(true);
  expect((await rows("AiBrandRequest")).rows[0]).toMatchObject({ status: "SUPPRESSED", outcome: "TOKEN_OR_COST_OVERRUN" });
  await expect(request("other", "other")).rejects.toThrow("GLOBAL_STOPPED");
});
it("an installed but unreadable peer ledger cannot silently bypass the global cap", async () => {
  await db.exec('INSERT INTO "Store" VALUES (\'steamfoot\'); INSERT INTO "StoreFeatureEntitlement" VALUES (\'steamfoot\',\'ai_digital_butler\',\'ENABLED\',NULL,NULL);');
  await stores.saveSetting("steamfoot", { ...DEFAULT_AI_SETTING, enabled: true }, 0, now);
  const denying = (tx: AiSql): AiSql => ({ query: (text, values) => {
    if (text.includes("ai_owner_peer_totals")) throw Error("PEER_ACCESS_DENIED");
    return tx.query(text, values);
  } });
  const restricted: AiDatabase = { ...denying(database), transaction: work => database.transaction(tx => work(denying(tx))) };
  const repo = new AiButlerRepository(restricted);
  await expect(repo.reserve({ ...aiIdentity(storeScope, "denied", secret), model: "gpt-6-luna", provider: "openai", heldMicros: 1, now }, "TEST")).rejects.toThrow("PEER_ACCESS_DENIED");
  expect((await rows("AiButlerRequest")).rows).toHaveLength(0);
});

it("the global-cost capability sees RLS-hidden peers without granting operational row access", async () => {
  await request("hidden-cost", "other", 123);
  await db.exec('CREATE ROLE brand_cost_reader; GRANT USAGE ON SCHEMA public TO brand_cost_reader; GRANT EXECUTE ON FUNCTION public.ai_owner_peer_totals(text) TO brand_cost_reader; SET ROLE brand_cost_reader');
  try {
    await expect(db.query('SELECT * FROM "AiBrandRequest"')).rejects.toThrow("permission denied");
    const aggregate = await db.query<{ total: string; concurrent: string }>("SELECT * FROM public.ai_owner_peer_totals('STORE')");
    expect(aggregate.rows).toEqual([{ total: "123", concurrent: "1" }]);
    await expect(db.query("SELECT * FROM public.ai_owner_peer_totals('INVALID')")).rejects.toThrow("AI_OWNER_INVALID");
  } finally { await db.exec('RESET ROLE'); }
});
