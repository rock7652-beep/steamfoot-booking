import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AiButlerRepository, type AiSql, type AiDatabase } from "@/server/ai/repository";
import { AiRoutingRepository } from "@/server/ai/routing-repository";
import { AiButlerService, aiIdentity, type TrustedAiScope } from "@/server/ai/service";
import { AiLineWebhook, verifyAiLineEvents, type AiLineWebhookPorts } from "@/server/ai/line-webhook";
import { resolveAiLineMember } from "@/server/ai/line-member";
import { syntheticAiKnowledge } from "@/server/ai/knowledge";
import { MockAiProvider, type AiProvider } from "@/server/ai/provider";
import { DEFAULT_AI_SETTING } from "@/server/ai/contracts";
vi.mock("@/lib/line-config", () => ({}));
const now = new Date("2026-11-26T08:00:00Z"), secret = "offline-http-ai-identity-only-".repeat(2);
const binding = { storeId: "ai-preview-beauty", destination: `U${"2".repeat(32)}`, secret: "offline-oa-channel-secret" };
const scope: TrustedAiScope = { storeId: binding.storeId, channelAccountId: binding.destination, actorId: `U${"a".repeat(32)}`, channel: "LINE", module: "BEAUTY" };
let db: PGlite, repository: AiButlerRepository, receipts: AiRoutingRepository, webhook: AiLineWebhook;
let calls = 0, authorized = true;
const network = vi.fn(() => { throw new Error("NETWORK_FORBIDDEN"); });
const original = vi.fn(async () => ({ handled: false, messages: [] as { type: "text"; text: string }[], outcome: "NO_MATCH" }));
const authorize = async () => { if (!authorized) throw new Error("FORBIDDEN"); return { scope, subject: { kind: "GUEST" as const } }; };
let onProvider: (() => Promise<void>) | undefined;
let providerKind: AiProvider["kind"] = "mock";
function event(extra: Record<string, unknown> = {}) {
  return { type: "message", mode: "active", webhookEventId: "event-1", timestamp: now.getTime(), source: { type: "user", userId: scope.actorId }, message: { type: "text", id: "message-1", text: "營業時間？" }, ...extra };
}
function signed(events: unknown[] = [event()]) {
  const body = JSON.stringify({ destination: binding.destination, events });
  return { body, signature: createHmac("sha256", binding.secret).update(body).digest("base64") };
}
const ports: AiLineWebhookPorts = {
  authorize,
  routing: (e, s) => {
    let eventCalls = 0;
    const provider: AiProvider = { kind: providerKind, respond: async input => { calls++; eventCalls++; await onProvider?.(); return new MockAiProvider().respond(input); } };
    const service = new AiButlerService(repository, provider, async () => { await authorize(); }, secret,
      () => providerKind === "mock" ? null : { inputMicrosPerToken: 1, outputMicrosPerToken: 1, responses: true, jsonSchema: true, verifiedAt: "2026-11-26T00:00:00Z", validUntil: "2026-11-27T00:00:00Z", source: "https://developers.openai.com/api/docs/models/gpt-6-luna" }, () => true, () => now, ["LINE"]);
    return { authorize: async () => { await authorize(); }, original, originalReplyAllowed: async () => true, providerCalls: () => eventCalls,
      ai: (text, conversationRevision) => service.respond(s, e.webhookEventId, text, syntheticAiKnowledge(s.storeId, s.module, now), { conversationRevision, snapshot: { records: syntheticAiKnowledge(s.storeId, s.module, now), module: s.module, fingerprint: "published", prohibitedTerms: [] }, reload: async () => ({ records: syntheticAiKnowledge(s.storeId, s.module, now), module: s.module, fingerprint: "published", prohibitedTerms: [] }) }) };
  },
};
async function run(events?: unknown[], p = ports) { const request = signed(events); return webhook.handle(request.body, request.signature, binding, p); }
const rows = async (table: string) => (await db.query<Record<string, unknown>>(`SELECT * FROM "${table}"`)).rows;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE steamfoot_ai_preview_20261125;CREATE TABLE "Store" (id text PRIMARY KEY);CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz);');
  await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-install.sql", "utf8"));
  await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-routing.sql", "utf8"));
  for (const store of [scope.storeId, "ai-preview-steamfoot"]) { await db.query('INSERT INTO "Store" VALUES ($1)', [store]); await db.query('INSERT INTO "StoreFeatureEntitlement" VALUES ($1,\'ai_digital_butler\',\'ENABLED\',NULL,NULL)', [store]); }
  const adapt = (client: Pick<PGlite, "query">): AiSql => ({ query: async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => (await client.query<T>(sql, values)).rows });
  const database: AiDatabase = { ...adapt(db), transaction: work => db.transaction(tx => work(adapt(tx))) };
  repository = new AiButlerRepository(database); receipts = new AiRoutingRepository(database); webhook = new AiLineWebhook(receipts, repository, secret, () => now);
}, 30_000);
beforeEach(async () => {
  calls = 0; authorized = true; onProvider = undefined; providerKind = "mock";
  original.mockReset().mockResolvedValue({ handled: false, messages: [], outcome: "NO_MATCH" }); network.mockClear(); vi.stubGlobal("fetch", network);
  await db.exec('TRUNCATE "AiButlerDispatch","AiButlerConversation","AiButlerRequest","AiButlerSetting";UPDATE "AiButlerControl" SET stopped=false;UPDATE "StoreFeatureEntitlement" SET status=\'ENABLED\'');
  for (const store of [scope.storeId, "ai-preview-steamfoot"]) await repository.saveSetting(store, { ...DEFAULT_AI_SETTING, enabled: true }, 0, now);
  // LINE channel is installed only in this local engine, never on Preview/Production.
  await db.query('UPDATE "AiButlerSetting" SET setting=jsonb_set(setting,\'{channels}\',\'["LINE"]\') WHERE "storeId"=$1', [scope.storeId]);
});
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => db.close());
it("runs signed HTTP input through the actual routing/service/ledger and records one blocked delivery", async () => {
  expect(await run()).toMatchObject({ results: [{ route: "AI", outcome: "AI_ANSWER", providerCalls: 1, identity: "GUEST", delivery: "OUTBOUND_BLOCKED" }] });
  expect(await rows("AiButlerRequest")).toHaveLength(1);
  expect((await rows("AiButlerDispatch")).filter(row => row.outcome === "OUTBOUND_BLOCKED")).toHaveLength(1);
});
it.each(["event", "message", "both"])("deduplicates %s identity independently, including concurrent redelivery", async mode => {
  await run();
  const duplicate = event({ webhookEventId: mode === "message" ? "new-event" : "event-1", message: { type: "text", id: mode === "event" ? "new-message" : "message-1", text: "營業時間？" } });
  const result = await Promise.all([run([duplicate]), run([duplicate])]);
  expect(result.every(r => r.results[0].providerCalls === 0)).toBe(true); expect(calls).toBe(1);
  expect(await rows("AiButlerRequest")).toHaveLength(1);
  expect((await rows("AiButlerDispatch")).filter(row => row.outcome === "OUTBOUND_BLOCKED")).toHaveLength(1);
});
it("claims concurrent first delivery atomically", async () => { await Promise.all([run(), run()]); expect(calls).toBe(1); });
it.each(["", "wrong"])("rejects signature %j without authorization or ledger writes", async signature => {
  const r = signed(); await expect(webhook.handle(r.body, signature, binding, ports)).rejects.toThrow("SIGNATURE"); expect(await rows("AiButlerDispatch")).toHaveLength(0);
});
it("rejects byte mutation and another destination even with its own valid HMAC", () => {
  const r = signed(); expect(() => verifyAiLineEvents(r.body + " ", r.signature, binding, now)).toThrow();
  const body = r.body.replace(binding.destination, `U${"1".repeat(32)}`);
  expect(() => verifyAiLineEvents(body, createHmac("sha256", binding.secret).update(body).digest("base64"), binding, now)).toThrow("DESTINATION");
});
it.each([{ source: { type: "group", userId: scope.actorId } }, { mode: "standby" }, { timestamp: now.getTime() - 300_001 }, { timestamp: now.getTime() + 30_001 }, { type: "follow" }, { message: { type: "image" } }])("ignores unsupported/stale event %# without writes", async extra => { expect((await run([event(extra)])).results).toHaveLength(0); expect(await rows("AiButlerDispatch")).toHaveLength(0); });
it("accepts a signed empty verification batch", async () => { expect(await run([])).toEqual({ received: true, results: [] }); });
it.each(["WAITING_INPUT", "INFORMATION_ANSWERED", "VALIDATION_FAILED"])("gives existing flow priority for %s", async outcome => {
  original.mockResolvedValue({ handled: true, messages: [{ type: "text", text: "原流程" }], outcome });
  expect((await run()).results[0]).toMatchObject({ route: "ORIGINAL", providerCalls: 0, delivery: "OUTBOUND_BLOCKED" }); expect(calls).toBe(0);
});
it("does not fall through an inactive/failed original flow to AI", async () => { original.mockResolvedValue({ handled: false, messages: [], outcome: "INACTIVE" }); expect((await run()).results[0]).toMatchObject({ route: "BLOCKED", outcome: "ORIGINAL_NOT_ELIGIBLE" }); expect(calls).toBe(0); });
it("persists human handoff across instances, events and original flows", async () => {
  await run([event({ message: { type: "text", id: "message-h", text: "轉真人" } })]);
  webhook = new AiLineWebhook(receipts, repository, secret, () => now);
  expect((await run([event({ webhookEventId: "next" })])).results[0]).toMatchObject({ route: "SILENT", outcome: "HUMAN_ACTIVE", providerCalls: 0 });
  expect(original).not.toHaveBeenCalled(); expect(calls).toBe(0);
});
it.each(["stop", "store-disabled", "hidden", "locked", "cap"])("blocks the provider under %s", async mode => {
  if (mode === "stop") await db.exec('UPDATE "AiButlerControl" SET stopped=true');
  if (mode === "store-disabled") await db.query('UPDATE "AiButlerSetting" SET setting=jsonb_set(setting,\'{enabled}\',\'false\') WHERE "storeId"=$1', [scope.storeId]);
  if (mode === "hidden" || mode === "locked") await db.query('UPDATE "StoreFeatureEntitlement" SET status=$2 WHERE "storeId"=$1', [scope.storeId, mode.toUpperCase()]);
  if (mode === "cap") { await db.query('UPDATE "AiButlerSetting" SET setting=jsonb_set(setting,\'{dailyRequests}\',\'1\') WHERE "storeId"=$1', [scope.storeId]); await run([event({ webhookEventId: "before", message: { type: "text", id: "before-m", text: "營業時間？" } })]); calls = 0; }
  expect((await run()).results[0].providerCalls).toBe(0); expect(calls).toBe(0);
});
it.each(["stop", "channel", "rights", "human"])("suppresses a late answer after %s changes during provider await", async mode => {
  onProvider = async () => {
    if (mode === "stop") await db.exec('UPDATE "AiButlerControl" SET stopped=true');
    if (mode === "channel") await db.query('UPDATE "AiButlerSetting" SET setting=jsonb_set(setting,\'{channels}\',\'["TEST"]\') WHERE "storeId"=$1', [scope.storeId]);
    if (mode === "rights") authorized = false;
    if (mode === "human") await repository.handoff(aiIdentity(scope, "operator", secret), true, now);
  };
  const result = await run(); expect(result.results[0].delivery).toBe("NO_REPLY"); expect(calls).toBe(1);
});
it("keeps another store's ledger and handoff independent", async () => {
  const other = { ...scope, storeId: "ai-preview-steamfoot", module: "STEAMFOOT" as const };
  const otherBinding = { ...binding, storeId: other.storeId };
  await repository.handoff(aiIdentity(scope, "operator", secret), true, now);
  const p: AiLineWebhookPorts = { authorize: async () => ({ scope: other, subject: { kind: "GUEST" } }), routing: (e,s) => ({ ...ports.routing(e,s), authorize: async () => undefined }) };
  const r = signed(); expect((await webhook.handle(r.body, r.signature, otherBinding, p)).results[0].outcome).not.toBe("HUMAN_ACTIVE");
  expect((await rows("AiButlerRequest")).every(row => row.storeId !== scope.storeId)).toBe(true);
});
it("rejects an authorization scope whose store differs from the signed binding", async () => { await expect(run(undefined, { ...ports, authorize: async () => ({ scope: { ...scope, storeId: "foreign" }, subject: { kind: "GUEST" } }) })).rejects.toThrow("SCOPE"); expect(await rows("AiButlerDispatch")).toHaveLength(0); });
it("checks actual reservation budgets for a provider without making a network request", async () => {
  providerKind = "openai";
  await db.query('UPDATE "AiButlerSetting" SET setting=jsonb_set(setting,\'{monthlyBudgetMicros}\',\'1\') WHERE "storeId"=$1', [scope.storeId]);
  expect((await run()).results[0].providerCalls).toBe(0); expect(calls).toBe(0);
});
it.each(["guest", "member", "suspended", "wrong-store", "wrong-user", "staff"])("reads %s identity without phone fallback or writes", async mode => {
  const account = vi.fn(async () => mode === "guest" ? null : { id: "u", role: mode === "staff" ? "OWNER" : "CUSTOMER", status: mode === "suspended" ? "SUSPENDED" : "ACTIVE" });
  const membership = vi.fn(async () => ({ userId: mode === "wrong-user" ? "other" : "u", storeId: mode === "wrong-store" ? "foreign" : scope.storeId, customerId: "c" }));
  const result = resolveAiLineMember(scope.storeId, "line-provider:901", scope.actorId, { account, membership });
  if (["suspended", "wrong-store", "wrong-user", "staff"].includes(mode)) await expect(result).rejects.toThrow();
  else expect(await result).toMatchObject({ kind: mode === "guest" ? "GUEST" : "MEMBER" });
  expect(account).toHaveBeenCalledWith("line-provider:901", scope.actorId);
});

it("preserves UNKNOWN admission after an interrupted original flow and never retries the provider", async () => {
  original.mockRejectedValue(new Error("interrupted"));
  expect((await run()).results[0]).toMatchObject({ outcome: "ROUTING_UNKNOWN", providerCalls: 0 });
  expect((await run()).results[0]).toMatchObject({ outcome: "RESULT_UNKNOWN", providerCalls: 0 });
  expect((await rows("AiButlerDispatch")).some(row => row.status === "UNKNOWN")).toBe(true);
});
it("default service capability continues to reject LINE without spending", async () => {
  const provider = { kind: "mock" as const, respond: vi.fn() };
  const restricted = new AiButlerService(repository, provider, async () => undefined, secret, () => null, () => true, () => now);
  expect(await restricted.respond(scope, "default", "hours", [])).toMatchObject({ outcome: "STOPPED" });
  expect(provider.respond).not.toHaveBeenCalled();
});
