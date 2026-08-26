"use client";

/**
 * LIFF My Health View (PR-H2)
 *
 * 流程：
 *   1. mount → initLiff → isInLineClient → fetchLiffHealthSummary → ready / not_linked / error
 *   2. linked + summary → 顯示中央健康摘要、原始量測門市，並可在 LIFF 內展開歷史與曲線
 *   3. linked + 無量測 → 「尚無量測紀錄」+ 「開始量測」(外部 HealthFlow)
 *   4. unlinked / not_found → 「尚未完成 AI 健康評估」+ 「開始 AI 健康評估」(外部 HealthFlow)
 *   5. service_unavailable / no_customer → 友善錯誤 + retry / 聯絡店家
 *
 * 與 dashboard 的差異（唯讀且輕量）：
 *   - 歷史列表 / 趨勢圖預設收合，顧客需要時才載入圖表
 *   - 不接 link / unlink / autoLink（dashboard 是 SoT，本 view 純讀）
 *   - 加 LIFF 友善的醫療免責 disclaimer
 *
 * 文案一律 `liffMessages.health.*` / `liffMessages.error.*`，不寫 inline 中文。
 * Mobile-first：max-w-md / min-h-[44px] tap target。
 * LINE webview：外部跳轉一律 `button + window.location.href`（PR #184 教訓）。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { HealthHistoryList } from "@/components/health-history-list";
import { HealthTrendChartLoader } from "@/components/health-trend-chart-loader";
import {
  initLiff,
  isInLineClient,
  getIDToken,
  LiffInitError,
} from "@/lib/liff/client";
import { fetchLiffHealthSummary, type FetchLiffHealthSummaryResult } from "@/server/actions/liff-health";
import {
  liffMessages,
} from "@/lib/liff/messages";
import type { HealthSummary, HealthAlert } from "@/lib/health-service";

// PR-H2c：移除 self-computed score 顯示 — HealthFlow API 不回官方 score，
// Steamfoot 自算與 HealthFlow 原站不一致，會誤導顧客。改顯示 metrics + alerts +
// 「查看完整評估」CTA 導 HealthFlow 看官方分數。
type State =
  | { kind: "initializing" }
  | { kind: "not_in_line_app" }
  | { kind: "expired" }
  | { kind: "service_unavailable" }
  | { kind: "no_customer" }
  | {
      kind: "linked";
      summary: HealthSummary;
      verifiedStoreCount: number;
    }
  | { kind: "not_linked"; reason: "unlinked" | "not_found" | "error" };

interface Props {
  storeSlug: string;
  storeName: string;
  liffId: string;
  /** PR-E：per-store LINE OA 連結。HealthFlow URL 維持共用常數（決策 A）。 */
  contactUrl: string;
}

