import { z } from "zod";
export const aiHandoffKeySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const aiHandoffResumeSchema = z.object({
  commandId: z.string().uuid(), viewKey: aiHandoffKeySchema,
  scopeKey: aiHandoffKeySchema, revision: z.number().int().nonnegative(),
}).strict();
export type AiHandoffResumeInput = z.infer<typeof aiHandoffResumeSchema>;
export type AiHandoffPage = {
  rows: { scopeKey: string; revision: number; needsReview: boolean; lastEventAt: string | null; lastEventLabel: string | null }[];
  total: number; nextCursor: string | null;
};
