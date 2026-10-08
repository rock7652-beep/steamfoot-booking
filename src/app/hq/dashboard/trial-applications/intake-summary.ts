import { fieldText } from "./consultation-view";

/** Explicit operational markers only; never classify or merge by phone/name similarity. */
export function intakeTestMarker(...values: (string | null | undefined)[]) {
  return values.some(value => /TEST[-_]DO[-_]NOT[-_]CONTACT|SYSTEM_QA_DO_NOT_CONTACT|系統驗收|正式收件測試|非店家申請/i.test(value ?? ""));
}
export function requirementSummary(original: Record<string, unknown>) {
  return fieldText(typeof original.priorityNeed === "string" && original.priorityNeed.trim() ? original.priorityNeed : original.needs);
}
/** Suggestions, not inferred contact history or an automatic workflow. */
export function consultationNextStep(status: string, noContact: boolean, linked: boolean) {
  if (noContact) return "請勿主動聯繫";
  if (status === "CLOSED") return "已結案，保留紀錄";
  if (linked) return "核對已關聯開通進度";
  return ({ NEW: "依原留方式聯繫", CONTACTED: "確認需求與後續安排", FOLLOW_UP: "依聯繫紀錄追蹤" } as Record<string, string>)[status] ?? "核對處理狀態";
}
export function applicationNextStep(status: string) {
  return ({ RECEIVED: "核對店家與提交資料", NEEDS_INFO: "確認待補資料", CONFIGURING: "完成設定與內部測試", VERIFYING: "確認店家驗收結果", READY: "查看已完成設定", CLOSED: "已結案，保留紀錄" } as Record<string, string>)[status] ?? "核對處理狀態";
}