export function HealthView({ storeSlug, storeName, liffId, contactUrl }: Props) {
  const [state, setState] = useState<State>({ kind: "initializing" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initLiff(liffId);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof LiffInitError) {
          console.warn("[health-view] liff.init failed", err.message);
        } else {
          console.warn("[health-view] liff.init unexpected", err);
        }
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

      let result: FetchLiffHealthSummaryResult;
      try {
        result = await fetchLiffHealthSummary();
      } catch (err) {
        if (cancelled) return;
        console.warn("[health-view] fetch failed", err);
        setState({ kind: "service_unavailable" });
        return;
      }
      if (cancelled) return;

      switch (result.status) {
        case "ok":
          if (result.linked) {
            setState({
              kind: "linked",
              summary: result.summary,
              verifiedStoreCount: result.verifiedStoreCount,
            });
          } else {
            setState({ kind: "not_linked", reason: result.reason });
          }
          return;
        case "no_customer":
          setState({ kind: "no_customer" });
          return;
        case "service_unavailable":
          setState({ kind: "service_unavailable" });
          return;
      }
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
          {liffMessages.health.title}
        </h1>
      </header>

      {state.kind === "initializing" && (
        <Loading text={liffMessages.health.initializing} />
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

      {state.kind === "no_customer" && (
        <InfoBlock
          tone="yellow"
          body={liffMessages.error.sessionLost}
          storeSlug={storeSlug}
          contactUrl={contactUrl}
          showRetry
        />
      )}

      {state.kind === "service_unavailable" && (
        <InfoBlock
          tone="red"
          body={liffMessages.health.loadFailed}
          storeSlug={storeSlug}
          contactUrl={contactUrl}
          showRetry
          showContactStore
        />
      )}

      {state.kind === "not_linked" && (
        <NotLinkedCard
          storeSlug={storeSlug}
          reason={state.reason}
          contactUrl={contactUrl}
        />
      )}

      {state.kind === "linked" && (
        <LinkedView
          storeSlug={storeSlug}
          summary={state.summary}
          verifiedStoreCount={state.verifiedStoreCount}
          contactUrl={contactUrl}
        />
      )}

      <Disclaimer />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// LinkedView — 已綁定 + 有量測 / 已綁定但無量測
// ──────────────────────────────────────────────────────────

function LinkedView({
  storeSlug,
  summary,
  verifiedStoreCount,
  contactUrl,
}: {
  storeSlug: string;
  summary: HealthSummary;
  verifiedStoreCount: number;
  /** PR-E：per-store LINE OA 連結，傳給 ContactStoreButton。 */
  contactUrl: string;
}) {
  const m = liffMessages.health;
  const [showHistory, setShowHistory] = useState(false);

  // 已綁定但 HealthFlow 還沒任何量測
  if (!summary.latest) {
    return (
      <>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
          <p className="font-medium">{m.noMeasurementTitle}</p>
          <p className="mt-2 text-xs text-amber-800/85">{m.noMeasurementBody}</p>
        </div>
        <StartHealthFlowButton storeSlug={storeSlug} />
        <ContactStoreButton contactUrl={contactUrl} />
        <BackHomeLink storeSlug={storeSlug} />
      </>
    );
  }

  const measuredAtLabel = summary.latest.measuredAt;
  const daysAgo = summary.meta.daysSinceLastMeasure;

  return (
    <>
      {verifiedStoreCount > 1 && (
        <div className="rounded-xl border border-primary-100 bg-primary-50/40 px-4 py-3 text-xs leading-relaxed text-earth-700">
          已整合您在 {verifiedStoreCount} 家已驗證門市的健康紀錄；每筆仍保留原始量測門市。
        </div>
      )}
      {/* ── 官方 score 卡 (HealthFlow PR #5) / fallback 為 LatestSnapshot ──
          summary.official 由 health-service normalizeOfficial 填；若 HealthFlow
          API 沒回 score（舊版 / 部分 env），顯示原本 PR-H2c 的「最近量測卡」。*/}
      {summary.official ? (
        <OfficialScoreCard
          official={summary.official}
          measuredAt={measuredAtLabel}
          daysAgo={daysAgo}
          storeName={summary.latest.storeName}
        />
      ) : (
        <LatestSnapshot
          measuredAt={measuredAtLabel}
          daysAgo={daysAgo}
          storeName={summary.latest.storeName}
        />
      )}

      {/* ── 指標 grid (6 主指標) ── */}
      <MetricGrid latest={summary.latest} alerts={summary.alerts} />

      {/* ── 趨勢摘要 (近 N 次) ── */}
      {summary.trend.length >= 2 && <TrendBrief summary={summary} />}

      {/* ── LIFF 內查看歷史與曲線，不再跳到網頁會員前台 ── */}
      <button
        type="button"
        aria-expanded={showHistory}
        aria-controls="liff-health-history"
        onClick={() => setShowHistory((visible) => !visible)}
        className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
      >
        {showHistory ? "收合歷史與曲線" : m.viewFullCta}
      </button>
      {showHistory && (
        <section
          id="liff-health-history"
          className="rounded-xl border border-earth-200 bg-white px-3 py-4"
        >
          <h2 className="mb-4 text-base font-semibold text-earth-900">健康趨勢</h2>
          <HealthTrendChartLoader
            trend={summary.trend}
            totalRecords={summary.meta.totalRecords}
          />
          <HealthHistoryList
            trend={summary.trend}
            totalRecords={summary.meta.totalRecords}
          />
        </section>
      )}
      <ContactStoreButton contactUrl={contactUrl} />
      <BackHomeLink storeSlug={storeSlug} />
    </>
  );
}

/**
 * PR feat/liff-health-official-score：顯示 HealthFlow API 回的官方 score / 風險等級
 * / 建議。**不**用 self-computed，避免 PR #200 修掉的 68 vs 86 衝突再現。
 *
 * 配色：依 riskLevel 字串值映色；HealthFlow 端可加新值，UI fallback earth tone。
 */
function OfficialScoreCard({
  official,
  measuredAt,
  daysAgo,
  storeName,
}: {
  official: NonNullable<HealthSummary["official"]>;
  measuredAt: string;
  daysAgo: number | null;
  storeName?: string;
}) {
  const m = liffMessages.health;
  const riskClass =
    official.riskLevel === "good"
      ? "bg-green-50 border-green-200 text-green-900"
      : official.riskLevel === "warning"
        ? "bg-amber-50 border-amber-200 text-amber-900"
        : official.riskLevel === "danger"
          ? "bg-red-50 border-red-200 text-red-900"
          : "bg-earth-50 border-earth-200 text-earth-900";
  const scoreColor =
    official.riskLevel === "good"
      ? "text-green-700"
      : official.riskLevel === "warning"
        ? "text-amber-700"
        : official.riskLevel === "danger"
          ? "text-red-700"
          : "text-earth-800";
  return (
    <div className={`rounded-xl border px-4 py-4 ${riskClass}`}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs opacity-80">{m.lastMeasuredLabel}</p>
        <p className="text-xs">
          {formatDateLabel(measuredAt)}
          {daysAgo !== null && (
            <span className="ml-1 opacity-70">
              {m.daysAgoSuffix.replace("{n}", String(daysAgo))}
            </span>
          )}
        </p>
      </div>
      {storeName && (
        <p className="mt-2 border-t border-current/10 pt-2 text-right text-xs opacity-80">
          量測門市：<span className="font-medium">{storeName}</span>
        </p>
      )}
      <div className="mt-2 flex items-end gap-3">
        <span className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
          {official.score}
        </span>
        <span className="pb-1 text-xs opacity-80">{m.scoreSuffix}</span>
        {official.riskLabel && (
          <span className="ml-auto rounded-full bg-white/70 px-3 py-1 text-xs font-medium">
            {official.riskLabel}
          </span>
        )}
      </div>
      {official.scoreExplanation && (
        <p className="mt-3 text-xs leading-relaxed whitespace-pre-wrap">
          {official.scoreExplanation}
        </p>
      )}
      {official.adviceSummary.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-relaxed">
          {official.adviceSummary.map((tip, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="opacity-60">·</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[10px] opacity-60">
        {m.officialScoreAttribution}
      </p>
    </div>
  );
}

/**
 * 取代原 ScoreCard。PR-H2c：不顯示 self-computed score（與 HealthFlow 原站不一致）。
 * Fallback 用 — HealthFlow API 沒回 official.score 時用此卡。
 */
function LatestSnapshot({
  measuredAt,
  daysAgo,
  storeName,
}: {
  measuredAt: string;
  daysAgo: number | null;
  storeName?: string;
}) {
  const m = liffMessages.health;
  return (
    <div className="rounded-xl border border-earth-200 bg-white px-4 py-3 text-sm text-earth-800">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-earth-500">{m.lastMeasuredLabel}</p>
        <p className="text-sm">
          <span className="font-medium text-earth-900">
            {formatDateLabel(measuredAt)}
          </span>
          {daysAgo !== null && (
            <span className="ml-1 text-xs text-earth-500">
              {m.daysAgoSuffix.replace("{n}", String(daysAgo))}
            </span>
          )}
        </p>
      </div>
      {storeName && (
        <p className="mt-2 border-t border-earth-100 pt-2 text-right text-xs text-earth-600">
          量測門市：<span className="font-medium text-earth-800">{storeName}</span>
        </p>
      )}
      <p className="mt-2 text-[11px] text-earth-500">{m.scoreOnHealthFlowHint}</p>
    </div>
  );
}

function MetricGrid({
  latest,
  alerts,
}: {
  latest: NonNullable<HealthSummary["latest"]>;
  alerts: HealthAlert[];
}) {
  const m = liffMessages.health;
  const alertMap = new Map(alerts.map((a) => [a.metric, a]));
  const metrics: Array<{
    key: string;
    label: string;
    value: number | null;
    unit: string;
  }> = [
    { key: "weight", label: m.metric.weight, value: latest.weight, unit: "kg" },
    { key: "bmi", label: m.metric.bmi, value: latest.bmi, unit: "" },
    { key: "body_fat", label: m.metric.bodyFat, value: latest.bodyFat, unit: "%" },
    { key: "muscle_mass", label: m.metric.muscleMass, value: latest.muscleMass, unit: "kg" },
    { key: "visceral_fat", label: m.metric.visceralFat, value: latest.visceralFat, unit: "" },
    { key: "body_water", label: m.metric.bodyWater, value: latest.bodyWater, unit: "%" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map(({ key, label, value, unit }) => {
        const alert = alertMap.get(key);
        const tone =
          alert?.status === "danger"
            ? "border-red-200 bg-red-50"
            : alert?.status === "warning"
              ? "border-amber-200 bg-amber-50"
              : "border-earth-200 bg-white";
        return (
          <div key={key} className={`rounded-lg border px-3 py-2 ${tone}`}>
            <p className="text-[11px] text-earth-500">{label}</p>
            <p className="mt-0.5 text-base font-bold text-earth-900">
              {value != null ? (
                <>
                  {value}
                  {unit && (
                    <span className="ml-0.5 text-[10px] font-normal text-earth-500">
                      {unit}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-earth-300">—</span>
              )}
            </p>
            {alert && alert.status !== "normal" && (
              <p
                className={`mt-0.5 text-[10px] ${
                  alert.status === "danger" ? "text-red-600" : "text-amber-600"
                }`}
              >
                {alert.status === "danger" ? "⚠" : "△"} {alert.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TrendBrief({ summary }: { summary: HealthSummary }) {
  const m = liffMessages.health;
  const first = summary.trend[0];
  const last = summary.trend[summary.trend.length - 1];
  type Diff = { label: string; diff: number; unit: string; lowerIsBetter: boolean };
  const diffs: Diff[] = [];
  if (first.weight != null && last.weight != null) {
    diffs.push({
      label: m.metric.weight,
      diff: +(last.weight - first.weight).toFixed(1),
      unit: "kg",
      lowerIsBetter: true,
    });
  }
  if (first.bodyFat != null && last.bodyFat != null) {
    diffs.push({
      label: m.metric.bodyFat,
      diff: +(last.bodyFat - first.bodyFat).toFixed(1),
      unit: "%",
      lowerIsBetter: true,
    });
  }
  if (first.muscleMass != null && last.muscleMass != null) {
    diffs.push({
      label: m.metric.muscleMass,
      diff: +(last.muscleMass - first.muscleMass).toFixed(1),
      unit: "kg",
      lowerIsBetter: false,
    });
  }
  if (diffs.length === 0) return null;
  return (
    <div className="rounded-lg border border-earth-200 bg-white px-3 py-2">
      <p className="text-[11px] font-medium text-earth-500">
        {m.trendLabel.replace("{n}", String(summary.trend.length))}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {diffs.map(({ label, diff, unit, lowerIsBetter }) => {
          const favorable = lowerIsBetter ? diff < 0 : diff > 0;
          const neutral = Math.abs(diff) < 0.5;
          const cls = neutral
            ? "text-earth-400"
            : favorable
              ? "text-green-600"
              : "text-amber-600";
          return (
            <span key={label} className={cls}>
              {label} {diff > 0 ? "+" : ""}
              {diff}
              {unit}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// NotLinkedCard — 未綁定 / not_found / dashboard 端 error
// ──────────────────────────────────────────────────────────

function NotLinkedCard({
  storeSlug,
  reason,
  contactUrl,
}: {
  storeSlug: string;
  reason: "unlinked" | "not_found" | "error";
  /** PR-E：per-store LINE OA 連結。 */
  contactUrl: string;
}) {
  const m = liffMessages.health;
  const body =
    reason === "not_found"
      ? m.notLinkedNotFoundBody
      : reason === "error"
        ? m.notLinkedErrorBody
        : m.notLinkedUnlinkedBody;
  return (
    <>
      <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-5 text-sm text-earth-800">
        <p className="font-medium">{m.notLinkedTitle}</p>
        <p className="mt-2 text-xs text-earth-700">{body}</p>
      </div>
      <StartHealthFlowButton storeSlug={storeSlug} />
      <ContactStoreButton contactUrl={contactUrl} />
      <BackHomeLink storeSlug={storeSlug} />
    </>
  );
}

// ──────────────────────────────────────────────────────────
// Disclaimer — 醫療免責（所有狀態都顯示）
// ──────────────────────────────────────────────────────────

function Disclaimer() {
  return (
    <p className="mt-2 rounded-md border border-earth-100 bg-earth-50/50 px-3 py-2 text-[11px] leading-relaxed text-earth-500">
      {liffMessages.health.medicalDisclaimer}
    </p>
  );
}

// ──────────────────────────────────────────────────────────
// CTAs
// ──────────────────────────────────────────────────────────

function StartHealthFlowButton({
  storeSlug,
}: {
  storeSlug: string;
}) {
  return (
    <Link
      href={`/s/${storeSlug}/health/new`}
      className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-earth-800 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-earth-700 active:scale-[0.98]"
    >
      {liffMessages.health.startHealthFlowCta}
    </Link>
  );
}

function ContactStoreButton({ contactUrl }: { contactUrl: string }) {
  return (
    <a
      href={contactUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#05b54d] active:scale-[0.98]"
    >
      <LineIcon />
      {liffMessages.health.contactStoreCta}
    </a>
  );
}

function BackHomeLink({ storeSlug }: { storeSlug: string }) {
  return (
    <Link
      href={`/s/${storeSlug}/liff`}
      className="flex w-full min-h-[44px] items-center justify-center rounded-xl border border-earth-300 bg-white px-4 py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
    >
      {liffMessages.health.backHomeCta}
    </Link>
  );
}

// ──────────────────────────────────────────────────────────
// Generic blocks (mirror wallets-list.tsx)
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
  storeSlug,
  showRetry,
  showContactStore,
  contactUrl,
}: {
  tone: "green" | "red" | "yellow" | "earth";
  title?: string;
  body: string;
  storeSlug: string;
  showRetry?: boolean;
  showContactStore?: boolean;
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
          {liffMessages.health.backHomeCta}
        </Link>
      </div>
    </div>
  );
}

function LineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** ISO 8601 (`2026-05-01T...`) or "YYYY-MM-DD" → "YYYY/MM/DD" */
function formatDateLabel(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[1]}/${m[2]}/${m[3]}`;
}
