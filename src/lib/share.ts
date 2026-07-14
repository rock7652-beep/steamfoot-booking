/**
 * 全系統唯一分享核心
 *
 * 所有分享行為（複製連結、LINE 分享、文案組合）必須走這裡。
 * 禁止各頁自行拼接 URL 或 share text。
 */

/** 系統預設分享文案；店家未設定或 DB 值失效時一律 fallback 到這份。 */
export const DEFAULT_REFERRAL_SHARE_TEMPLATE = [
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

export const REFERRAL_SHARE_TEMPLATE_MAX_LENGTH = 2000;

const REQUIRED_PLACEHOLDERS = ["storeName", "url"] as const;
const ALLOWED_PLACEHOLDERS = new Set(["storeName", "url", "inviterName"]);
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export type ReferralShareTemplateValidation =
  | { ok: true; template: string | null }
  | { ok: false; error: string };

/**
 * 驗證店家自訂模板。
 * - null / 空白：代表清除自訂值，回到系統預設
 * - 必須保留店名與安全推薦入口
 * - 未知 placeholder 直接拒絕，避免設定後顧客看到未替換字串
 */
export function validateReferralShareTemplate(
  value: string | null | undefined,
): ReferralShareTemplateValidation {
  const template = value?.trim() ?? "";
  if (!template) return { ok: true, template: null };

  if (template.length > REFERRAL_SHARE_TEMPLATE_MAX_LENGTH) {
    return {
      ok: false,
      error: `推薦分享模板不可超過 ${REFERRAL_SHARE_TEMPLATE_MAX_LENGTH} 字`,
    };
  }

  const placeholders = Array.from(
    template.matchAll(PLACEHOLDER_PATTERN),
    (match) => match[1],
  );
  const unknown = [
    ...new Set(placeholders.filter((name) => !ALLOWED_PLACEHOLDERS.has(name))),
  ];
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `推薦分享模板含有不支援的變數：${unknown.map((name) => `{${name}}`).join("、")}`,
    };
  }

  for (const required of REQUIRED_PLACEHOLDERS) {
    if (!placeholders.includes(required)) {
      return {
        ok: false,
        error: `推薦分享模板必須包含 {${required}}`,
      };
    }
  }

  return { ok: true, template };
}

/** DB 值無效時 fail soft，確保顧客分享按鈕仍可使用系統預設文案。 */
export function resolveReferralShareTemplate(
  value: string | null | undefined,
): string {
  const validation = validateReferralShareTemplate(value);
  return validation.ok && validation.template
    ? validation.template
    : DEFAULT_REFERRAL_SHARE_TEMPLATE;
}

export interface RenderReferralShareTemplateOpts {
  storeName: string;
  url: string;
  inviterName?: string | null;
}

export function renderReferralShareTemplate(
  template: string,
  opts: RenderReferralShareTemplateOpts,
): string {
  return template
    .replaceAll("{storeName}", opts.storeName)
    .replaceAll("{url}", opts.url)
    .replaceAll("{inviterName}", opts.inviterName?.trim() ?? "");
}

export interface BuildShareTextOpts extends RenderReferralShareTemplateOpts {
  /** Server 已解析的每店模板；未傳或無效時使用系統預設。 */
  template?: string | null;
  /** 向下相容：已完成渲染的完整 body，傳入時直接使用。 */
  body?: string;
}

/** 供 LINE 分享與複製使用，兩者輸出完全一致。 */
export function buildShareText(opts: BuildShareTextOpts): string {
  if (opts.body) return opts.body;
  return renderReferralShareTemplate(
    resolveReferralShareTemplate(opts.template),
    opts,
  );
}

/**
 * 組合推薦分享的完整 URL。
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

/** 組合 LINE share URL（分享 URL 已內嵌在 text 中）。 */
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
