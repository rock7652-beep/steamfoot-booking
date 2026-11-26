import "server-only";
import { knowledgeSchema, type AiKnowledge, type AiModule, AI_HANDOFF_TEXT, type AiAnswer } from "./contracts";

/** Re-filter at the server boundary, including shared/module knowledge. No default tenant. */
export function selectAiKnowledge(storeId: string, module: AiModule, records: unknown[], now: Date): AiKnowledge[] {
  if (!storeId || storeId === "__all__") throw new Error("AI_SCOPE_REQUIRED");
  const selected = records.map(row => knowledgeSchema.parse(row)).filter(row =>
    row.status === "PUBLISHED" && Date.parse(row.updatedAt) <= now.getTime()
    && Date.parse(row.expiresAt) > now.getTime()
    && (row.scope === "STORE" ? row.storeId === storeId && (!row.module || row.module === module)
      : row.storeId === null && (row.scope === "MODULE" ? row.module === module : row.module === null)));
  const ids = selected.map(row => row.id);
  if (new Set(ids).size !== ids.length || selected.length > 12) throw new Error("AI_KNOWLEDGE_INVALID");
  return selected;
}

/** Exact published text prevents injection or hallucinated amounts becoming a reply. */
export function renderAiAnswer(answer: AiAnswer, knowledge: Pick<AiKnowledge, "id" | "answer">[]): { text: string; handoff: boolean } {
  if (answer.action !== "answer" || answer.sourceIds.length !== 1) return { text: AI_HANDOFF_TEXT, handoff: true };
  const source = knowledge.find(row => row.id === answer.sourceIds[0]);
  return source ? { text: source.answer, handoff: false } : { text: AI_HANDOFF_TEXT, handoff: true };
}

/** Synthetic fixtures, never copied from real stores or a second operational settings database. */
export function syntheticAiKnowledge(storeId: string, module: AiModule, now: Date): AiKnowledge[] {
  const label = { STEAMFOOT: "蒸足", BEAUTY: "美業", FITNESS: "運動", MUSIC: "音樂" }[module];
  return [{
    id: "synthetic-hours-v1", version: 1, scope: "STORE", storeId, module, status: "PUBLISHED",
    question: "測試店的營業時間？", answer: `這是${label}合成測試店，測試營業時間為週一至週五 10:00–18:00。`,
    updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
  }];
}
