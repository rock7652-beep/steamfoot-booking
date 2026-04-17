/**
 * 全系統唯一分享核心
 *
 * 所有分享行為（複製連結、LINE 分享、文案組合）必須走這裡。
 * 禁止各頁自行拼接 URL 或 share text。
 *
 * 用法:
 *   import { buildReferralEntryUrl, buildLineShareUrl, buildShareText } from "@/lib/share";
 *
 *   const url = buildReferralEntryUrl("zhubei", customerId);
 *   const text = buildShareText({ inviterName: user.name });
 *   const line = buildLineShareUrl(text, url);
 */

/** 預設分享文案（中性語氣，不出現教練 / 店長字眼） */
const DEFAULT_SHARE_BODY =
  "我最近在這裡做身體調整，整體感受很不錯。\n如果你最近也想放鬆一下、調理身體，可以先加他們官方 LINE 看看👇\n";

export interface BuildShareTextOpts {
  /** 邀請人姓名（可選，目前預設不帶入文案中；保留以利未來 A/B） */
  inviterName?: string | null;
  /** 覆寫預設 body 文案 */
  body?: string;
}

/**
 * 組合 LINE/複製 用的分享文字（不含 URL — 呼叫 buildLineShareUrl 時才串接）。
 */
export function buildShareText(opts: BuildShareTextOpts = {}): string {
  return opts.body ?? DEFAULT_SHARE_BODY;
}

/**
 * 組合推薦中繼頁的完整 URL。
 * 統一走 /s/[storeSlug]/line-entry?ref={code}，
 * 避免各處各自拼 ?ref= 到不同入口。
 *
 * @param storeSlug 店家 slug（必填，不 fallback zhubei，避免誤導流到別店）
 * @param code      推薦碼（通常是 customerId）
 * @param origin    可選的絕對 origin（server-side 使用）；省略則回傳相對路徑
 */
export function buildReferralEntryUrl(
  storeSlug: string,
  code: string,
  origin?: string,
): string {
  const path = `/s/${storeSlug}/line-entry?ref=${encodeURIComponent(code)}`;
  if (!origin) return path;
  const trimmed = origin.replace(/\/$/, "");
  return `${trimmed}${path}`;
}

/**
 * 組合 LINE share URL（可直接放在 <a href>）。
 * 會把文字 + 連結串起來 → encodeURIComponent → 套進 line.me/R/share。
 */
export function buildLineShareUrl(text: string, shareUrl: string): string {
  const full = `${text}${shareUrl}`;
  return `https://line.me/R/share?text=${encodeURIComponent(full)}`;
}

/**
 * 複製到剪貼簿（僅瀏覽器端可用）。回傳 Promise<boolean>。
 */
export async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 把相對連結補齊成絕對 URL（client-side 用）。
 */
export function toAbsoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  return `${window.location.origin}${pathOrUrl}`;
}
