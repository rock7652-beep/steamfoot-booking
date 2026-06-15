/**
 * Speed Audit v1 — 環境與安全護欄
 *
 * 集中管理 base URL 與測試帳密的解析，並強制兩道安全護欄：
 *   1. SPEED_AUDIT_BASE_URL 必填（缺少 → fail-fast）
 *   2. 命中 production domain → 直接 abort（Speed Audit 只能跑 Preview / Staging）
 *
 * 這支被 playwright.config.ts 與 auth.setup.ts 共用，確保護欄只有一處定義。
 * 帳密一律從環境變數讀取，repo 內零 hardcode。
 */

/**
 * 已知正式站 host。命中（或其子網域）一律拒絕。
 * Preview 走 *.vercel.app、staging 走自訂 staging host，皆不在此列。
 */
const PRODUCTION_HOSTS = ["steamfoot.com"];

function isProductionHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return PRODUCTION_HOSTS.some(
    (prod) => host === prod || host.endsWith(`.${prod}`),
  );
}

/**
 * 解析並驗證 base URL。
 * - 缺少 SPEED_AUDIT_BASE_URL → throw（fail-fast）
 * - 非合法 URL → throw
 * - production domain → throw（安全 abort）
 */
export function resolveBaseUrl(): string {
  const raw = process.env.SPEED_AUDIT_BASE_URL?.trim();
  if (!raw) {
    throw new Error(
      [
        "[speed-audit] 缺少必填環境變數 SPEED_AUDIT_BASE_URL。",
        "請指向 Preview / Staging 部署，例如：",
        "  SPEED_AUDIT_BASE_URL=https://your-preview.vercel.app npm run speed-audit",
        "（不提供預設值；正式站不可被誤跑。）",
      ].join("\n"),
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `[speed-audit] SPEED_AUDIT_BASE_URL 不是合法 URL：${raw}`,
    );
  }

  if (isProductionHost(url.hostname)) {
    throw new Error(
      [
        `[speed-audit] 拒絕對正式站執行：${url.hostname}`,
        "Speed Audit v1 只能跑 Preview / Staging，不可碰 production。",
      ].join("\n"),
    );
  }

  // 去除尾端斜線，回傳 origin + path
  return raw.replace(/\/$/, "");
}

/**
 * 解析測試帳密（店長端 /hq/login）。
 * 一律從環境變數讀，缺少即 fail-fast。
 */
export function resolveCredentials(): { email: string; password: string } {
  const email = process.env.SPEED_AUDIT_EMAIL?.trim();
  const password = process.env.SPEED_AUDIT_PASSWORD;
  if (!email || !password) {
    throw new Error(
      [
        "[speed-audit] 缺少測試帳密環境變數。",
        "請設定 SPEED_AUDIT_EMAIL 與 SPEED_AUDIT_PASSWORD（使用 staging 帳號，禁用正式帳號）。",
      ].join("\n"),
    );
  }
  return { email, password };
}
