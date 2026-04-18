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

/** 預設分享文案（自然、像朋友間分享；不使用「幫我推薦」「支持我」等推銷語氣） */
const DEFAULT_SHARE_BODY =
  "我最近去這間放鬆，真的蠻舒服的\n\n如果你最近也有點累\n可以去試試看👇\n";

/**
 * 官方 LINE 分享連結（含 ref tracking）。
 * 使用 lin.ee 短網址讓朋友直接加 LINE 好友，ref 供 webhook 端解析。
 */
const OFFICIAL_LINE_BASE_URL = "https://lin.ee/8ohprFv";

/** 分享完 URL 之後附加的尾句（留空；避免強迫推銷感） */
const DEFAULT_SHARE_TAIL = "\n跟他們說是我介紹的就好 😊";

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
 * 組合推薦分享的完整 URL。
 *
 * v3: 改為官方 LINE 好友連結 https://lin.ee/... 並以 query 帶 ref。
 *     朋友點擊後直接加 LINE 官方帳號；ref 由 LINE webhook 端解析（後續實作）。
 *
 * @param storeSlug 保留簽名相容（這版本不使用，但維持介面以免打破呼叫端）
 * @param code      推薦碼（通常是 customerId）
 * @param origin    保留簽名相容
 */
export function buildReferralEntryUrl(
  _storeSlug: string,
  code: string,
  _origin?: string,
): string {
  return `${OFFICIAL_LINE_BASE_URL}?ref=${encodeURIComponent(code)}`;
}

/**
 * 內部用：店內 line-entry 頁連結（bot 歡迎訊息用）。
 * 前台分享已不再使用此 URL，但註冊/綁定頁仍會從 ref cookie 讀取。
 */
export function buildStoreLineEntryUrl(
  storeSlug: string,
  code: string,
  origin?: string,
): string {
  const path = `/s/${storeSlug}/line-entry?ref=${encodeURIComponent(code)}`;
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

/**
 * 組合 LINE share URL（可直接放在 <a href>）。
 * 會把文字 + 連結 + 尾句串起來 → encodeURIComponent → 套進 line.me/R/share。
 */
export function buildLineShareUrl(text: string, shareUrl: string): string {
  const full = `${text}${shareUrl}${DEFAULT_SHARE_TAIL}`;
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
