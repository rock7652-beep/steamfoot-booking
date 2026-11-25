import { z } from "zod";

export const aiModelSchema = z.enum(["gpt-6-luna", "gpt-5.4-mini", "gpt-6.2-sol"]);
export type AiModel = z.infer<typeof aiModelSchema>;
export const aiModuleSchema = z.enum(["STEAMFOOT", "BEAUTY", "FITNESS", "MUSIC"]);
export type AiModule = z.infer<typeof aiModuleSchema>;
export const aiChannelSchema = z.enum(["TEST", "LINE", "MESSENGER"]);
export type AiChannel = z.infer<typeof aiChannelSchema>;
export const aiAnswerSchema = z.object({
  action: z.enum(["answer", "handoff"]),
  sourceIds: z.array(z.string().min(1).max(100)).max(8),
}).strict();
// The model selects published source IDs. It cannot author customer-facing claims.
export type AiAnswer = z.infer<typeof aiAnswerSchema>;
export const knowledgeSchema = z.object({
  id: z.string().min(1).max(100), version: z.number().int().positive(),
  scope: z.enum(["STORE", "MODULE", "SYSTEM"]), storeId: z.string().nullable(),
  module: aiModuleSchema.nullable(), status: z.enum(["DRAFT", "PUBLISHED", "DISABLED"]),
  question: z.string().min(1).max(200), answer: z.string().min(1).max(800),
  updatedAt: z.string().datetime(), expiresAt: z.string().datetime(),
}).strict();
export type AiKnowledge = z.infer<typeof knowledgeSchema>;
export const aiSettingSchema = z.object({
  enabled: z.boolean(), model: aiModelSchema,
  channels: z.array(aiChannelSchema).max(3),
  monthlyBudgetMicros: z.number().int().min(1).max(20_000_000),
  dailyRequests: z.number().int().min(1).max(100), monthlyRequests: z.number().int().min(1).max(1000),
}).strict();
export type AiSetting = z.infer<typeof aiSettingSchema>;
export const DEFAULT_AI_SETTING: AiSetting = {
  enabled: false, model: "gpt-6-luna", channels: ["TEST"],
  monthlyBudgetMicros: 1_000_000, dailyRequests: 20, monthlyRequests: 100,
};
export const AI_LIMITS = {
  globalBudgetMicros: 20_000_000, globalConcurrency: 2, storeConcurrency: 1,
  maxInputTokens: 8192, maxOutputTokens: 256, timeoutMs: 12_000,
  maxAttempts: 1, maxMessageChars: 500, historyTurns: 4, retentionDays: 7,
  alertPercentages: [50, 80, 100],
} as const;
export const AI_HANDOFF_TEXT = "這個問題目前無法確認，請聯繫店家，由真人客服協助您。";

/** Never log original text. Phase 1 accepts synthetic test scenarios only. */
export function redactAiText(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[金鑰已遮罩]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[電子郵件已遮罩]")
    .replace(/(?:\+886[ -]?9|09)(?:[ -]?\d){8}/g, "[電話已遮罩]")
    .replace(/\bU[a-f0-9]{32}\b/gi, "[通路身分已遮罩]");
}
