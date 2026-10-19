import { z } from "zod";
import { sportsCompensation } from "./sports-staging-types";
export const sportsTeachingRule = z.object({
  pointCost: z.number().int().min(1).max(10000),
  coachIds: z.array(z.string().min(1).max(100)).max(100),
  expectedCoachIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  compensation: sportsCompensation,
  expectedCompensation: sportsCompensation.nullable().default(null),
});
export type SportsTeachingRule = z.infer<typeof sportsTeachingRule>;
