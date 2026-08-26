"use client";

/**
 * LIFF My Wallets List (PR-E2)
 *
 * 流程：
 *   1. mount → initLiff → isInLineClient → ready
 *   2. ready → call fetchLiffWallets → 分 3 個 section 顯示
 *
 * 範圍（per PR-E2 拍板）：
 *   ✅ 三段 section：有效方案 / 已過期 / 歷史方案
 *   ✅ Hero 大字「可預約 X 堂」(walletAvailableToBook，非 raw remainingSessions)
 *   ✅ 拆分小字：方案剩餘 R/T + 待到店 / 已使用 / 已註銷
 *   ✅ 7 天內到期 badge
 *   ✅ Defensive 分類：ACTIVE+0 視同 USED_UP；ACTIVE+過期 視同 EXPIRED
 *   ✅ 空狀態 + 聯絡店家 CTA
 *   ✅ 購買 / 續購留在 LIFF 專屬頁面，共用既有付款與通知後端
 *   ❌ 不導向顧客網頁版；延長 / 註銷 / 編輯仍由店家處理
 *   ❌ 不顯示 WalletSession 明細
 *   ❌ 不從預約頁加入口（PR-E2 拍板）
 *
 * Mobile-first：max-w-md。文案一律 `liffMessages.wallets.*` / `liffMessages.error.*`，不寫 inline 中文。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { initLiff, isInLineClient, getIDToken } from "@/lib/liff/client";
import {
  fetchLiffWallets,
  type LiffWalletRow,
  type LiffMakeupCreditRow,
} from "@/server/actions/liff-my-wallets";
import { isExpiringSoon } from "@/lib/liff/my-wallets";
import { liffMessages } from "@/lib/liff/messages";

type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "service_unavailable" }
  | {
      kind: "ready";
      active: LiffWalletRow[];
      expired: LiffWalletRow[];
      history: LiffWalletRow[];
      makeupCredits: LiffMakeupCreditRow[];
    };

interface Props {
  storeSlug: string;
  storeName: string;
  liffId: string;
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
}

export function WalletsList({ storeSlug, storeName, liffId, contactUrl }: Props) {
  const [state, setState] = useState<State>({ kind: "initializing" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ── 1. init LIFF ──
      try {
        await initLiff(liffId);
      } catch (err) {
        if (cancelled) return;
        console.warn("[liff-my-wallets] liff.init failed", err);
        setState({ kind: "service_unavailable" });
        return;
      }
      if (cancelled) return;

      if (!isInLineClient()) {
        setState({ kind: "not_in_line_app" });
        return;
      }
      const idToken = getIDToken();
      if (!idToken) {
        setState({ kind: "expired" });
        return;
      }

      // ── 2. fetch wallets ──
      // fetchLiffWallets 零 client 參數；session 在 server side 解
      let result;
      try {
        result = await fetchLiffWallets();
      } catch (err) {
        if (cancelled) return;
        console.warn("[liff-my-wallets] fetchLiffWallets threw", err);
        setState({ kind: "service_unavailable" });
        return;
      }
      if (cancelled) return;

      if (result.status === "no_customer") {
        setState({ kind: "expired" });
        return;
      }
      if (result.status === "service_unavailable") {
        setState({ kind: "service_unavailable" });
        return;
      }
      setState({
        kind: "ready",
        active: result.active,
        expired: result.expired,
        history: result.history,
        makeupCredits: result.makeupCredits,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-widest text-earth-500">
          {storeName}
        </p>
        <h1 className="mt-1 text-xl font-bold text-earth-900">
          {liffMessages.wallets.title}
        </h1>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.wallets.initializing} />
      )}
      {state.kind === "not_in_line_app" && (
        <InfoBlock
          tone="earth"
          title={liffMessages.shell.notInLineApp.title}
          body={liffMessages.shell.notInLineApp.body}
          storeSlug={storeSlug}
          contactUrl={contactUrl}
          showContactStore
        />
      )}
      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          storeSlug={storeSlug}
          contactUrl={contactUrl}
          showRetry
        />
      )}
      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.wallets.loadFailed}
          storeSlug={storeSlug}
          contactUrl={contactUrl}
          showRetry
          showContactStore
        />
      )}

      {state.kind === "ready" && (
        <ReadyView
          active={state.active}
          expired={state.expired}
          history={state.history}
          makeupCredits={state.makeupCredits}
          storeSlug={storeSlug}
          contactUrl={contactUrl}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Ready view
// ──────────────────────────────────────────────────────────

function ReadyView({
  active,
  expired,
  history,
  makeupCredits,
  storeSlug,
  contactUrl,
}: {
  active: LiffWalletRow[];
  expired: LiffWalletRow[];
  history: LiffWalletRow[];
  makeupCredits: LiffMakeupCreditRow[];
  storeSlug: string;
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
}) {
  const totalCount =
    active.length + expired.length + history.length + makeupCredits.length;
  const isEmpty = totalCount === 0;
  // 「立即預約」CTA 顯示條件 — 有可預約堂數或有有效補課券（PR-NoShow-2：補課券也能預約）
  const totalAvailable = active.reduce((sum, w) => sum + w.availableToBook, 0);
  const showBookNow = totalAvailable > 0 || makeupCredits.length > 0;

  return (
    <>
      {isEmpty ? (
        <EmptyState storeSlug={storeSlug} contactUrl={contactUrl} />
      ) : (
        <>
          <Link
            href={`/s/${storeSlug}/liff/wallets/shop`}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
          >
            {liffMessages.wallets.ctaRenewPlan}
          </Link>

          {active.length > 0 && (
            <Section title={liffMessages.wallets.activeSectionTitle}>
              {active.map((w) => (
                <WalletCard key={w.id} wallet={w} variant="active" />
              ))}
            </Section>
          )}
          {expired.length > 0 && (
            <Section title={liffMessages.wallets.expiredSectionTitle} dim>
              {expired.map((w) => (
                <WalletCard key={w.id} wallet={w} variant="expired" />
              ))}
            </Section>
          )}
          {history.length > 0 && (
            <Section title={liffMessages.wallets.historySectionTitle} dim>
              {history.map((w) => (
                <WalletCard key={w.id} wallet={w} variant="history" />
              ))}
            </Section>
          )}
          {makeupCredits.length > 0 && (
            <Section
              title={liffMessages.wallets.makeupSectionTitle.replace(
                "{count}",
                String(makeupCredits.length),
              )}
            >
              {makeupCredits.map((c) => (
                <MakeupCreditCard key={c.id} credit={c} />
              ))}
            </Section>
          )}
        </>
      )}

      {/* PR-G3：「立即預約」primary CTA — 用 active 加總 availableToBook > 0
          才顯示；同站內 LINE webview 用 next/link same-page nav 即可。
          連 /liff/member-booking (PR-G3 主體 page)。 */}
      {showBookNow && (
        <Link
          href={`/s/${storeSlug}/liff/member-booking`}
          className="mt-4 inline-flex w-full min-h-[48px] items-center justify-center rounded-xl bg-earth-800 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-earth-700 active:scale-[0.98]"
        >
          {liffMessages.wallets.ctaBookNow}
        </Link>
      )}

      {/* PR-E4：聯絡店家 + 回首頁 並排在頁腳。聯絡店家 LINE-green 與既有 LIFF
          各處 contact CTA 一致；回首頁 outlined secondary，兩者視覺平衡，
          顧客有問題（剩餘堂數 / 過期 / 用完）能直接找店家確認。 */}
      <div className={`${showBookNow ? "mt-2" : "mt-4"} flex gap-2`}>
        <a
          href={contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#05b54d] active:scale-[0.98]"
        >
          <LineIcon />
          {liffMessages.bookings.contactStoreCta}
        </a>
        <Link
          href={`/s/${storeSlug}/liff`}
          className="flex flex-1 items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
        >
          {liffMessages.wallets.backHomeCta}
        </Link>
      </div>
    </>
  );
}

