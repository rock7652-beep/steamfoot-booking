import { z } from "zod";
import { aiRoutingScenarioSchema } from "./routing-contract";
export const AI_LINE_SYNTHETIC_ACCOUNT = "dashboard-line-synthetic";
export const aiLineSyntheticInputSchema = z.object({
  eventId: z.string().uuid(), scenario: aiRoutingScenarioSchema,
  provider: z.enum(["mock", "openai"]),
}).strict();
export type AiLineSyntheticInput = z.infer<typeof aiLineSyntheticInputSchema>;
