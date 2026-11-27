import { z } from "zod";

/** Shared form contract; operational values are never saved in the knowledge document. */
export const aiKnowledgeDraftSchema = z.object({
  introduction: z.string().trim().max(600),
  faqs: z.array(z.object({ question: z.string().trim().min(1).max(120), answer: z.string().trim().min(1).max(600) }).strict()).max(6),
  prohibitedTerms: z.array(z.string().trim().max(40)).max(20).transform(terms => terms.filter(Boolean)),
  references: z.object({ hours: z.boolean(), services: z.boolean(), prices: z.boolean() }).strict(),
}).strict().superRefine((doc, ctx) => {
  // A Unicode-safe bound usable in the browser; leaves space for references and protocol.
  if (new TextEncoder().encode(JSON.stringify(doc)).length > 3200)
    ctx.addIssue({ code: "custom", message: "介紹、FAQ 與禁止事項合計過長，請精簡內容（最多 3,200 UTF-8 bytes）。" });
  if (new Set(doc.faqs.map(f => f.question.normalize("NFKC").toLowerCase())).size !== doc.faqs.length)
    ctx.addIssue({ code: "custom", message: "FAQ 問題不可重複。" });
});
export type AiKnowledgeDraft = z.infer<typeof aiKnowledgeDraftSchema>;
export type AiKnowledgeDocument = { draft: AiKnowledgeDraft; published: AiKnowledgeDraft | null; revision: number; publishedVersion: number; publishedAt: string | null };
export const EMPTY_AI_KNOWLEDGE: AiKnowledgeDraft = { introduction: "", faqs: [], prohibitedTerms: [], references: { hours: false, services: false, prices: false } };
export function aiTopicBlocked(message: string, terms: string[]) {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
  const text = normalize(message);
  return terms.some(term => text.includes(normalize(term)));
}

/** Always-on request guard. Store policy can add restrictions, never enable protected actions. */
export function aiProtectedRequest(message: string) {
  const normalized = message.normalize("NFKC").replace(/\s+/gu, "");
  return /退款|退費|個資|會員資料|會員權益|剩幾堂|剩餘堂數|剩餘點數|即時時段|預約名額|幫我預約|幫我取消|忽略.{0,8}規則|refund|personaldata|ignore.{0,12}instructions/i.test(normalized);
}
