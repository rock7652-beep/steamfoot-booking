import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { AiKnowledgeRepository } from "@/server/ai/knowledge-repository";
import { aiKnowledgeDraftSchema, EMPTY_AI_KNOWLEDGE, aiTopicBlocked, type AiKnowledgeDocument } from "@/server/ai/knowledge-document";
import { projectAiKnowledge, type AiAuthority } from "@/server/ai/knowledge-projection";
import type { AiSql } from "@/server/ai/repository";
const now = new Date("2026-11-26T02:00:00Z"), store = "ai-preview-steamfoot";
const draft = { ...EMPTY_AI_KNOWLEDGE, introduction: "僅供合成測試的介紹。", faqs: [{ question: "停車方式？", answer: "請洽合成測試門市。" }], prohibitedTerms: ["醫療建議"] };
let db: PGlite, repo: AiKnowledgeRepository;
const adapter = (client: Pick<PGlite, "query">): AiSql => ({ query: async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => (await client.query<T>(sql, values)).rows });
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE steamfoot_ai_preview_20261125; CREATE TABLE "Store" (id text PRIMARY KEY); INSERT INTO "Store" VALUES (\'ai-preview-steamfoot\'),(\'ai-preview-beauty\'),(\'outsider\');');
  await db.exec(readFileSync("scripts/sql/ai-digital-butler/preview-knowledge.sql", "utf8").split("-- Read-only authority")[0]);
  repo = new AiKnowledgeRepository({ ...adapter(db), transaction: work => db.transaction(tx => work(adapter(tx))) });
}, 30_000);
afterAll(async () => db.close());
beforeEach(async () => db.exec('RESET ROLE; TRUNCATE "AiButlerKnowledgeDocument"'));
it("preserves the published snapshot while editing and withdraws without losing the draft", async () => {
  expect(await repo.read(store)).toMatchObject({ revision: 0, published: null });
  const saved = await repo.change(store, 0, "save", draft);
  expect(saved).toMatchObject({ revision: 1, published: null });
  expect(await repo.change(store, 1, "publish", undefined, now)).toMatchObject({ published: draft, publishedVersion: 1 });
  expect(await repo.change(store, 2, "save", { ...draft, introduction: "新草稿" })).toMatchObject({ draft: { introduction: "新草稿" }, published: draft });
  expect(await repo.change(store, 3, "withdraw")).toMatchObject({ published: null, publishedAt: null, draft: { introduction: "新草稿" }, publishedVersion: 2 });
});
it("rejects stale saves, duplicate publish and publish of another revision", async () => {
  await repo.change(store, 0, "save", draft);
  await expect(repo.change(store, 0, "save", { ...draft, introduction: "過期" })).rejects.toThrow("AI_KNOWLEDGE_CONFLICT");
  await repo.change(store, 1, "publish", undefined, now);
  await expect(repo.change(store, 1, "publish", undefined, now)).rejects.toThrow("AI_KNOWLEDGE_CONFLICT");
  expect((await repo.read(store)).draft).toEqual(draft);
  await expect(repo.change("ai-preview-beauty", 0, "publish")).rejects.toThrow("AI_KNOWLEDGE_EMPTY");
});
it("the restricted server role writes only private fixture knowledge, without Store UPDATE rights", async () => {
  await db.exec('SET ROLE steamfoot_ai_preview_20261125');
  await expect(repo.change(store, 0, "save", draft)).resolves.toMatchObject({ revision: 1 });
  await expect(repo.change("outsider", 0, "save", draft)).rejects.toThrow();
  expect(await repo.read("outsider")).toMatchObject({ revision: 0, published: null });
  await db.exec('RESET ROLE; SET ROLE anon');
  await expect(repo.read(store)).rejects.toThrow();
});
it("references are live and versioned; private/manual drafts never become facts", () => {
  const document: AiKnowledgeDocument = { draft, published: { ...draft, references: { hours: true, services: false, prices: true } }, revision: 2, publishedVersion: 1, publishedAt: now.toISOString() };
  const authority: AiAuthority = { module: "STEAMFOOT", hours: "今天 10:00–18:00", services: null, prices: "公開方案 NT$600" };
  const original = projectAiKnowledge(store, document, authority, now);
  const changed = projectAiKnowledge(store, document, { ...authority, prices: "公開方案 NT$700" }, now);
  expect(original.records).toHaveLength(4);
  expect(changed.fingerprint).not.toBe(original.fingerprint);
  expect(changed.records.find(r => r.question.includes("價格"))?.id).not.toBe(original.records.find(r => r.question.includes("價格"))?.id);
  expect(projectAiKnowledge(store, { ...document, draft: { ...draft, introduction: "秘密草稿" } }, authority, now).fingerprint).toBe(original.fingerprint);
  expect(() => projectAiKnowledge(store, document, { ...authority, prices: null }, now)).toThrow("AI_REFERENCE_UNAVAILABLE");
  expect(projectAiKnowledge(store, { ...document, published: null, publishedAt: null, publishedVersion: 2 }, authority, now).records).toEqual([]);
});
it("bounds public content, rejects injected scope, and uses literal normalized prohibitions", () => {
  expect(aiKnowledgeDraftSchema.safeParse({ ...draft, storeId: "foreign" }).success).toBe(false);
  expect(aiKnowledgeDraftSchema.safeParse({ ...draft, faqs: Array(7).fill(draft.faqs[0]) }).success).toBe(false);
  expect(aiKnowledgeDraftSchema.safeParse({ ...draft, faqs: [{ question: "a", answer: "文".repeat(600) }, { question: "b", answer: "文".repeat(600) }] }).success).toBe(false);
  expect(aiTopicBlocked("ＭＥＤ I CAL 建議", ["medical"])).toBe(true);
  expect(aiTopicBlocked("價格", [".*"])).toBe(false);
});
