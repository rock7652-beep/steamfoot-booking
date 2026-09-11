export const REFERRAL_SHARE_TEMPLATE_MAX_LENGTH = 2000;

export const DEFAULT_REFERRAL_SHARE_TEMPLATE = [
  "想到你最近也很忙",
  "我在「{storeName}」蒸足放鬆，覺得很舒服 😊",
  "",
  "分享給你，有興趣可以看看👇",
  "{url}",
].join("\n");

const ALLOWED_VARIABLES = new Set(["storeName", "url"]);

export class ReferralShareTemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferralShareTemplateValidationError";
  }
}

function validationError(message: string): never {
  throw new ReferralShareTemplateValidationError(message);
}

/**
 * Normalize and validate a merchant-authored referral template.
 * Empty input means “use system default” and is stored as NULL.
 */
export function normalizeReferralShareTemplate(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;

  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;

  if (normalized.length > REFERRAL_SHARE_TEMPLATE_MAX_LENGTH) {
    validationError(
      `推薦分享文案不可超過 ${REFERRAL_SHARE_TEMPLATE_MAX_LENGTH} 個字元`,
    );
  }

  const variables = [...normalized.matchAll(/\{([^{}]+)\}/g)].map(
    (match) => match[1],
  );
  const unknown = variables.find((variable) => !ALLOWED_VARIABLES.has(variable));
  if (unknown) {
    validationError(`不支援變數 {${unknown}}，僅可使用 {storeName} 與 {url}`);
  }

  const textWithoutAllowedVariables = normalized.replace(
    /\{(?:storeName|url)\}/g,
    "",
  );
  if (/[{}]/.test(textWithoutAllowedVariables)) {
    validationError("變數格式錯誤，請使用 {storeName} 或 {url}");
  }

  const urlCount = normalized.match(/\{url\}/g)?.length ?? 0;
  if (urlCount !== 1) {
    validationError("推薦分享文案必須且只能包含一個 {url}");
  }

  return normalized;
}

/** Render safely; invalid persisted data fails back to the system template. */
export function renderReferralShareTemplate(input: {
  template?: string | null;
  storeName: string;
  url: string;
}): string {
  let template = DEFAULT_REFERRAL_SHARE_TEMPLATE;
  try {
    template =
      normalizeReferralShareTemplate(input.template) ??
      DEFAULT_REFERRAL_SHARE_TEMPLATE;
  } catch {
    template = DEFAULT_REFERRAL_SHARE_TEMPLATE;
  }

  return template
    .replaceAll("{storeName}", input.storeName)
    .replace("{url}", input.url);
}
