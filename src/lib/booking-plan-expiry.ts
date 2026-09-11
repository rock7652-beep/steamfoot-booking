import { toLocalDateStr } from "./date-utils";

/** Wallet expiryDate is a DB calendar date; today follows Asia/Taipei. */
export function bookingPlanExpiry(expiryDate: Date | string | null | undefined, today = toLocalDateStr()) {
  const muted = "text-earth-500";
  if (expiryDate === null) return { compact: "無到期限制", detail: "無到期限制", className: muted };
  if (expiryDate === undefined) return { compact: "到期日待確認", detail: "到期日待確認", className: muted };
  const parsed = new Date(expiryDate);
  if (Number.isNaN(parsed.getTime())) return { compact: "到期日待確認", detail: "到期日待確認", className: muted };
  const date = parsed.toISOString().slice(0, 10);
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  const full = date.replaceAll("-", "/");
  const short = date.slice(0, 4) === today.slice(0, 4) ? full.slice(5) : full;
  return {
    compact: `${short} ${days < 0 ? "已到期" : days === 0 ? "今日到期" : "到期"}`,
    detail: `${full}（${days < 0 ? "已到期" : days === 0 ? "今日到期" : `剩 ${days} 天`}）`,
    className: days < 0 ? "text-red-700" : days <= 14 ? "text-amber-700" : muted,
  };
}
