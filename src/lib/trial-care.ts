import { z } from "zod";
import { parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";

export const TRIAL_CARE_LABELS = ["體驗後關心", "第一次回訪邀請", "最後一次邀請"] as const;
const ruleSchema = z.object({
  enabled: z.boolean(),
  days: z.number().int().min(1).max(90),
  time: z.string().regex(/^(0[9]|1\d|20):[0-5][05]$/, "請選擇 09:00–20:55，每 5 分鐘一格"),
  body: z.string().trim().min(1).max(1000),
});
export const trialCareRulesSchema = z.array(ruleSchema).length(3).superRefine((rules, ctx) => {
  for (let i = 1; i < rules.length; i++) {
    if (rules[i].days - rules[i - 1].days < 3) ctx.addIssue({ code: "custom", message: "各階段至少間隔 3 天", path: [i, "days"] });
  }
  for (const [i, rule] of rules.entries()) {
    if (/\{\{(?!customerName\}\}|storeName\}\})/.test(rule.body)) ctx.addIssue({ code: "custom", message: "僅可使用 {{customerName}} 與 {{storeName}}", path: [i, "body"] });
  }
});
export type TrialCareRule = z.infer<typeof ruleSchema>;
export function defaultTrialCareRules(): TrialCareRule[] {
  return [
    { enabled: true, days: 1, time: "10:00", body: "{{customerName}} 您好，謝謝您日前來到 {{storeName}}！想關心您體驗後的感受，有任何問題都歡迎直接回覆我們。" },
    { enabled: true, days: 4, time: "10:00", body: "{{customerName}} 您好，還記得上次在 {{storeName}} 的體驗嗎？如果想再次安排一段放鬆時光，歡迎了解適合您的方案。有任何問題，我們很樂意協助。" },
    { enabled: false, days: 10, time: "10:00", body: "{{customerName}} 您好，{{storeName}} 想再邀請您回來坐坐。若想了解目前的方案或優惠，歡迎與我們聊聊。期待有機會再次服務您。" },
  ];
}
export function readTrialCareRules(value: unknown): TrialCareRule[] {
  return trialCareRulesSchema.parse(value);
}
export function trialCareDueAt(completedAt: Date, rule: Pick<TrialCareRule, "days" | "time">): Date {
  const date = toLocalDateStr(new Date(completedAt.getTime() + rule.days * 86400000));
  return parseTaipeiDateTime(date, rule.time)!;
}
export function renderTrialCareBody(body: string, customerName: string, storeName: string) {
  return body.replace(/\{\{(customerName|storeName)\}\}/g, (_, key) => key === "customerName" ? customerName : storeName);
}
export function trialCareSkipReason(input: {
  now: Date; dueAt: Date; updatedAt: Date; enabled: boolean;
  stopped: boolean; stage: number; purchased: boolean; booked: boolean; alreadySentToday: boolean;
}): string | null {
  if (input.stopped) return "顧客已停止接收";
  if (!input.enabled) return "此階段已關閉";
  if (input.updatedAt > input.dueAt) return "設定修改前已錯過，不補發";
  if (input.now.getTime() - input.dueAt.getTime() >= 15 * 60000) return "已錯過發送時間，不補發";
  if (input.stage > 0 && input.purchased) return "已購買方案或儲值";
  if (input.stage > 0 && input.booked) return "已預約下次到店";
  if (input.alreadySentToday) return "今日已有體驗關懷";
  return null;
}
