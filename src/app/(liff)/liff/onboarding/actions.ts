"use server";

/**
 * LIFF onboarding server action (PR-C2)
 *
 * 介面 (plan §3.3)：
 *   submitOnboarding({ idToken, storeSlug, name, phone }) → OnboardingActionResult
 *
 * 流程：
 *   1. 後端 verifyLiffIdToken（與 liff-token provider 同層 verify）
 *   2. resolveStoreBySlug → storeId
 *   3. bindLineToCustomerInStore({ storeId, lineUserId, lineName, phone, name })
 *   4. 把 BindLineResult.status 對應到 plan §3.2 顧客面 status enum
 *
 * 不做：
 *   - 不 mint session（client 拿 result.status === "ok" 後呼 signIn("liff-token", ...)）
 *   - 不接 referral / password
 *   - 不改 helper / exchange / OAuth / webhook
 */

import { z } from "zod";
import { verifyLiffIdToken, LiffIdTokenError } from "@/lib/liff/verify-id-token";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { bindLineToCustomerInStore } from "@/server/services/bind-line-to-customer";
import { logLineBindEvent } from "@/lib/line-bind-log";
import { upsertCustomerIdentityLink } from "@/server/services/customer-identity-link";
import { resolveCentralMemberLineLoginChannelId } from "@/lib/liff/central-member-config";

const InputSchema = z.object({
  idToken: z.string().min(1),
  storeSlug: z.string().min(1),
  name: z.string().trim().min(1).max(50),
  phone: z.string().trim().min(1).max(20),
});

export interface OnboardingActionInput {
  idToken: string;
  storeSlug: string;
  name: string;
  phone: string;
}

/**
 * 結果 enum (plan §3.2 + §3.3) — 顧客語言；不暴露 helper 內部 status 名。
 */
export type OnboardingActionResult =
  | { status: "ok" }                            // created_new / bound_existing / already_synced
  | { status: "invalid_phone" }
  | { status: "not_found" }
  | { status: "bound_other" }                   // already_bound_to_other_line
  | { status: "phone_taken_by_login_account" }  // phone_taken_by_other_user
  | { status: "ambiguous" }                     // ambiguous_multiple_candidates
  | { status: "expired" }                       // ID token expired
  | { status: "service_unavailable" };          // network / config / store not found / unexpected

export async function submitOnboarding(
  input: OnboardingActionInput
): Promise<OnboardingActionResult> {
  // ── 1. Input shape ───────────────────────────────────
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    // 缺欄位 / 過短 → 視為 service_unavailable（caller bug；不該到顧客面）
    // 真實 phone 格式錯誤由 helper validation_error.invalid_phone 路徑回 invalid_phone
    return { status: "service_unavailable" };
  }
  const { idToken, storeSlug, name, phone } = parsed.data;

  // ── 2. Channel config ────────────────────────────────
  const expectedChannelId = resolveCentralMemberLineLoginChannelId();

  // ── 3. Re-verify idToken (defense in depth) ──────────
  let verified;
  try {
    verified = await verifyLiffIdToken(idToken, expectedChannelId);
  } catch (err) {
    if (err instanceof LiffIdTokenError) {
      if (err.code === "EXPIRED") return { status: "expired" };
      // AUD_MISMATCH / ISS_MISMATCH / INVALID / NETWORK / MISSING_INPUT
      // 都歸為 service_unavailable（顧客面不需區分技術細節）
      return { status: "service_unavailable" };
    }
    console.error("[liff/onboarding] unexpected verify error", err);
    return { status: "service_unavailable" };
  }

  // ── 4. Resolve store ─────────────────────────────────
  const store = await resolveStoreBySlug(storeSlug);
  if (!store) {
    return { status: "service_unavailable" };
  }

  // ── 5. Call PR-C1 helper ─────────────────────────────
  const helperResult = await bindLineToCustomerInStore({
    storeId: store.id,
    lineUserId: verified.lineUserId,
    lineName: verified.displayName,
    phone,
    name,
    allowCreate: false,
  });

  // ── 6. Structured observability (PR-F1) ──────────────
  // Single line per onboarding attempt, masked. helper already logs its own
  // P2002 path; this captures every other terminal status from the caller side.
  logLineBindEvent({
    path: "liff-exchange",
    status: helperResult.status,
    storeId: store.id,
    storeSlug: store.slug,
    lineUserId: verified.lineUserId,
    customerId:
      "customerId" in helperResult ? helperResult.customerId : null,
    userId: "userId" in helperResult ? helperResult.userId : null,
    accountSyncStatus:
      "lineAccountSync" in helperResult ? helperResult.lineAccountSync : undefined,
  });

  if (
    helperResult.status === "created_new" ||
    helperResult.status === "bound_existing" ||
    helperResult.status === "already_synced"
  ) {
    await upsertCustomerIdentityLink({
      userId: helperResult.userId,
      storeId: store.id,
      customerId: helperResult.customerId,
      provider: "line",
      providerAccountId: verified.lineUserId,
      lineUserId: verified.lineUserId,
    });
  }

  // ── 7. Map to 顧客面 status ───────────────────────────
  switch (helperResult.status) {
    case "created_new":
    case "bound_existing":
    case "already_synced":
      return { status: "ok" };

    case "already_bound_to_other_line": {
      // A valid, owner-preauthorized channel migration may replace only the
      // stale LINE Login identity. Customer.lineUserId is the notification
      // recipient and must remain untouched.
      const { tryExecuteAuthorizedLiffLoginRebind } = await import(
        "@/server/services/liff-login-rebind"
      );
      const rebind = await tryExecuteAuthorizedLiffLoginRebind({
        storeId: store.id,
        customerId: helperResult.customerId,
        phone,
        candidateLineUserId: verified.lineUserId,
      });
      if (rebind.status === "executed") {
        logLineBindEvent({
          path: "liff-exchange",
          status: "authorized_liff_login_rebind_executed",
          storeId: store.id,
          storeSlug: store.slug,
          lineUserId: verified.lineUserId,
          customerId: helperResult.customerId,
        });
        return { status: "ok" };
      }
      return { status: "bound_other" };
    }

    case "phone_taken_by_other_user":
      return { status: "phone_taken_by_login_account" };

    case "ambiguous_multiple_candidates":
      return { status: "ambiguous" };

    case "customer_not_found":
      return { status: "not_found" };

    case "unique_conflict":
      // Concurrent bind beat us; user can retry — second attempt will hit the
      // 1-candidate branch and resolve cleanly. Show generic retry message.
      return { status: "service_unavailable" };

    case "validation_error":
      if (helperResult.reason === "invalid_phone") {
        return { status: "invalid_phone" };
      }
      // missing_input → caller bug；不該到顧客面
      console.error("[liff/onboarding] helper missing_input", helperResult);
      return { status: "service_unavailable" };

    default: {
      // Exhaustive check — 若未來 helper 新增 status，TypeScript 會擋下
      const _exhaustive: never = helperResult;
      void _exhaustive;
      console.error("[liff/onboarding] unhandled helper status", helperResult);
      return { status: "service_unavailable" };
    }
  }
}
