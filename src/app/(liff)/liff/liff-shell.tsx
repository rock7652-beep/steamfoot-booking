"use client";

/**
 * LiffShell — LIFF 入口頁 client component (PR-A + PR-C2 wiring)
 *
 * State machine (plan §2.1)：
 *   1. initializing            LIFF SDK 初始化中
 *   2. not_in_line_app         liff.init() OK 但不在 LINE App 內
 *   3. exchanging              正在呼 /api/liff/exchange
 *   4. need_onboarding         exchange 回 need_onboarding → 顯示「開始使用」CTA
 *   5. signed_in               exchange 回 session_created → 「歡迎回來」+ 3 顆 disabled CTA
 *   6. expired                 ID_TOKEN_EXPIRED / INVALID / 無 idToken → 重新整理 CTA
 *   7. service_unavailable     CONFIG / STORE_NOT_FOUND / NETWORK / SESSION_MINT_FAILED / INTERNAL / liff.init failed
 *
 * PR-C2 wiring (§11 決策)：
 *   - 手動 CTA（§11.2）：need_onboarding 顯示「開始使用」按鈕，不自動 redirect
 *   - 不自動 redirect：signed_in 也只顯示「歡迎回來」，不強跳預約
 *
 * 不做：
 *   - 不呼叫 helper / 不呼叫 signIn（那是 onboarding-form 的事）
 *   - 不接預約 / my-bookings / 剩餘堂數（PR-D；只放 disabled 按鈕）
 *   - 不寫 inline 中文（一律從 liffMessages 取）
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getIDToken,
  initLiff,
  isInLineClient,
} from "@/lib/liff/client";
import {
  contactStoreUrl,
  healthFlowLiffUrl,
  liffMessages,
} from "@/lib/liff/messages";

type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "exchanging" }
  | { kind: "need_onboarding"; displayName: string | null }
  | { kind: "signed_in"; displayName: string | null }
  | { kind: "expired" }
  | { kind: "service_unavailable" };

interface LiffShellProps {
  storeName: string;
  storeSlug: string;
  liffId: string;
}

export function LiffShell({ storeName, storeSlug, liffId }: LiffShellProps) {
  const [state, setState] = useState<State>({ kind: "initializing" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ── 1. Init LIFF ──
      try {
        await initLiff(liffId);
      } catch (err) {
        if (cancelled) return;
        console.warn("[liff-shell] liff.init failed", err);
        setState({ kind: "service_unavailable" });
        return;
      }
      if (cancelled) return;

      // ── 2. 環境檢查 ──
      if (!isInLineClient()) {
        setState({ kind: "not_in_line_app" });
        return;
      }
      const idToken = getIDToken();
      if (!idToken) {
        setState({ kind: "expired" });
        return;
      }

      // ── 3. /api/liff/exchange ──
      setState({ kind: "exchanging" });
      try {
        const res = await fetch("/api/liff/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, storeSlug }),
        });
        if (cancelled) return;
        const body = (await res.json().catch(() => null)) as
          | { status: "session_created"; displayName: string | null }
          | { status: "need_onboarding"; displayName: string | null }
          | { status: "error"; code?: string }
          | null;

        if (!body) {
          setState({ kind: "service_unavailable" });
          return;
        }

        if (body.status === "session_created") {
          setState({ kind: "signed_in", displayName: body.displayName });
          return;
        }
        if (body.status === "need_onboarding") {
          setState({ kind: "need_onboarding", displayName: body.displayName });
          return;
        }

        // error path — 只區分 expired vs service_unavailable（顧客面）
        if (
          body.status === "error" &&
          (body.code === "ID_TOKEN_EXPIRED" || body.code === "ID_TOKEN_INVALID")
        ) {
          setState({ kind: "expired" });
          return;
        }
        setState({ kind: "service_unavailable" });
      } catch (err) {
        if (cancelled) return;
        console.warn("[liff-shell] exchange fetch failed", err);
        setState({ kind: "service_unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId, storeSlug]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">{storeName}</p>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.shell.initializing} />
      )}
      {state.kind === "exchanging" && (
        <Loading text={liffMessages.shell.exchanging} />
      )}

      {state.kind === "not_in_line_app" && (
        <InfoBlock
          tone="earth"
          title={liffMessages.shell.notInLineApp.title}
          body={liffMessages.shell.notInLineApp.body}
          showContactStore
        />
      )}

      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          showRetry
        />
      )}

      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.error.serviceUnavailable}
          showRetry
          showContactStore
        />
      )}

      {state.kind === "need_onboarding" && (
        <WelcomeCta storeSlug={storeSlug} displayName={state.displayName} />
      )}

      {state.kind === "signed_in" && (
        <WelcomeBack storeSlug={storeSlug} displayName={state.displayName} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-blocks
// ──────────────────────────────────────────────────────────

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
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
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
            href={contactStoreUrl}
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

function WelcomeCta({
  storeSlug,
  displayName,
}: {
  storeSlug: string;
  displayName: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-earth-200 bg-white px-4 py-5">
        <h2 className="text-lg font-semibold text-earth-900">
          {liffMessages.shell.welcomeTitle}
          {displayName ? `，${displayName}` : ""}
        </h2>
        <p className="mt-2 text-sm text-earth-700">
          {liffMessages.shell.welcomeBody}
        </p>
      </div>
      <Link
        href={`/s/${storeSlug}/liff/onboarding`}
        className="inline-flex w-full items-center justify-center rounded-xl bg-earth-800 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98]"
      >
        {liffMessages.shell.welcomeCta}
      </Link>
      <p className="px-1 text-center text-xs text-earth-500">
        {liffMessages.shell.welcomeFootnote}
      </p>
    </div>
  );
}

function WelcomeBack({
  storeSlug,
  displayName,
}: {
  storeSlug: string;
  displayName: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-900">
        <p className="font-medium">
          {liffMessages.shell.signedInTitle}
          {displayName ? `，${displayName}` : ""}
        </p>
        <p className="mt-1 text-xs text-green-800/80">
          {liffMessages.shell.signedInBody}
        </p>
      </div>
      {/* PR-E3：簡短 helper copy 讓顧客知道 3 顆 CTA 可以做什麼。
          muted secondary tone — 不搶 primary CTA 焦點；mobile-first 小字。*/}
      <p className="px-1 text-sm text-earth-700">
        {liffMessages.shell.welcomeHomeHint}
      </p>
      {/* PR-D1B：體驗預約 CTA 從 disabled 改為 Link → /liff/trial-booking */}
      <Link
        href={`/s/${storeSlug}/liff/trial-booking`}
        className="flex w-full items-center justify-between rounded-xl bg-earth-800 px-4 py-3 text-left text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98]"
      >
        <span>{liffMessages.shell.comingSoon.booking}</span>
        <ChevronRightIcon />
      </Link>
      {/* PR-D2：我的預約 CTA 從 disabled 改為 Link → /liff/bookings */}
      <Link
        href={`/s/${storeSlug}/liff/bookings`}
        className="flex w-full items-center justify-between rounded-xl border border-earth-300 bg-white px-4 py-3 text-left text-base font-medium text-earth-900 shadow-sm transition hover:bg-earth-50 active:scale-[0.98]"
      >
        <span>{liffMessages.shell.comingSoon.myBookings}</span>
        <ChevronRightIcon />
      </Link>
      {/* PR-E2b：剩餘堂數 / 我的方案 CTA 從 disabled 改為 Link → /liff/wallets (PR-E2 page 已 ship) */}
      <Link
        href={`/s/${storeSlug}/liff/wallets`}
        className="flex w-full items-center justify-between rounded-xl border border-earth-300 bg-white px-4 py-3 text-left text-base font-medium text-earth-900 shadow-sm transition hover:bg-earth-50 active:scale-[0.98]"
      >
        <span>{liffMessages.shell.comingSoon.remainingSessions}</span>
        <ChevronRightIcon />
      </Link>

      {/* PR-F1A：HealthFlow AI 健康評估外部 LIFF 入口。
          視覺與 3 個主流程入口分離 — border-t + pt-3 + mt-1 強調「次要 / 外部服務」。
          Transport：button + onClick { window.location.href = ... } same-page nav。
          per PR #184 教訓：LINE iOS webview 對 button + window.location.href 最穩；
          不用 target="_blank"（popup blocker）/ liff.openWindow（LIFF context 衝突）/ <a href>（缺 user gesture 明確性）。
          URL 不傳任何 query string — HealthFlow 用自己 LIFF ID 處理 LINE 身份。*/}
      <div className="mt-1 flex flex-col gap-2 border-t border-earth-200 pt-3">
        <button
          type="button"
          onClick={() => {
            window.location.href = healthFlowLiffUrl;
          }}
          className="flex w-full items-center justify-between rounded-xl border border-earth-300 bg-white px-4 py-3 text-left text-base font-medium text-earth-900 shadow-sm transition hover:bg-earth-50 active:scale-[0.98]"
        >
          <span>{liffMessages.shell.healthAssessmentCta}</span>
          <ChevronRightIcon />
        </button>
        <p className="px-1 text-xs text-earth-600">
          {liffMessages.shell.healthAssessmentHint}
        </p>
      </div>
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// PR-E2b：DisabledCta 元件移除 — 3 顆 CTA (booking / myBookings / wallets) 已全部 wire。
// 若未來新增 disabled CTA 需求，可從 git history 找回。
