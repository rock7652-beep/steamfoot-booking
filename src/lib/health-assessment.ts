/**
 * HealthFlow AI 健康評估系統 — 入口統一 helper。
 *
 * 所有「健康評估」按鈕、外部連結都必須走這裡，避免有人寫成 bare root
 * (https://www.healthflow-ai.com) 而錯過 LIFF login flow，導致在 LINE 內
 * 出現「無法取得 LINE 資訊」。
 */

export const HEALTH_ASSESSMENT_URL = "https://www.healthflow-ai.com/liff";

export function getHealthAssessmentUrl(customerId?: string | null): string {
  return customerId
    ? `${HEALTH_ASSESSMENT_URL}?customerId=${customerId}`
    : HEALTH_ASSESSMENT_URL;
}
