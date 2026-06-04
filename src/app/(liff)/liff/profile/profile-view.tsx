"use client";

/**
 * LIFF Profile View (PR-LIFF-profile)
 *
 * 流程：
 *   1. mount → initLiff → isInLineClient → ready
 *   2. ready → call fetchLiffCustomerProfile → 顯示 profile rows + 回會員中心
 *
 * 範圍：
 *   ✅ 顯示 6 個欄位：姓名 / 電話 / Email / LINE 綁定狀態 / LINE 顯示名稱 / 所屬門市
 *   ✅ Email 未填 → 「未填寫」中性文案
 *   ✅ lineName 未填 → 「未綁定或未填寫」中性文案
 *   ✅ LINE 綁定狀態 3 態：已綁定 / 尚未綁定 / 需店家協助確認
 *   ✅ 已綁定時顯示 masked lineUserId tail（U******xxxx）作為 support-triage 用
 *   ✅ 「回會員中心」按鈕（Link → /s/{slug}/liff）
 *   ❌ 不提供編輯（read-only）
 *   ❌ 不顯示完整 lineUserId
 *   ❌ 不查 / 不寫 DB（server action 內處理）
 *
 * Mobile-first：max-w-md。文案一律 liffMessages.profile.* / liffMessages.error.*，
 * 不寫 inline 中文（與 bookings-list / wallets-list 同規則）。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initLiff, isInLineClient, getIDToken } from "@/lib/liff/client";
import { liffMessages } from "@/lib/liff/messages";
import { type LiffCustomerProfile } from "@/server/actions/liff-customer-profile";
import { loadProfileWithSessionRefresh } from "@/lib/liff/profile-loader";

type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "no_customer" }
  | { kind: "service_unavailable" }
  | { kind: "ready"; profile: LiffCustomerProfile };

interface Props {
  storeSlug: string;
  storeName: string;
  liffId: string;
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
}

export function ProfileView({
  storeSlug,
  storeName,
  liffId,
  contactUrl,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "initializing" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initLiff(liffId);
        if (cancelled) return;
        if (!isInLineClient()) {
          setState({ kind: "not_in_line_app" });
          return;
        }
        // Pre-flight: ensure idToken is available (mirrors bookings-list /
        // wallets-list pattern). If expired / missing → render expired
        // state so user can retry; do NOT call the loader without a token
        // — without a token, exchange cannot verify the current LINE user
        // and the stale-cookie risk re-opens.
        const idToken = getIDToken();
        if (!idToken) {
          setState({ kind: "expired" });
          return;
        }

        // PR #257 round 4 (Codex P2 cross-customer leak fix):
        // `loadProfileWithSessionRefresh` runs `/api/liff/exchange` FIRST
        // to refresh the NextAuth session against the current LIFF
        // idToken, THEN reads the customer profile. Without this two-step
        // sequence, a stale cookie from a previously-logged-in customer
        // could leak that customer's name / phone / email to a different
        // current LINE user on the same device.
        const result = await loadProfileWithSessionRefresh({
          idToken,
          storeSlug,
        });
        if (cancelled) return;

        if (result.kind === "ok") {
          setState({ kind: "ready", profile: result.profile });
        } else if (result.kind === "need_onboarding") {
          // Mirror liff-shell behaviour: profile is a deep page, so we
          // PUSH the user to the canonical onboarding flow rather than
          // rendering a hybrid CTA here. State stays "initializing"
          // (spinner) during the navigation so the user sees consistent
          // transition feedback.
          router.push(`/s/${storeSlug}/liff/onboarding`);
          return;
        } else if (result.kind === "expired") {
          setState({ kind: "expired" });
        } else if (result.kind === "no_customer") {
          setState({ kind: "no_customer" });
        } else {
          setState({ kind: "service_unavailable" });
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[liff-profile] init / fetch failed", err);
        setState({ kind: "service_unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId, storeSlug, router]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-earth-900">
          {liffMessages.profile.pageTitle}
        </h1>
        <p className="text-xs text-earth-600">{storeName}</p>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.profile.initializing} />
      )}

      {state.kind === "not_in_line_app" && (
        <InfoBlock
          tone="earth"
          title={liffMessages.shell.notInLineApp.title}
          body={liffMessages.shell.notInLineApp.body}
          contactUrl={contactUrl}
          showContactStore
        />
      )}

      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          contactUrl={contactUrl}
          showRetry
        />
      )}

      {state.kind === "no_customer" && (
        <InfoBlock
          tone="earth"
          title={liffMessages.profile.noCustomerTitle}
          body={liffMessages.profile.noCustomerBody}
          contactUrl={contactUrl}
          showContactStore
        />
      )}

      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.error.serviceUnavailable}
          contactUrl={contactUrl}
          showRetry
          showContactStore
        />
      )}

      {state.kind === "ready" && (
        <>
          <ReadyView profile={state.profile} />
          <Link
            href={`/s/${storeSlug}/liff`}
            className="mt-2 flex w-full items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-3 text-sm font-medium text-earth-700 transition hover:bg-earth-50 active:scale-[0.98]"
          >
            {liffMessages.profile.backToHomeCta}
          </Link>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-blocks
// ──────────────────────────────────────────────────────────

function ReadyView({ profile }: { profile: LiffCustomerProfile }) {
  // Defensive: if `phone` looks like an OAuth placeholder (`_oauth_line_…`
  // or `_oauth_google_…`), surface as "未填寫" — closeout doc §1 row 3 (Case C
  // inline) flags this as a documented data shape; the customer should NOT
  // see the placeholder string.
  const phoneDisplay = profile.phone.startsWith("_oauth_")
    ? liffMessages.profile.fieldUnfilled
    : profile.phone;
  const emailDisplay = profile.email ?? liffMessages.profile.fieldUnfilled;
  const lineNameDisplay = profile.lineName ?? liffMessages.profile.lineNameEmpty;

  const lineStatusLabel = {
    linked: liffMessages.profile.lineStatusLinked,
    unlinked: liffMessages.profile.lineStatusUnlinked,
    needs_help: liffMessages.profile.lineStatusNeedsHelp,
  }[profile.lineStatus];
  const lineStatusToneClass = {
    linked: "border-green-200 bg-green-50 text-green-900",
    unlinked: "border-earth-200 bg-earth-50 text-earth-700",
    needs_help: "border-amber-200 bg-amber-50 text-amber-900",
  }[profile.lineStatus];

  return (
    <div className="flex flex-col gap-3">
      <Field label={liffMessages.profile.fieldName} value={profile.name} />
      <Field label={liffMessages.profile.fieldPhone} value={phoneDisplay} />
      <Field label={liffMessages.profile.fieldEmail} value={emailDisplay} />

      <div className={`flex flex-col gap-1 rounded-xl border px-4 py-3 ${lineStatusToneClass}`}>
        <p className="text-xs font-medium opacity-80">
          {liffMessages.profile.fieldLineStatus}
        </p>
        <p className="text-base font-semibold">{lineStatusLabel}</p>
        {profile.lineUserIdMasked && (
          <p className="font-mono text-xs opacity-70">
            ID: {profile.lineUserIdMasked}
          </p>
        )}
      </div>

      <Field label={liffMessages.profile.fieldLineName} value={lineNameDisplay} />
      <Field label={liffMessages.profile.fieldStoreName} value={profile.storeName} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-earth-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-earth-600">{label}</p>
      <p className="break-words text-base text-earth-900">{value}</p>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-8 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
        aria-hidden
      />
      <p className="text-sm text-earth-600">{text}</p>
    </div>
  );
}

function InfoBlock({
  tone,
  title,
  body,
  showRetry,
  showContactStore,
  contactUrl,
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
  contactUrl: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    green: "border-green-200 bg-green-50 text-green-900",
    red: "border-red-200 bg-red-50 text-red-900",
    yellow: "border-amber-200 bg-amber-50 text-amber-900",
    earth: "border-earth-200 bg-earth-50 text-earth-900",
  };
  return (
    <div className={`flex flex-col gap-3 rounded-xl border px-4 py-5 text-sm ${toneClasses[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      <p className="text-xs break-words opacity-90">{body}</p>
      <div className="flex flex-wrap gap-2">
        {showRetry && (
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.retryCta}
          </button>
        )}
        {showContactStore && (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
          >
            {liffMessages.error.contactStoreCta}
          </a>
        )}
      </div>
    </div>
  );
}
