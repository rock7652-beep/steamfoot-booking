/**
 * line-bind-log — structured observability for LINE binding flows (PR-F1).
 *
 * Why: 三條 LINE 綁定路徑（LIFF exchange / webhook bind code / NextAuth line provider）
 *      原本各自散落 console.log + console.warn，欄位不一致、會印出 raw lineUserId
 *      / phone / token，難以聚合也對 log sink 安全不友善。
 *
 *      本 module 提供：
 *        1. logLineBindEvent() — 唯一入口；強制經過 mask 後才輸出
 *        2. maskLineUserId / maskId / maskPhone — 共用 mask helpers（diagnostic
 *           scripts 也共用）
 *
 * 安全約束：
 *   - 永遠 **不接收 / 不輸出 raw access_token / id_token / refresh_token**。
 *     caller 端不該把 token 傳進來；若不小心傳了，log 也不會印出（不在 payload）。
 *   - lineUserId 永遠經 maskLineUserId() 處理 — 只保留前 4 / 後 2 字元，中間遮罩。
 *   - customerId / userId 經 maskId() — 只保留前 6 字元 + ****。
 *   - phone 經 maskPhone() — 09xx****xx 形式。
 *
 * 不做的事：
 *   - 不寫 DB（ErrorLog 已有獨立 logger，這裡是 stdout structured event）
 *   - 不接 Sentry / Datadog adapter（保持單純 console；之後若上 log shipper
 *     直接撈 [line-bind] tag 即可）
 */

export type LineBindPath =
  | "liff-exchange"
  | "webhook-bind-code"
  | "oauth-line-signin";

export type LineBindResultStatus =
  // exchange route results
  | "session_created"
  | "need_onboarding"
  | "verify_failed"
  | "store_not_found"
  | "session_mint_failed"
  // webhook bind code results
  | "bind_code_success"
  | "bind_code_already_linked"
  | "bind_code_invalid"
  | "bind_code_expired"
  | "bind_code_customer_locked"
  // oauth signIn results
  | "oauth_linked_existing"
  | "oauth_created_user_for_customer"
  | "oauth_created_all"
  | "oauth_store_context_lost"
  | "oauth_blocked_staff_email"
  // bind helper results (re-used by callers)
  | "created_new"
  | "bound_existing"
  | "already_synced"
  | "already_bound_to_other_line"
  | "phone_taken_by_other_user"
  | "ambiguous_multiple_candidates"
  | "customer_not_found"
  | "validation_error"
  | "unique_conflict"
  // generic
  | "unexpected_error";

export type AccountSyncStatus =
  | "created"
  | "noop_already_synced"
  | "skipped_already_linked_other_user"
  | "error"
  | "skipped_no_user"
  | "not_applicable";

export interface LineBindEvent {
  path: LineBindPath;
  status: LineBindResultStatus;
  storeId?: string | null;
  storeSlug?: string | null;
  /** raw lineUserId — masked before output */
  lineUserId?: string | null;
  /** raw customerId — masked before output */
  customerId?: string | null;
  /** raw userId — masked before output */
  userId?: string | null;
  /** raw phone — masked before output */
  phone?: string | null;
  accountSyncStatus?: AccountSyncStatus;
  /** short error code (e.g. P2002, ID_TOKEN_EXPIRED). NEVER include full error message with PII. */
  errorCode?: string | null;
  /** free-form extra context. Caller is responsible for not putting raw PII / tokens here. */
  extra?: Record<string, string | number | boolean | null>;
}

// ──────────────────────────────────────────────────────────
// Mask helpers
// ──────────────────────────────────────────────────────────

/**
 * Mask a LINE userId. Real LINE userIds look like `U` + 32 hex chars (33 total).
 * We keep first 4 + last 2 chars so the same id is correlatable across logs but
 * the full identifier never lands in stdout / log shipper.
 *
 *   maskLineUserId("U1234567890abcdef1234567890abcdef")
 *     → "U123****ef"
 *
 * Returns "(none)" for nullish, "(short)" for inputs shorter than 7 chars.
 */
export function maskLineUserId(raw: string | null | undefined): string {
  if (!raw) return "(none)";
  if (raw.length < 7) return "(short)";
  return `${raw.slice(0, 4)}****${raw.slice(-2)}`;
}

/**
 * Mask a cuid / opaque id. Keeps first 6 chars + `****`.
 *
 *   maskId("clxxxabc12345")  → "clxxxa****"
 *
 * Returns "(none)" for nullish, "(short)" for inputs shorter than 7 chars.
 */
export function maskId(raw: string | null | undefined): string {
  if (!raw) return "(none)";
  if (raw.length < 7) return "(short)";
  return `${raw.slice(0, 6)}****`;
}

/**
 * Mask a Taiwan mobile phone (09xx-xxx-xxx after normalization, 10 digits).
 *
 *   maskPhone("0912345678")  → "0912****78"
 *
 * Falls back to "(masked)" for non-10-digit inputs to avoid accidental leakage
 * of placeholder phones like `_oauth_line_xxxxxxxx` (which is itself non-PII
 * but the contract is "never echo back the input").
 */
export function maskPhone(raw: string | null | undefined): string {
  if (!raw) return "(none)";
  if (!/^\d{10}$/.test(raw)) return "(masked)";
  return `${raw.slice(0, 4)}****${raw.slice(-2)}`;
}

