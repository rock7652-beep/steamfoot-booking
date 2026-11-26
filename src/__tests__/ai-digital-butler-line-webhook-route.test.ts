import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import type { AiDatabase, AiSql } from "@/server/ai/repository";
const m = vi.hoisted(() => ({ database: null as AiDatabase | null, store: "ai-preview-beauty", user: "operator", denied: false, entitled: true, demo: true, configs: [] as Record<string, unknown>[] }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: async () => ({ id: m.store, isDemo: m.demo }) } } }));
vi.mock("@/lib/permissions", () => ({ requireWritablePermission: async () => { if (m.denied) throw new Error("FORBIDDEN"); return { id: m.user }; } }));
vi.mock("@/lib/store", () => ({ resolveWriteStoreId: async () => m.store }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: async () => { if (!m.entitled) throw new Error("NOT_ENTITLED"); } }));
vi.mock("@/lib/store-line-config", () => ({ readStoreLineConfigs: () => m.configs, getConfiguredStoreLine: () => null }));
vi.mock("@/lib/line-config", () => ({ getLineSecretForStore: () => "private-test-secret" }));
vi.mock("@/server/ai/database", () => ({ aiButlerDatabase: () => m.database! }));
vi.mock("@/server/ai/knowledge-sources", () => ({ readAiAuthority: async () => ({ module: "BEAUTY" }), loadAiPublishedKnowledge: async () => {
  const { syntheticAiKnowledge } = await import("@/server/ai/knowledge");
  return { module: "BEAUTY", records: syntheticAiKnowledge(m.store, "BEAUTY", new Date()), fingerprint: "published", prohibitedTerms: [] };
} }));
vi.mock("@/lib/digital-butler-entitlement", () => ({ requireDigitalButlerConversationActivation: async () => undefined }));
import { POST } from "@/app/api/line/webhook/route";
let db: PGlite;
const connection = "postgresql://steamfoot_ai_preview_20261125.ttworfzgwejdeolegkxl:test@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&sslaccept=strict";
const env = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/ai-digital-butler-core", VERCEL_PROJECT_ID: "prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR", VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", AI_DIGITAL_BUTLER_PREVIEW: "1", AI_EXTERNAL_DELIVERY_DISABLED: "1", DATABASE_URL: connection, DIRECT_URL: connection, BEAUTY_DATABASE_MODE: "legacy", BEAUTY_NOTIFICATIONS_ENABLED: "0", AI_IDENTITY_SECRET: "offline-http-only-key-".repeat(3), AI_DIGITAL_BUTLER_ENABLED: "1" };
function request(text = "營業時間？", extra: Record<string, string> = {}, sender = `U${"a".repeat(32)}`) {
  const body = JSON.stringify({ destination: `U${"2".repeat(32)}`, events: [{ type: "message", mode: "active", webhookEventId: "http-event", timestamp: Date.now(), source: { type: "user", userId: sender }, message: { type: "text", id: "http-message", text } }] });
  const signature = createHmac("sha256", "steamfoot-signed-line-fixture-only-not-an-oa-secret").update(body).digest("base64");
  return new Request("https://example.invalid/api/line/webhook", { method: "POST", body, headers: { "x-steamfoot-ai-fixture": "1", "x-line-signature": signature, ...extra } });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE steamfoot_ai_preview_20261125;CREATE TABLE "Store" (id text PRIMARY KEY);CREATE TABLE "StoreFeatureEntitlement" ("storeId" text,"featureKey" text,status text,"startsAt" timestamptz,"expiresAt" timestamptz);');
  await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-install.sql", "utf8")); await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-routing.sql", "utf8"));
  await db.exec('INSERT INTO "Store" VALUES (\'ai-preview-beauty\'); INSERT INTO "StoreFeatureEntitlement" VALUES (\'ai-preview-beauty\',\'ai_digital_butler\',\'ENABLED\',NULL,NULL)');
  const adapt = (client: Pick<PGlite, "query">): AiSql => ({ query: async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => (await client.query<T>(sql, values)).rows });
  m.database = { ...adapt(db), transaction: work => db.transaction(tx => work(adapt(tx))) };
}, 30_000);
beforeEach(async () => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubEnv("CF_PAGES_BRANCH", ""); vi.stubEnv("WORKERS_CI_BRANCH", ""); vi.stubEnv("PRODUCTION_MIGRATION_TARGET", "");
  vi.stubEnv("BEAUTY_DATABASE_URL", ""); vi.stubEnv("BEAUTY_DATABASE_PASSWORD", ""); vi.stubEnv("BEAUTY_DATABASE_ROLE", "");
  vi.stubEnv("ADDONS_DATABASE_URL", ""); vi.stubEnv("ADDONS_DATABASE_PASSWORD", ""); vi.stubEnv("ADDONS_DATABASE_ROLE", "");
  m.denied = false; m.entitled = true; m.demo = true; m.store = "ai-preview-beauty"; m.configs = [];
  await db.exec('TRUNCATE "AiButlerDispatch","AiButlerConversation","AiButlerRequest","AiButlerSetting"; UPDATE "AiButlerControl" SET stopped=false; INSERT INTO "AiButlerSetting" ("storeId",setting) VALUES (\'ai-preview-beauty\',\'{"enabled":true,"model":"gpt-6-luna","channels":["TEST"],"dailyRequests":20,"monthlyRequests":100,"monthlyBudgetMicros":1000000}\')');
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("NO_NETWORK_ALLOWED"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => db.close());
it("actual POST → authenticated fixture → signature → common core → blocked delivery", async () => {
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ results: [{ route: "AI", outcome: "AI_ANSWER", identity: "GUEST", delivery: "OUTBOUND_BLOCKED" }] });
  expect((await db.query('SELECT provider,status FROM "AiButlerRequest"')).rows).toEqual([{ provider: "mock", status: "COMPLETE" }]);
  expect((await (await POST(request())).json()).results[0].providerCalls).toBe(0);
});
it.each(["denied", "other-store", "other-actor", "invalid-signature", "free-question", "production-claim", "delivery-unlocked"])("rejects %s before paid provider/legacy writes", async mode => {
  if (mode === "denied") m.denied = true;
  if (mode === "other-store") m.store = "ai-preview-steamfoot";
  if (mode === "production-claim") vi.stubEnv("VERCEL_ENV", "production");
  if (mode === "delivery-unlocked") vi.stubEnv("AI_EXTERNAL_DELIVERY_DISABLED", "0");
  const response = await POST(request(mode === "free-question" ? "arbitrary-private-question" : "營業時間？", mode === "invalid-signature" ? { "x-line-signature": "invalid" } : {}, mode === "other-actor" ? `U${"b".repeat(32)}` : undefined));
  expect(response.status).toBe(403); expect((await db.query('SELECT * FROM "AiButlerRequest"')).rows).toHaveLength(0);
});
it("global stop blocks mock provider in the deployed HTTP code path", async () => {
  await db.exec('UPDATE "AiButlerControl" SET stopped=true');
  expect(await (await POST(request())).json()).toMatchObject({ results: [{ route: "BLOCKED", outcome: "STOPPED", providerCalls: 0, delivery: "NO_REPLY" }] });
});
it("keeps original matched flow before AI", async () => { expect(await (await POST(request("合成流程入口"))).json()).toMatchObject({ results: [{ route: "ORIGINAL", providerCalls: 0, delivery: "OUTBOUND_BLOCKED" }] }); });
it("rejects a public signed fixture without staff authentication", async () => { const r = request(); r.headers.delete("x-steamfoot-ai-fixture"); expect((await POST(r)).status).toBe(403); });
it("rejects shared OA ambiguity and oversized bodies", async () => {
  const r = request(); r.headers.delete("x-steamfoot-ai-fixture"); m.configs = [{ destination: `U${"2".repeat(32)}`, storeId: m.store }, { destination: `U${"2".repeat(32)}`, storeId: "ai-preview-music" }];
  expect((await POST(r)).status).toBe(403);
  expect((await POST(new Request("https://example.invalid/api/line/webhook", { method: "POST", headers: { "x-steamfoot-ai-fixture": "1" }, body: "x".repeat(65537) }))).status).toBe(403);
});

it.each(["HIDDEN", "LOCKED", "not-demo"])("blocks %s before admission or model requests", async state => {
  if (state === "not-demo") m.demo = false; else m.entitled = false;
  expect((await POST(request())).status).toBe(403);
  expect((await db.query('SELECT * FROM "AiButlerDispatch"')).rows).toHaveLength(0);
});
it("active original flow remains prior to AI on the HTTP path", async () => {
  expect(await (await POST(request("合成流程等待"))).json()).toMatchObject({ results: [{ route: "ORIGINAL", providerCalls: 0 }] });
});
