/**
 * HealthFlow AI 健康評估系統 — 入口統一 helper。
 *
 * 所有「健康評估」按鈕、外部連結都必須走這裡，避免有人寫成 bare root
 * (https://www.healthflow-ai.com) 而錯過 LIFF login flow，導致在 LINE 內
 * 出現「無法取得 LINE 資訊」。
 *
 * 兩種入口，請勿混用：
 *   - getHealthAssessmentUrl(customerId) → healthflow-ai.com **web** URL，帶 customerId。
 *     給後台店長端（桌機看顧客）與卡片「查看完整評估」用；web 端以 customerId 識別。
 *   - getHealthNewRecordLiffUrl()        → liff.line.me LIFF 的「新增量測」頁 (/new-record)。
 *     給顧客 Web 前台「前往量測」用：直接開 LIFF 量測頁，省去先進 healthflow-ai web
 *     再跳 LINE 的多一次跳轉，且直達量測頁（非 LIFF 首頁）。
 */

// 與 src/lib/liff/messages.ts 的 healthFlowLiffUrl 同一個 LIFF（單一來源，不複製字面值）。
import { healthFlowLiffUrl } from "@/lib/liff/messages";

export const HEALTH_ASSESSMENT_URL = "https://www.healthflow-ai.com/liff";

export function getHealthAssessmentUrl(customerId?: string | null): string {
  return customerId
    ? `${HEALTH_ASSESSMENT_URL}?customerId=${customerId}`
    : HEALTH_ASSESSMENT_URL;
}

/**
 * 顧客 Web 前台「前往量測」用：直接導向 HealthFlow LIFF 的「新增量測」頁 (/new-record)，
 * 而非 LIFF 首頁、也非 healthflow-ai 外部 web。
 *
 * 不帶任何 identity 參數 — HealthFlow 是獨立 LIFF App，用 LINE Login / LIFF context
 * 自行識別顧客（與 src/lib/liff/messages.ts healthFlowLiffUrl 既有用法一致：
 * Steamfoot 不傳 customerId / storeId / lineUserId）。各店共用同一入口。
 *
 * 註：若日後確認 HealthFlow /new-record 需要 customerId query，再於此集中加上即可，
 * 不影響呼叫端。
 */
export const HEALTH_NEW_RECORD_LIFF_URL = `${healthFlowLiffUrl}/new-record`;

export function getHealthNewRecordLiffUrl(): string {
  return HEALTH_NEW_RECORD_LIFF_URL;
}
