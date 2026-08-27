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
import { liffMessages } from "@/lib/liff/messages";
import {
  fetchLiffWallets,
  type LiffWalletRow,
  type LiffMakeupCreditRow,
} from "@/server/actions/liff-my-wallets";
import {
  fetchLiffBookings,
  type LiffBookingRow,
} from "@/server/actions/liff-my-bookings";
import { fetchLiffHealthSummary } from "@/server/actions/liff-health";
import {
  fetchLiffMemberStoreContext,
  type LiffMemberStoreOption,
} from "@/server/actions/liff-member-stores";
import type { HealthSummary } from "@/lib/health-service";
import { getMemberPlanSummary } from "@/lib/liff/member-plan-summary";
import {
  fetchLiffReferralShareContext,
  type LiffReferralShareContext,
} from "@/server/actions/liff-referral-share";
import { LiffStoreSwitcher } from "./liff-store-switcher";
import { LiffStoreShareCard } from "./liff-store-share-card";
import {
  STEAMFOOT_INDUSTRY_MODULE,
  type MemberHomeTerminology,
} from "@/lib/industry-modules";

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
  /** PR-E：per-store LINE OA 連結。Server 端 resolveStorePresentation 解析後注入。 */
  contactUrl: string;
  healthAssessmentEnabled: boolean;
}

/**
 * PR-G4 wallet summary：signed_in 後 lazy fetch；totalBookable > 0 才在 home
 * 露「課程預約」CTA。null 表示尚未載 / 載失敗 → CTA 不出（不擋既有 4 顆 CTA）。
 */
export type MemberHomeSummary = {
  walletsStatus: "ok" | "error";
  activeWallets: LiffWalletRow[];
  makeupCredits: LiffMakeupCreditRow[];
  upcomingBookings: LiffBookingRow[];
  nextBooking: LiffBookingRow | null;
  healthSummary: HealthSummary | null;
  referralShare: LiffReferralShareContext | null;
};

