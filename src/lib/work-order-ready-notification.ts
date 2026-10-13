export function workOrderNotificationReason(input: {
  enabled: boolean; status: string; cancelled: boolean; customerMatches: boolean;
  connectionConfirmed: boolean; blocked: boolean; quotaAllowed: boolean;
}): string | null {
  if (!input.enabled) return "店家已關閉工單取件通知";
  if (input.cancelled || input.status !== "READY") return "工單已取消、取件或不在待取件狀態";
  if (!input.customerMatches) return "工單顧客資料已變更";
  if (!input.connectionConfirmed) return "本店會員與 LINE 尚未確認";
  if (input.blocked) return "顧客已封鎖本店 LINE";
  if (!input.quotaAllowed) return "本月通知額度已用完";
  return null;
}

export function workOrderReadyMessage(input: { storeName: string; number: string; phone?: string | null; address?: string | null }) {
  return [`${input.storeName}`, `工單 ${input.number} 已可取件。`, "請聯繫本店確認取件時間。", input.phone?.trim() ? `電話：${input.phone.trim()}` : null, input.address?.trim() ? `地址：${input.address.trim()}` : null].filter(Boolean).join("\n");
}

export const readyNotificationLabels: Record<string, string> = { PENDING: "排隊中", SENT: "LINE API 已接受", FAILED: "發送失敗", SKIPPED: "未發送" };
