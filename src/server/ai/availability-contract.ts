import { z } from "zod";

export const aiAvailabilityArguments = z.object({ date: z.string().date() }).strict();
export const aiAvailabilityReadSchema = aiAvailabilityArguments.extend({ viewKey: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const aiAvailabilityDataSchema = z.object({ date: z.string().date(), slots: z.array(z.object({
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), remaining: z.number().int().positive(),
}).strict()).max(1440) }).strict();
export type AiAvailabilityResult = {
  viewKey: string; date: string; checkedAt: string; checkedAtLabel: string;
  slots: { startTime: string; remaining: number }[];
};