export function LiffShell({
  storeName,
  storeSlug,
  liffId,
  contactUrl,
  healthAssessmentEnabled,
}: LiffShellProps) {
  const [state, setState] = useState<State>({ kind: "initializing" });
  // PR-G4：lazy fetch — signed_in 後 fire-and-forget，不擋 home 既有渲染
  const [memberSummary, setMemberSummary] = useState<MemberHomeSummary | "error" | null>(null);
  const [memberStores, setMemberStores] = useState<LiffMemberStoreOption[]>([]);

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

      const loadMemberHome = async () => {
        try {
          const [wallets, bookings, health, referralShare] = await Promise.all([
            fetchLiffWallets(),
            fetchLiffBookings(),
            healthAssessmentEnabled
              ? fetchLiffHealthSummary()
              : Promise.resolve(null),
            fetchLiffReferralShareContext(),
          ]);
          if (cancelled) return;
          setMemberSummary({
            walletsStatus: wallets?.status === "ok" ? "ok" : "error",
            activeWallets: wallets?.status === "ok" ? wallets.active : [],
            makeupCredits:
              wallets?.status === "ok" ? wallets.makeupCredits : [],
            upcomingBookings:
              bookings.status === "ok" ? bookings.upcoming : [],
            nextBooking:
              bookings.status === "ok" ? (bookings.upcoming[0] ?? null) : null,
            healthSummary:
              health?.status === "ok" && health.linked
                ? health.summary
                : null,
            referralShare:
              referralShare.status === "ok"
                ? referralShare.context
                : null,
          });
        } catch (err) {
          console.warn("[liff-shell] member home summary failed (silent)", err);
          if (!cancelled) setMemberSummary("error");
        }
      };

      // A central-member session can safely follow an internal store switch
      // without repeating LINE exchange for each store. The server action
      // validates the URL store against verified memberships before returning.
      try {
        const memberContext = await fetchLiffMemberStoreContext();
        if (cancelled) return;
        if (memberContext.status === "signed_in") {
          setMemberStores(memberContext.stores);
          setState({
            kind: "signed_in",
            displayName: memberContext.displayName,
          });
          void loadMemberHome();
          return;
        }
      } catch (err) {
        console.warn("[liff-shell] existing member session check failed", err);
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
          const memberContext = await fetchLiffMemberStoreContext().catch(
            () => null,
          );
          if (cancelled) return;
          if (memberContext?.status === "signed_in") {
            setMemberStores(memberContext.stores);
          }
          setState({
            kind: "signed_in",
            displayName:
              memberContext?.status === "signed_in"
                ? memberContext.displayName
                : body.displayName,
          });
          // 會員首頁摘要採 lazy fetch，不阻擋首頁殼層；任一摘要來源失敗都 graceful fallback。
          void loadMemberHome();
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
  }, [healthAssessmentEnabled, liffId, storeSlug]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-10 pt-7">
      <header className="flex items-center justify-between">
        <div>
          {state.kind === "signed_in" ? (
            <LiffStoreSwitcher
              currentStoreSlug={storeSlug}
              currentStoreName={storeName}
              stores={memberStores}
            />
          ) : (
            <p className="text-sm font-semibold tracking-[0.12em] text-primary-700">{storeName}</p>
          )}
          <p className="mt-0.5 text-sm text-earth-500">{liffMessages.shell.memberHomeLabel}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700 shadow-sm" aria-hidden>
          <LeafIcon />
        </div>
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
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "expired" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.expired}
          showRetry
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.error.serviceUnavailable}
          showRetry
          showContactStore
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "need_onboarding" && (
        <WelcomeCta storeSlug={storeSlug} displayName={state.displayName} />
      )}

      {state.kind === "signed_in" && (
        <WelcomeBack
          storeSlug={storeSlug}
          displayName={state.displayName}
          memberSummary={memberSummary}
          healthAssessmentEnabled={healthAssessmentEnabled}
        />
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
  contactUrl,
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  showRetry?: boolean;
  showContactStore?: boolean;
  /** PR-E：per-store LINE OA 連結。showContactStore=true 時必填。 */
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
      <p className="liff-supporting-text break-words opacity-90">{body}</p>
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

function WelcomeCta({
  storeSlug,
  displayName,
}: {
  storeSlug: string;
  displayName: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-white px-5 py-6 shadow-[0_10px_30px_rgba(74,66,53,0.08)] ring-1 ring-earth-200/70">
        <h2 className="text-2xl font-semibold leading-snug text-earth-900">
          {liffMessages.shell.welcomeTitle}
          {displayName ? `，${displayName}` : ""}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-earth-600">
          {liffMessages.shell.welcomeBody}
        </p>
      </div>
      <Link
        href={`/s/${storeSlug}/liff/onboarding`}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-primary-600 px-5 py-3 text-base font-semibold text-white shadow-[0_8px_20px_rgba(90,108,71,0.22)] transition hover:bg-primary-700 active:scale-[0.98]"
      >
        {liffMessages.shell.welcomeCta}
      </Link>
      <p className="liff-supporting-text px-1 text-center text-earth-500">
        {liffMessages.shell.welcomeFootnote}
      </p>
    </div>
  );
}

export function WelcomeBack({
  storeSlug,
  displayName,
  memberSummary,
  healthAssessmentEnabled,
  terminology,
}: {
  storeSlug: string;
  displayName: string | null;
  memberSummary: MemberHomeSummary | "error" | null;
  healthAssessmentEnabled: boolean;
  terminology?: MemberHomeTerminology;
}) {
  if (!memberSummary) {
    return (
      <div className="flex flex-col gap-4">
        <p className="px-1 text-sm font-medium text-earth-600">
          {liffMessages.shell.signedInTitle}{displayName ? `，${displayName}` : ""}
        </p>
        <MemberHomeSummaryLoading />
      </div>
    );
  }

  if (memberSummary === "error") {
    return (
      <div className="flex flex-col gap-4">
        <p className="px-1 text-sm font-medium text-earth-600">
          {liffMessages.shell.signedInTitle}{displayName ? `，${displayName}` : ""}
        </p>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-6 text-center text-amber-900">
          <p className="text-sm font-semibold">目前無法讀取門市資料</p>
          <p className="mt-2 text-xs text-amber-800">請重新整理後再試一次，您的方案與堂數不會受到影響。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 min-h-11 rounded-xl border border-amber-300 bg-white px-5 text-sm font-semibold"
          >
            重新整理
          </button>
        </div>
      </div>
    );
  }

  const wallets = memberSummary?.activeWallets ?? [];
  const { totalUsable, totalBooked, totalBookable } = getMemberPlanSummary(
    wallets,
    memberSummary?.upcomingBookings ?? [],
  );
  const nextBooking = memberSummary?.nextBooking ?? null;
  const makeupCredits = memberSummary?.makeupCredits ?? [];
  const nearestWalletExpiry = wallets.map((wallet) => wallet.expiryDate).find(Boolean) ?? null;
  const nearestMakeupExpiry = makeupCredits.map((credit) => credit.expiredAt).find(Boolean) ?? null;
  const healthChange = getHealthChange(memberSummary?.healthSummary ?? null);
  const walletsAvailable = memberSummary.walletsStatus === "ok";
  const labels = terminology ?? STEAMFOOT_INDUSTRY_MODULE.customer;

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-sm font-medium text-earth-600">
        {liffMessages.shell.signedInTitle}{displayName ? `，${displayName}` : ""}
      </p>

      <section className="rounded-3xl bg-earth-900 px-5 py-4 text-white shadow-[0_14px_34px_rgba(52,47,39,0.18)]">
        <p className="text-sm font-medium text-earth-300">下一次預約</p>
        {nextBooking ? (
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold">{formatBookingDateLabel(nextBooking.bookingDate)}</p>
              <p className="mt-1 text-base text-earth-200">{nextBooking.slotTime}</p>
            </div>
            <Link href={`/s/${storeSlug}/liff/bookings`} className="rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-earth-100">預約詳情</Link>
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-base text-earth-200">目前沒有預約</p>
            <Link href={`/s/${storeSlug}/liff/member-booking`} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-earth-900">立即預約</Link>
          </div>
        )}
      </section>

      {walletsAvailable ? (
        <>
          <section className="rounded-3xl bg-white px-5 py-4 shadow-[0_8px_24px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-earth-900">{labels.summaryTitle}</h2>
              {nearestWalletExpiry && <span className="text-xs text-earth-500">有效至 {formatFullDateLabel(nearestWalletExpiry)}</span>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <SummaryMetric label="可使用" value={totalUsable} unit={labels.sessionUnit} />
              <SummaryMetric label="已預約" value={totalBooked} unit={labels.sessionUnit} />
              <SummaryMetric label="尚可預約" value={totalBookable} unit={labels.sessionUnit} emphasized />
            </div>
            {makeupCredits.length > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-earth-100 pt-3 text-sm">
                <span className="font-medium text-earth-800">{labels.makeupLabel} {makeupCredits.length} {labels.sessionUnit}</span>
                <span className="text-earth-500">{nearestMakeupExpiry ? `有效至 ${formatFullDateLabel(nearestMakeupExpiry)}` : "無期限"}</span>
              </div>
            )}
          </section>

          {totalBookable > 0 || makeupCredits.length > 0 ? (
            <Link href={`/s/${storeSlug}/liff/member-booking`} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-primary-600 px-5 py-3 text-base font-semibold text-white shadow-[0_8px_20px_rgba(90,108,71,0.2)] transition hover:bg-primary-700 active:scale-[0.98]">
              立即預約
            </Link>
          ) : (
            <Link href={`/s/${storeSlug}/liff/wallets/shop`} className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-primary-600 px-5 py-3 text-base font-semibold text-white shadow-[0_8px_20px_rgba(90,108,71,0.2)] transition hover:bg-primary-700 active:scale-[0.98]">
              {labels.buyLabel}
            </Link>
          )}
        </>
      ) : (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5 text-amber-900">
          <p className="text-sm font-semibold">方案資料暫時無法讀取</p>
          <p className="mt-2 text-xs text-amber-800">請重新整理後再試一次；您的方案、堂數與既有預約不會受到影響。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 min-h-11 rounded-xl border border-amber-300 bg-white px-5 text-sm font-semibold"
          >
            重新整理
          </button>
        </section>
      )}

      <nav className="grid grid-cols-2 gap-3" aria-label="會員功能">
        <HomeTile href={`/s/${storeSlug}/liff/bookings`} label="我的預約" detail={nextBooking ? "查看與管理" : "目前無預約"} />
        <HomeTile
          href={`/s/${storeSlug}/liff/wallets`}
          label={labels.walletLabel}
          detail={walletsAvailable ? `${totalUsable} ${labels.sessionUnit}可使用` : "請重新讀取資料"}
        />
        {healthAssessmentEnabled && (
          <HomeTile href={`/s/${storeSlug}/liff/health`} label="健康紀錄" detail="查看量測與變化" />
        )}
        <HomeTile href={`/s/${storeSlug}/liff/profile`} label="我的資料" detail="會員基本資料" />
      </nav>

      {healthAssessmentEnabled && healthChange && (
        <Link href={`/s/${storeSlug}/liff/health`} className="rounded-3xl bg-primary-50 px-5 py-4 ring-1 ring-primary-100 transition active:scale-[0.99]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary-700">最近健康變化</p>
              <p className="mt-1 text-base font-semibold text-earth-900">{healthChange.detail}</p>
            </div>
            <ChevronRightIcon />
          </div>
        </Link>
      )}

      {memberSummary.referralShare ? (
        <LiffStoreShareCard context={memberSummary.referralShare} />
      ) : null}
    </div>
  );
}

function MemberHomeSummaryLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl bg-white px-5 py-8 text-center shadow-[0_8px_24px_rgba(74,66,53,0.07)] ring-1 ring-earth-200/70"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-earth-200 border-t-primary-700"
        aria-hidden
      />
      <p className="text-sm font-medium text-earth-600">正在讀取目前門市資料…</p>
      <p className="text-xs text-earth-500">完成後會顯示正確堂數與預約</p>
    </div>
  );
}

