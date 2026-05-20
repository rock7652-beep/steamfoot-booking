/**
 * LIFF idToken 後端驗證 — 包 LINE 官方 verify endpoint。
 *
 * docs: https://developers.line.biz/en/reference/line-login/#verify-id-token
 *
 * 流程：
 *   POST https://api.line.me/oauth2/v2.1/verify
 *   form: id_token=<jwt>, client_id=<channel-id>
 *   200 → decoded payload: { iss, sub, aud, exp, iat, name?, picture?, email? }
 *   400 → invalid token
 *
 * 本 helper 額外做 (defense-in-depth)：
 *   - `iss === "https://access.line.me"`（防 issuer 偽造）
 *   - `aud` 含 channelId（防 cross-channel idToken 重放）
 *   - `exp > now`（雖然 LINE 也會回 400 過期，但本地比對讓錯誤更明確）
 *
 * 拋出 typed error `LiffIdTokenError`，code 來判失敗類別供 UI 文案使用。
 */

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const EXPECTED_ISS = "https://access.line.me";

export type LiffIdTokenErrorCode =
  | "MISSING_INPUT"
  | "NETWORK"
  | "INVALID"
  | "EXPIRED"
  | "ISS_MISMATCH"
  | "AUD_MISMATCH";

export class LiffIdTokenError extends Error {
  readonly code: LiffIdTokenErrorCode;
  readonly cause?: unknown;
  constructor(code: LiffIdTokenErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "LiffIdTokenError";
    this.code = code;
    this.cause = cause;
  }
}

export interface VerifiedLiffIdToken {
  /** LINE userId (即 lineUserId, 同 `Customer.lineUserId`) */
  lineUserId: string;
  /** LINE Login channel id (即 idToken 的 aud，等同 LIFF 所屬 channel) */
  channelId: string;
  /** 使用者顯示名稱（LINE profile name），不存在時為 null */
  displayName: string | null;
  /** 使用者頭像 URL，不存在時為 null */
  pictureUrl: string | null;
  /** idToken exp（秒, unix epoch）*/
  expiresAt: number;
}

/**
 * 驗證 LIFF idToken。
 *
 * @param idToken - 由 LIFF SDK `liff.getIDToken()` 取得
 * @param expectedChannelId - 預期的 LINE Login channel id（aud 必須命中）
 *
 * @throws LiffIdTokenError - code 標示失敗原因
 */
export async function verifyLiffIdToken(
  idToken: string | undefined | null,
  expectedChannelId: string | undefined | null
): Promise<VerifiedLiffIdToken> {
  if (!idToken) {
    throw new LiffIdTokenError("MISSING_INPUT", "idToken is required");
  }
  if (!expectedChannelId) {
    throw new LiffIdTokenError(
      "MISSING_INPUT",
      "expected channel id is not configured"
    );
  }

  let response: Response;
  try {
    response = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: expectedChannelId,
      }).toString(),
    });
  } catch (err) {
    throw new LiffIdTokenError(
      "NETWORK",
      `LINE verify fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  if (!response.ok) {
    // LINE 對過期/無效一律 400；body.error_description 是判斷依據
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* response body 不是 JSON，留 null */
    }
    const description =
      typeof body === "object" && body !== null && "error_description" in body
        ? String((body as Record<string, unknown>).error_description ?? "")
        : "";
    if (/expired/i.test(description)) {
      throw new LiffIdTokenError(
        "EXPIRED",
        `idToken expired: ${description}`,
        body
      );
    }
    throw new LiffIdTokenError(
      "INVALID",
      `LINE verify rejected (status ${response.status}): ${description || "unknown"}`,
      body
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    throw new LiffIdTokenError(
      "INVALID",
      "LINE verify response is not JSON",
      err
    );
  }

  // === Defense-in-depth 本地比對 ===
  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (iss !== EXPECTED_ISS) {
    throw new LiffIdTokenError(
      "ISS_MISMATCH",
      `idToken issuer must be ${EXPECTED_ISS}, got "${iss}"`
    );
  }

  // aud 可能是 string 或 string[]（LINE 文件未強制，OIDC 規範允許兩種）
  const audValue = payload.aud;
  const audList = Array.isArray(audValue)
    ? audValue.filter((v): v is string => typeof v === "string")
    : typeof audValue === "string"
      ? [audValue]
      : [];
  if (!audList.includes(expectedChannelId)) {
    throw new LiffIdTokenError(
      "AUD_MISMATCH",
      `idToken aud "${audList.join(",")}" does not include expected channel ${expectedChannelId}`
    );
  }

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    throw new LiffIdTokenError(
      "EXPIRED",
      `idToken expired (exp=${exp}, now=${now})`
    );
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    throw new LiffIdTokenError("INVALID", "idToken payload missing sub");
  }

  return {
    lineUserId: sub,
    channelId: expectedChannelId,
    displayName: typeof payload.name === "string" ? payload.name : null,
    pictureUrl: typeof payload.picture === "string" ? payload.picture : null,
    expiresAt: exp,
  };
}