function Section({
  title,
  dim = false,
  children,
}: {
  title: string;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className={`mb-2 text-sm font-semibold ${
          dim ? "text-earth-600" : "text-earth-900"
        }`}
      >
        {title}
      </h2>
      <div className={`flex flex-col gap-3 ${dim ? "opacity-70" : ""}`}>
        {children}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────
// Wallet card — 兩層資訊
//   hero 大字：可預約 X 堂  (walletAvailableToBook)
//   小字拆分：方案剩餘 R/T + 待到店 / 已使用 / 已註銷
// ──────────────────────────────────────────────────────────

function WalletCard({
  wallet,
  variant,
}: {
  wallet: LiffWalletRow;
  variant: "active" | "expired" | "history";
}) {
  const m = liffMessages.wallets;
  const expiringSoon = variant === "active" && isExpiringSoon(wallet.expiryDate);

  // history section 內可能是 USED_UP / CANCELLED / ACTIVE+0
  // 顯示對應的 badge（顧客語）
  const statusBadge = (() => {
    if (variant === "expired") return m.expiredBadge;
    if (variant === "history") {
      if (wallet.status === "CANCELLED") return m.cancelledBadge;
      return m.usedUpBadge; // USED_UP 或 ACTIVE+0 defensive 都歸這
    }
    return null; // active section 不顯示 badge（除非 expiringSoon 才顯紅字）
  })();

  return (
    <div className="rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-sm">
      {/* Header: plan name + 即將到期 / 過期 badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold text-earth-900">
          {wallet.planName}
        </p>
        {expiringSoon && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            {m.expiringSoonBadge}
          </span>
        )}
        {statusBadge && (
          <span className="shrink-0 rounded-full bg-earth-100 px-2 py-0.5 text-xs font-medium text-earth-700">
            {statusBadge}
          </span>
        )}
      </div>

      {/* Hero 大字 — 可預約 X 堂（walletAvailableToBook 結果）*/}
      {/* 過期 / 歷史方案不再顯示「可預約」hero，避免誤導 */}
      {variant === "active" && (
        <p className="mt-2">
          <span className="text-3xl font-bold tabular-nums text-earth-900">
            {wallet.availableToBook}
          </span>
          <span className="ml-1 text-sm font-medium text-earth-700">
            {m.availableSuffix}
          </span>
        </p>
      )}

      {/* 拆分小字 — 方案剩餘 + 待到店 + 已使用 + 已註銷 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-earth-600">
        <span>
          {m.remainingLabel}{" "}
          <strong className="text-earth-900">
            {wallet.remainingSessions} / {wallet.totalSessions}
          </strong>{" "}
          {m.sessionsUnit}
        </span>
        {wallet.pendingCount > 0 && (
          <span>
            {m.pendingLabel}{" "}
            <strong className="text-blue-700">{wallet.pendingCount}</strong>
          </span>
        )}
        {wallet.usedCount > 0 && (
          <span>
            {m.usedLabel}{" "}
            <strong className="text-earth-900">{wallet.usedCount}</strong>
          </span>
        )}
        {wallet.voidedCount > 0 && (
          <span>
            {m.voidedLabel}{" "}
            <strong className="text-earth-900">{wallet.voidedCount}</strong>
          </span>
        )}
      </div>

      {/* Footer — 有效期 */}
      <p className="mt-2 border-t border-earth-100 pt-2 text-xs text-earth-500">
        {wallet.expiryDate
          ? `${m.validUntilLabel} ${formatDateLabel(wallet.expiryDate)}`
          : m.noExpiryLabel}
      </p>
    </div>
  );
}

function MakeupCreditCard({ credit }: { credit: LiffMakeupCreditRow }) {
  const m = liffMessages.wallets;
  const expiring = isExpiringSoon(credit.expiredAt);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        {m.makeupCreditLabel}
      </p>
      <p
        className={`mt-0.5 text-xs ${expiring ? "font-medium text-red-600" : "text-amber-700"}`}
      >
        {credit.expiredAt
          ? m.makeupExpiryLabel.replace("{date}", formatDateLabel(credit.expiredAt))
          : m.makeupNoExpiryLabel}
      </p>
      <p className="mt-1 text-[11px] text-earth-500">{m.makeupNoDeductHint}</p>
    </div>
  );
}

function EmptyState({
  storeSlug,
  contactUrl,
}: {
  storeSlug: string;
  contactUrl: string;
}) {
  const m = liffMessages.wallets;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-earth-300 bg-white px-4 py-10 text-center">
      <p className="text-base font-semibold text-earth-900">{m.emptyTitle}</p>
      <p className="text-sm text-earth-600">{m.emptyBody}</p>
      <Link
        href={`/s/${storeSlug}/liff/wallets/shop`}
        className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-earth-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-earth-700 active:scale-[0.98]"
      >
        {m.ctaPurchasePlan}
      </Link>
      <a
        href={contactUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#05b54d] active:scale-[0.98]"
      >
        <LineIcon />
        {liffMessages.bookings.contactStoreCta}
      </a>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → "YYYY/MM/DD" 台灣慣例顯示。 */
function formatDateLabel(yyyymmdd: string): string {
  return yyyymmdd.replace(/-/g, "/");
}

// ──────────────────────────────────────────────────────────
// Generic blocks (同 /liff/bookings 視覺風格)
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
  storeSlug,
  contactUrl,
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
  storeSlug: string;
  /** PR-E：per-store LINE OA 連結；showContactStore=true 時必填。 */
  contactUrl: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    green: "border-green-200 bg-green-50 text-green-900",
    red: "border-red-200 bg-red-50 text-red-900",
    yellow: "border-amber-200 bg-amber-50 text-amber-900",
    earth: "border-earth-200 bg-earth-50 text-earth-900",
  };
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border px-4 py-5 text-sm ${toneClasses[tone]}`}
    >
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
        <Link
          href={`/s/${storeSlug}/liff`}
          className="rounded-md border border-current bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white"
        >
          {liffMessages.wallets.backHomeCta}
        </Link>
      </div>
    </div>
  );
}

/**
 * LINE logo SVG（顧客 affordance — 看到就知道「按了會回 LINE 聊天」）。
 * 同 svg path 在 src/app/(liff)/liff/bookings/bookings-list.tsx 也 inline；
 * per E1-1 同 pattern「duplicate over abstraction」— LIFF 入口元件各自獨立。
 */
function LineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}