function SummaryMetric({ label, value, unit, emphasized = false }: { label: string; value: number; unit: string; emphasized?: boolean }) {
  return <div className={`rounded-2xl px-2 py-3 ${emphasized ? "bg-primary-50" : "bg-earth-50"}`}><p className="text-xs text-earth-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-earth-900">{value}<span className="ml-0.5 text-xs font-medium text-earth-500">{unit}</span></p></div>;
}

function HomeTile({ href, label, detail }: { href: string; label: string; detail: string }) {
  return <Link href={href} className="flex min-h-20 flex-col justify-between rounded-2xl bg-white p-4 shadow-[0_6px_18px_rgba(74,66,53,0.05)] ring-1 ring-earth-200/70 transition hover:bg-earth-50 active:scale-[0.98]"><div className="flex items-start justify-between gap-2"><span className="font-semibold text-earth-900">{label}</span><ChevronRightIcon /></div><span className="text-xs text-earth-500">{detail}</span></Link>;
}

function parseDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function formatBookingDateLabel(date: string) {
  const { year, month, day } = parseDateParts(date);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}（${weekday}）`;
}

function formatFullDateLabel(date: string) {
  const { year, month, day } = parseDateParts(date);
  return `${year}/${month}/${day}`;
}

function getHealthChange(summary: HealthSummary | null): { short: string; detail: string } | null {
  if (!summary || summary.trend.length < 2) return null;
  const latest = summary.trend.at(-1);
  const previous = summary.trend.at(-2);
  if (!latest || !previous) return null;
  const metrics = [
    { label: "體重", latest: latest.weight, previous: previous.weight, unit: "kg", lowerIsPositive: true },
    { label: "體脂", latest: latest.bodyFat, previous: previous.bodyFat, unit: "%", lowerIsPositive: true },
    { label: "肌肉量", latest: latest.muscleMass, previous: previous.muscleMass, unit: "kg", lowerIsPositive: false },
  ];
  const changed = metrics.find((metric) => metric.latest != null && metric.previous != null && metric.latest !== metric.previous);
  if (!changed || changed.latest == null || changed.previous == null) return null;
  const delta = Number((changed.latest - changed.previous).toFixed(1));
  const positive = changed.lowerIsPositive ? delta < 0 : delta > 0;
  const direction = delta > 0 ? "增加" : "下降";
  const value = Math.abs(delta);
  return { short: `${changed.label}${direction} ${value}${changed.unit}`, detail: `${changed.label}${direction} ${value}${changed.unit}${positive ? "，持續保持" : "，一起留意變化"}` };
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

function LeafIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.8 3.2C12.5 3.4 6.5 6.5 5.2 12.1c-.8 3.5 1.3 6.8 4.8 6.8 6.2 0 9.8-7 10.8-15.7Z" />
      <path d="M4 21c2.4-5.3 6.6-9.2 12.5-11.7" />
    </svg>
  );
}

// PR-E2b：DisabledCta 元件移除 — 3 顆 CTA (booking / myBookings / wallets) 已全部 wire。
// 若未來新增 disabled CTA 需求，可從 git history 找回。
