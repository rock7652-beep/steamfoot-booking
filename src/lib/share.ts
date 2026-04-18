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

/**
 * 官方 LINE 分享連結（含 ref tracking）。
 * 使用 lin.ee 短網址讓朋友直接加 LINE 好友，ref 供 webhook 端解析。
 */
const OFFICIAL_LINE_BASE_URL = "https://lin.ee/8ohprFv";

/**
 * 預設分享文案（v2）— 像真人聊天，不像廣告
 *
 * 必要元素：
 *   - 個人情境（我最近…）
 *   - 店名（暖暖蒸足）
 *   - 地點（竹北）
 *   - 官方 LINE 連結（URL 嵌在文案中間，讓訊息讀起來自然）
 *
 * 禁止元素：幫我推薦 / 支持我 / 任務 / 過度銷售
 *
 * URL 以 `{url}` 佔位符表示；buildShareText() 會替換成實際的 lin.ee 連結（含 ref）。
 */
const DEFAULT_SHARE_BODY_TEMPLATE = [
  "我最近去竹北這間蒸足店",
  "坐著45分鐘居然有點像慢跑完的感覺 😂",
  "而且蒸完真的很好睡",
  "",
  "📍暖暖蒸足",
  "",
  "如果你最近也有點累",
  "可以去放鬆一下👇",
  "{url}",
  "",
  "現在還有體驗價$499",
  "想去趕快約喔",
].join("\n");

export interface BuildShareTextOpts {
  /** 邀請人姓名（可選，保留給未來 A/B） */
  inviterName?: string | null;
  /** 覆寫預設 body 文案（若傳入則不做 {url} 替換） */
  body?: string;
  /** 要嵌入文案中的分享 URL（含 ref）。預設使用 OFFICIAL_LINE_BASE_URL */
  url?: string;
}

/**
 * 組合完整分享文字（URL 已內嵌於中間位置）。
 * 供 LINE 分享與複製使用，輸出完全一致。
 */
export function buildShareText(opts: BuildShareTextOpts = {}): string {
  if (opts.body) return opts.body;
  const url = opts.url ?? OFFICIAL_LINE_BASE_URL;
  return DEFAULT_SHARE_BODY_TEMPLATE.replace("{url}", url);
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
 *
 * v2: 分享 URL 已內嵌在 text 中間，shareUrl 參數保留僅為向下相容，不再追加尾端。
 */
export function buildLineShareUrl(text: string, _shareUrl?: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
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