// ──────────────────────────────────────────────────────────
// Logger
// ──────────────────────────────────────────────────────────

interface MaskedPayload {
  tag: "line-bind";
  path: LineBindPath;
  status: LineBindResultStatus;
  storeId?: string;
  storeSlug?: string;
  lineUserId?: string;
  customerId?: string;
  userId?: string;
  phone?: string;
  accountSyncStatus?: AccountSyncStatus;
  errorCode?: string;
  extra?: Record<string, string | number | boolean | null>;
}

function buildMaskedPayload(evt: LineBindEvent): MaskedPayload {
  const payload: MaskedPayload = {
    tag: "line-bind",
    path: evt.path,
    status: evt.status,
  };
  if (evt.storeId) payload.storeId = evt.storeId;
  if (evt.storeSlug) payload.storeSlug = evt.storeSlug;
  if (evt.lineUserId !== undefined)
    payload.lineUserId = maskLineUserId(evt.lineUserId);
  if (evt.customerId !== undefined) payload.customerId = maskId(evt.customerId);
  if (evt.userId !== undefined) payload.userId = maskId(evt.userId);
  if (evt.phone !== undefined) payload.phone = maskPhone(evt.phone);
  if (evt.accountSyncStatus) payload.accountSyncStatus = evt.accountSyncStatus;
  if (evt.errorCode) payload.errorCode = evt.errorCode;
  if (evt.extra && Object.keys(evt.extra).length > 0) payload.extra = evt.extra;
  return payload;
}

/**
 * 統一輸出 LINE 綁定事件。
 * - status 屬於成功類 → console.info
 * - status 屬於拒絕 / 預期失敗類 → console.warn
 * - status 屬於系統錯誤類 → console.error
 *
 * 純 stdout，不寫 DB。
 */
export function logLineBindEvent(evt: LineBindEvent): void {
  const payload = buildMaskedPayload(evt);
  const level = classifyLevel(evt.status);
  // 用單字串 + JSON 物件兩段格式：log shipper 看 tag 過濾、人類看 prefix。
  const prefix = `[line-bind][${evt.path}] ${evt.status}`;
  if (level === "error") console.error(prefix, payload);
  else if (level === "warn") console.warn(prefix, payload);
  else console.info(prefix, payload);
}

/**
 * Classify the `accountSyncStatus` to emit from the NextAuth LINE-OAuth
 * "customer exists with userId" branch, where the flow conditionally creates
 * a missing `Account[provider=line]` row to repair drift.
 *
 * Why this is a separate pure helper:
 *   Pre-fix bug — the call site used `justLinkedLine` (true only when
 *   `Customer.lineUserId` was newly written) as the proxy for "Account
 *   created". That mislabeled drift-repair runs (Customer.lineUserId already
 *   set + Account missing → we *do* create the Account) as
 *   `noop_already_synced`. Splitting Account-creation tracking from
 *   Customer.lineUserId tracking into this helper makes the fix testable
 *   without invoking the full NextAuth signIn callback.
 *
 * Rules (from PR #218 Codex P3):
 *   - Account row missing before, we just created it → "created"
 *     (this includes drift repair where Customer.lineUserId already existed)
 *   - Account row present + Account.userId === Customer.userId → "noop_already_synced"
 *   - Account row present + Account.userId !== Customer.userId →
 *     "skipped_already_linked_other_user" (suspicious; caller code currently
 *     leaves the row alone — this status surfaces the situation in logs)
 *   - Defensive: Account row missing AND we did not create → "error"
 *     (shouldn't happen with current control flow but kept for total coverage)
 */
export function oauthAccountSyncStatusForExisting(args: {
  /** Snapshot of the Account row *before* our potential create call. */
  existingAccount: { userId: string } | null;
  /** Customer.userId at the time we tried to link the OAuth Account. */
  customerUserId: string;
  /** Whether the flow proceeded to create the Account row in this run. */
  accountCreated: boolean;
}): AccountSyncStatus {
  if (args.accountCreated) return "created";
  if (!args.existingAccount) return "error";
  return args.existingAccount.userId === args.customerUserId
    ? "noop_already_synced"
    : "skipped_already_linked_other_user";
}

function classifyLevel(status: LineBindResultStatus): "info" | "warn" | "error" {
  switch (status) {
    // success
    case "session_created":
    case "bind_code_success":
    case "created_new":
    case "bound_existing":
    case "already_synced":
    case "oauth_linked_existing":
    case "oauth_created_user_for_customer":
    case "oauth_created_all":
    case "need_onboarding":
      return "info";
    // expected rejection / user-facing failure
    case "verify_failed":
    case "store_not_found":
    case "session_mint_failed":
    case "bind_code_already_linked":
    case "bind_code_invalid":
    case "bind_code_expired":
    case "bind_code_customer_locked":
    case "oauth_store_context_lost":
    case "oauth_blocked_staff_email":
    case "already_bound_to_other_line":
    case "phone_taken_by_other_user":
    case "ambiguous_multiple_candidates":
    case "customer_not_found":
    case "validation_error":
    case "unique_conflict":
      return "warn";
    // genuine system error
    case "unexpected_error":
      return "error";
  }
}
