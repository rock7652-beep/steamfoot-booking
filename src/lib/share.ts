/**
 * 全系統唯一分享核心
 *
 * 所有分享行為（複製連結、LINE 分享、文案組合）必須走這裡。
 * 禁止各頁自行拼接 URL 或 share text。
 *
 * 用法:
 *   import { buildReferralEntryUrl, buildLineShareUrl, buildShareText } from "@/lib/share";
 *
 *   const url = buildReferralEntryUrl("zhubei", customer.referralCode);
 *   const text = buildShareText({ storeName: store.name, url });
 *   const line = buildLineShareUrl(text, url);
 */

/**
 * 預設分享文案（v2）— 像真人聊天，不像廣告
 *
 * 必要元素：
 *   - 個人情境（我最近…）
 *   - 顧客所屬店家的正式名稱（Store.name）
 *   - 官方 LINE 連結（URL 嵌在文案中間，讓訊息讀起來自然）
 *
 * 禁止元素：幫我推薦 / 支持我 / 任務 / 過度銷售
 *
 * URL 以 `{url}` 佔位符表示；buildShareText() 會替換成店舖專屬入口（含 ref）。
 */
const DEFAULT_SHARE_BODY_TEMPLATE = [
  "我最近去「{storeName}」",
  "坐著45分鐘居然有點像慢跑完的感覺 😂",
  "而且蒸完真的很好睡",
  "",
  "📍{storeName}",
  "",
  "如果你最近也有點累",
  "可以去放鬆一下👇",
  "{url}",
  "",
  "現在還有體驗價$499",
  "想去趕快約喔",
].join("\n");

export interface BuildShareTextOpts {
  /** 顧客所屬店家的正式名稱（Store.name） */
  storeName: string;
  /** 邀請人姓名（可選，保留給未來 A/B） */
  inviterName?: string | null;
  /** 覆寫預設 body 文案（若傳入則不做 {url} 替換） */
  body?: string;
  /** 系統產生的店舖推薦入口（含 ref） */
  url: string;
}

/**
 * 組合完整分享文字（URL 已內嵌於中間位置）。
 * 供 LINE 分享與複製使用，輸出完全一致。
 */
export function buildShareText(opts: BuildShareTextOpts): string {
  if (opts.body) return opts.body;
  return DEFAULT_SHARE_BODY_TEMPLATE
    .replaceAll("{storeName}", opts.storeName)
    .replace("{url}", opts.url);
}

/**
 * 組合推薦分享的完整 URL。
 *
 * 一律先進入蒸管家的店舖專屬入口，由後端驗證店舖、推薦人與 LINE 設定後轉址。
 */
export function buildReferralEntryUrl(
  storeSlug: string,
  code: string,
  origin?: string,
): string {
  const path = `/s/${storeSlug}/line-entry?ref=${encodeURIComponent(code)}`;
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

/** 向下相容別名；所有路徑都使用同一個安全入口。 */
export const buildStoreLineEntryUrl = buildReferralEntryUrl;

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
