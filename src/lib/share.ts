/**
 * 全系統唯一分享核心
 *
 * 所有分享行為（複製連結、LINE 分享、文案組合）必須走這裡。
 * 禁止各頁自行拼接 URL 或 share text。
 */

import {
  DEFAULT_REFERRAL_SHARE_TEMPLATE,
  renderReferralShareTemplate,
} from "@/lib/referral-share-template";

export { DEFAULT_REFERRAL_SHARE_TEMPLATE } from "@/lib/referral-share-template";

export interface BuildShareTextOpts {
  /** 顧客所屬店家的正式名稱（Store.name） */
  storeName: string;
  /** 邀請人姓名（可選，保留給未來 A/B） */
  inviterName?: string | null;
  /** 店家自訂模板；null/空值使用系統預設 */
  template?: string | null;
  /** 已完成渲染的覆寫文字（舊呼叫點相容） */
  body?: string;
  /** 系統產生的店舖推薦入口（含 ref） */
  url: string;
}

/** 供 LINE 分享與複製使用，兩者輸出完全一致。 */
export function buildShareText(opts: BuildShareTextOpts): string {
  if (opts.body) return opts.body;
  return renderReferralShareTemplate({
    template: opts.template,
    storeName: opts.storeName,
    url: opts.url,
  });
}

/** 組合推薦分享的完整 URL。 */
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

/** 分享 URL 已內嵌在 text 中間。 */
export function buildLineShareUrl(text: string, _shareUrl?: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

/** 複製到剪貼簿（僅瀏覽器端可用）。 */
export async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** 把相對連結補齊成絕對 URL（client-side 用）。 */
export function toAbsoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  if (typeof window === "undefined") return pathOrUrl;
  return `${window.location.origin}${pathOrUrl}`;
}

// Keep the named import referenced for source-level discoverability and backwards docs.
void DEFAULT_REFERRAL_SHARE_TEMPLATE;
