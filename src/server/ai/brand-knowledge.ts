import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { knowledgeSchema } from "./contracts";
import { aiKnowledgeDraftSchema, type AiKnowledgeDocument } from "./knowledge-document";
import type { TrustedBrandScope } from "./principal";

export const brandKnowledgeSchema = knowledgeSchema.omit({ scope: true, storeId: true, module: true }).extend({
  scope: z.literal("BRAND"), serviceId: z.string().min(1).max(200),
}).strict();
export type AiBrandKnowledge = z.infer<typeof brandKnowledgeSchema>;
export type AiBrandSnapshot = { serviceId: string; records: AiBrandKnowledge[]; fingerprint: string; prohibitedTerms: string[] };
export function validateBrandDraft(input: unknown) {
  const draft = aiKnowledgeDraftSchema.parse(input);
  if (Object.values(draft.references).some(Boolean)) throw new Error("AI_BRAND_OPERATIONAL_REFERENCE_FORBIDDEN");
  return draft;
}
export function selectBrandKnowledge(scope: TrustedBrandScope, records: unknown[], now: Date) {
  const selected = records.map(row => brandKnowledgeSchema.parse(row)).filter(row => row.serviceId === scope.principal.serviceId
    && row.status === "PUBLISHED" && Date.parse(row.updatedAt) <= now.getTime() && Date.parse(row.expiresAt) > now.getTime());
  if (selected.length > 12 || new Set(selected.map(row => row.id)).size !== selected.length) throw new Error("AI_KNOWLEDGE_INVALID");
  return selected;
}
/** No Store sources are queried. Draft/editor contract is shared with the existing workspace. */
export function projectBrandKnowledge(serviceId: string, document: AiKnowledgeDocument, now: Date): AiBrandSnapshot {
  const draft = document.published ? validateBrandDraft(document.published) : null;
  const fingerprint = createHash("sha256").update(JSON.stringify(["BRAND", serviceId, document.publishedVersion, document.publishedAt, draft])).digest("hex");
  const entries = draft ? [...(draft.introduction ? [{ question: "產品介紹", answer: draft.introduction }] : []), ...draft.faqs] : [];
  const records = entries.map((entry, index) => brandKnowledgeSchema.parse({ ...entry, id: `brand-${fingerprint.slice(0, 24)}-${index}`, version: document.publishedVersion,
    scope: "BRAND", serviceId, status: "PUBLISHED", updatedAt: document.publishedAt, expiresAt: new Date(now.getTime() + 300_000).toISOString() }));
  return { serviceId, records, fingerprint, prohibitedTerms: draft?.prohibitedTerms ?? [] };
}
