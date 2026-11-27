import "server-only";
import { createHash } from "node:crypto";
import { knowledgeSchema, type AiKnowledge, type AiModule } from "./contracts";
import type { AiKnowledgeDocument } from "./knowledge-document";

export type AiKnowledgeSnapshot = { module: AiModule; records: AiKnowledge[]; prohibitedTerms: string[]; fingerprint: string };
export type AiAuthority = { module: AiModule; hours: string | null; services: string | null; prices: string | null };
const digest = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
/** Pure projection: reference values are read fresh, never copied into manual knowledge. */
export function projectAiKnowledge(storeId: string, document: AiKnowledgeDocument, authority: AiAuthority, now: Date): AiKnowledgeSnapshot {
  const published = document.published;
  const facts: { key: string; question: string; answer: string }[] = [];
  if (published) {
    if (published.introduction) facts.push({ key: "intro", question: "請介紹店家", answer: published.introduction });
    published.faqs.forEach((faq, i) => facts.push({ key: `faq${i}`, ...faq }));
    for (const key of ["hours", "services", "prices"] as const) if (published.references[key]) {
      const answer = authority[key];
      if (!answer) throw new Error("AI_REFERENCE_UNAVAILABLE");
      facts.push({ key, question: { hours: "今天的營業時間？", services: "有哪些服務？", prices: "公開方案的價格？" }[key], answer });
    }
  }
  const fingerprint = digest([document.publishedVersion, published, authority.module, facts]);
  const records = facts.map(fact => knowledgeSchema.parse({ id: `kb-${document.publishedVersion}-${fact.key}-${digest(fact).slice(0,16)}`, version: document.publishedVersion,
    scope: "STORE", storeId, module: authority.module, status: "PUBLISHED", question: fact.question, answer: fact.answer,
    updatedAt: document.publishedAt, expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString() }));
  return { module: authority.module, records, prohibitedTerms: published?.prohibitedTerms ?? [], fingerprint };
}
