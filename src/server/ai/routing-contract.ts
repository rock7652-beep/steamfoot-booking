import { z } from "zod";
export const aiRoutingScenarioSchema = z.enum(["original", "active", "known", "unknown", "handoff", "inactive", "cancel"]);
export type AiRoutingScenario = z.infer<typeof aiRoutingScenarioSchema>;
export const aiRoutingInputSchema = z.object({ eventId: z.string().uuid(), scenario: aiRoutingScenarioSchema }).strict();
export type AiRoutingResult = {
  route: "ORIGINAL" | "AI" | "HUMAN" | "SILENT" | "BLOCKED" | "DUPLICATE";
  outcome: string; text: string; originalOutcome: string | null; providerCalls: number;
};
export const AI_ROUTING_ACCOUNT = "dashboard-mock-routing";
export const AI_ROUTING_SCENARIOS: Record<AiRoutingScenario, string> = {
  original: "原流程已命中", active: "原流程等待欄位輸入", known: "未命中，詢問已發布服務", unknown: "未命中，詢問未知資訊",
  handoff: "明確要求真人", inactive: "原流程未啟用", cancel: "沒有流程時要求停止",
};
