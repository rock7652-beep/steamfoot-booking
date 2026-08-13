/**
 * Converts persisted reminder delivery details into staff-facing language.
 *
 * `errorMessage` intentionally remains unchanged in the database so support
 * and operational diagnostics can still use the original provider response.
 */
const MESSENGER_RESULT_LABEL: Record<string, string> = {
  SKIPPED_DISABLED: "Messenger 自動提醒目前關閉",
  SKIPPED_MISSING_TEMPLATE: "Messenger 的核准提醒範本尚未設定",
  SKIPPED_MISSING_IDENTITY: "這筆預約沒有可驗證的 Messenger 身分",
  FAILED_META_REJECTED: "Meta 拒絕此次 Messenger 測試提醒",
  FAILED_TRANSPORT: "Messenger 傳輸失敗",
  FAILED_CONFIGURATION: "Messenger Page 設定不完整",
  FAILED_IDENTITY_SCOPE: "Messenger 身分與此分店不一致",
};

const LINE_RECIPIENT_UNAVAILABLE_PREFIX = "LINE recipient unavailable: ";

export function formatReminderSendResult(
  status: string,
  errorMessage?: string | null,
): string {
  if (status === "SENT") return "已發送";

  const rawDetail = errorMessage?.trim() ?? "";
  const detail = rawDetail.startsWith(LINE_RECIPIENT_UNAVAILABLE_PREFIX)
    ? rawDetail.slice(LINE_RECIPIENT_UNAVAILABLE_PREFIX.length).trim()
    : rawDetail;

  if (MESSENGER_RESULT_LABEL[detail]) return MESSENGER_RESULT_LABEL[detail];
  if (/NO_CENTRAL_(USER|LINE)/.test(detail)) return "未綁定 LINE";
  if (/LINE API 400/i.test(detail)) return "已綁定但無法送達";
  if (
    detail === "LINE token not configured for store" ||
    detail === "TRIAL_BOOKING_ACTION_SECRET_NOT_CONFIGURED" ||
    /LINE API 401/i.test(detail)
  ) {
    return "LINE 發送設定不完整，請聯絡系統管理員";
  }
  if (/^(CENTRAL_USER|CENTRAL_LINE|IDENTITY_LINK|LEGACY_LINE)_CONFLICT$/.test(detail)) {
    return "LINE 身分資料衝突，請聯絡客服協助處理";
  }

  if (status === "SKIPPED") {
    if (!detail) return "已跳過";
    if (detail.startsWith("store_channel_verification_unavailable:")) {
      return "LINE 驗證暫時無法完成，請稍後重試";
    }
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
