/**
 * Converts persisted reminder delivery details into staff-facing language.
 *
 * `errorMessage` intentionally remains unchanged in the database so support
 * and operational diagnostics can still use the original provider response.
 */
export function formatReminderSendResult(
  status: string,
  errorMessage?: string | null,
): string {
  if (status === "SENT") return "已發送";

  const detail = errorMessage?.trim() ?? "";
  if (/NO_CENTRAL_(USER|LINE)/.test(detail)) return "未綁定 LINE";
  if (/LINE API 400/i.test(detail)) return "已綁定但無法送達";

  if (status === "SKIPPED") {
    if (!detail) return "已跳過";
    if (detail === "Feature not enabled") return "此功能尚未啟用";
    if (detail === "Already processed today") return "今日已處理";
    if (detail === "MESSENGER_SCHEDULED_REMINDER_ISOLATED") {
      return "此提醒目前不支援 Messenger 發送";
    }
    if (/Reminder send limit reached/i.test(detail)) return "已達提醒發送上限";

    // Existing plain-language skip explanations remain useful to staff.
    if (/\p{Script=Han}/u.test(detail)) return detail;
    return "已跳過";
  }

  if (status === "PENDING") return "待發送";
  if (status === "FAILED") return "發送失敗";
  return detail && /\p{Script=Han}/u.test(detail) ? detail : "—";
}

/** Formats the separate manager follow-up result for session-balance reminders. */
export function formatManagerNotificationResult(
  status?: string | null,
  errorMessage?: string | null,
  responseAction?: string | null,
): string {
  if (!status) {
    return responseAction === "VIP_INTEREST" ? "通知結果待確認" : "不需通知";
  }

  const detail = errorMessage?.trim() ?? "";
  if (/店長尚未綁定.*LINE/.test(detail)) return "未綁定 LINE";

  const result = formatReminderSendResult(status, detail);
  if (status === "FAILED" && result === "發送失敗") return "通知失敗";
  return result;
}
