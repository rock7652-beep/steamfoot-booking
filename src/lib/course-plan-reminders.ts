import { z } from "zod";
import { courseLowBalanceSchema } from "./course-low-balance";
export const courseExpiryPlanSchema = z.object({
  enabled: z.boolean(),
  days: z.array(z.number().int().min(1).max(365)).min(1).max(6),
}).transform(value => ({ ...value, days: [...new Set(value.days)].sort((a, b) => b - a) }));
export function parseCourseExpiryPlan(body?: string | null) {
  if (body == null) return { enabled: true, days: [14, 7] };
  try { return courseExpiryPlanSchema.parse(JSON.parse(body)); }
  catch { return { enabled: false, days: [] as number[] }; }
}
export const coursePlanReminderSchema = z.object({
  planId: z.string().min(1), enabled: z.boolean(), threshold: z.number().int().min(0).max(1000000).nullable(),
  expiry: courseExpiryPlanSchema,
}).refine(value => courseLowBalanceSchema.safeParse(value).success, { message: "啟用低額度提醒時，請填寫門檻", path: ["threshold"] });
