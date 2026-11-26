import { z } from "zod";
export const aiHandoffKeySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const aiHandoffResumeSchema = z.object({
  commandId: z.string().uuid(), viewKey: aiHandoffKeySchema,
  scopeKey: aiHandoffKeySchema, revision: z.number().int().nonnegative(),
  cursor: aiHandoffKeySchema.optional(),
}).strict();
export const aiHandoffReadSchema = z.object({ viewKey: aiHandoffKeySchema, cursor: aiHandoffKeySchema.optional() }).strict();
export type AiHandoffResumeInput = z.infer<typeof aiHandoffResumeSchema>;
export type AiHandoffPage = {
  rows: { scopeKey: string; revision: number; needsReview: boolean; lastEventAt: string | null; lastEventLabel: string | null }[];
  total: number; nextCursor: string | null;
};
export type AiHandoffSnapshot = {
  viewKey: string; page: AiHandoffPage; cursor?: string;
  synthetic: { handoff: boolean; revision: number };
  routing: { handoff: boolean; revision: number; globalStopped: boolean };
};
