"use client";

/**
 * HealthSummaryLazy — 顧客詳情頁「按需查看健康摘要」（dashboard health lazy）
 *
 * 設計合約（per audit 2026-05-27 + dashboard-health-lazy implementation 拍板）：
 *   ❌ 不在頁面 mount 時自動 fetch（嚴格 user-gesture only）
 *   ❌ 不接收 / 不顯示 healthProfileId（server action 不回給 client）
 *   ❌ 不呼叫 tryAutoLinkHealth（純讀）
 *   ✅ user 點按鈕才呼叫 fetchHealthSummaryForDashboard
 *   ✅ 失敗友善錯誤 + 重試（safeApi 不 throw，這裡只看 status）
 *   ✅ 醫療免責 amber 區塊顯示在分數區之前（per audit §5.3）
 *   ✅ 沒有 summary.official 時 graceful fallback（不顯示分數，僅 latest + alerts）
 *
 * 為什麼放 lazy client component 而非 server action 內直接 render：
 *   - 顧客頁是 server-rendered；任何 server-side fetch HealthFlow 都是 page load API call，
 *     違反 PR #204 DB-only 原則。lazy = client-side state machine 才能保證 0 page-load API。
 */

import { useState, useTransition } from "react";
import {
  fetchHealthSummaryForDashboard,
  type FetchHealthSummaryForDashboardResult,
} from "@/server/actions/health";
import { getHealthAssessmentUrl } from "@/lib/health-assessment";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; result: Extract<FetchHealthSummaryForDashboardResult, { status: "ok" }> }
  | { kind: "error"; reason: "service_unavailable" | "forbidden" | "unexpected" };

interface Props {
  customerId: string;
}

export function HealthSummaryLazy({ customerId }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setPhase({ kind: "loading" });
      try {
        const result = await fetchHealthSummaryForDashboard(customerId);
        if (result.status === "ok") {
          setPhase({ kind: "ok", result });
          return;
        }
        // 非 ok 全部走 error 分支，但 reason 細分讓 UI 文案準確
        if (result.status === "service_unavailable") {
          setPhase({ kind: "error", reason: "service_unavailable" });
        } else if (result.status === "forbidden") {
          setPhase({ kind: "error", reason: "forbidden" });
        } else {
          // not_found / error / no_profile — 理論上 button 不該出現（HealthStatusCard
          // 只在 linked 時 render 本元件），若仍命中視為 service unavailable
          setPhase({ kind: "error", reason: "service_unavailable" });
        }
      } catch (err) {
        // server action 本身設計不 throw（safeApi）；若因 network / 序列化問題 throw
        // 則統一視為暫時無法載入
        console.warn("[health-summary-lazy] action threw", err);
        setPhase({ kind: "error", reason: "unexpected" });
      }
    });
  }

  function handleCollapse() {
    setPhase({ kind: "idle" });
  }

  if (phase.kind === "idle") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-800 hover:bg-primary-100 disabled:opacity-60"
      >
        查看健康摘要
      </button>
    );
  }

  if (phase.kind === "loading") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-earth-200 bg-earth-50/60 px-2.5 py-2 text-[11px] text-earth-600">
        <span
          className="h-3 w-3 animate-spin rounded-full border border-earth-300 border-t-earth-700"
          aria-hidden
        />
        載入中…
      </div>
    );
  }

  if (phase.kind === "error") {
    const msg =
      phase.reason === "forbidden"
        ? "您沒有查看此顧客健康摘要的權限。"
        : "健康摘要暫時無法載入，請稍後再試。";
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-900">
        <span>{msg}</span>
        {phase.reason !== "forbidden" && (
          <button
            type="button"
            onClick={handleClick}
            disabled={pending}
            className="rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-red-50 disabled:opacity-60"
          >
            重試
          </button>
        )}
      </div>
    );
  }

  // phase.kind === "ok"
  const summary = phase.result.summary;
  const official = summary.official;
  const latest = summary.latest;
  const healthFlowUrl = getHealthAssessmentUrl(customerId);
  const daysSince = summary.meta.daysSinceLastMeasure;
  const latestMeasuredAt = latest?.measuredAt ?? null;
  const totalRecords = summary.meta.totalRecords;

  return (
    <div className="space-y-3 rounded-md border border-earth-200 bg-white p-3 text-[11px] text-earth-700 shadow-sm">
      {/* 收合 */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-earth-500">
          健康摘要
        </span>
        <button
          type="button"
          onClick={handleCollapse}
          className="text-[11px] text-earth-500 hover:text-earth-800"
        >
          ✕ 收合
        </button>
      </div>

      {/* 醫療免責 — 強制顯示在分數上方，amber 區塊（per audit §5.3 風險緩解） */}
      <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
        此評估僅供健康管理參考，非醫療診斷建議。
      </p>

      <div className="grid grid-cols-3 gap-1.5">
        <SummaryStat
          label="最近量測"
          value={latestMeasuredAt ? formatMeasuredDate(latestMeasuredAt) : "尚無"}
        />
        <SummaryStat
          label="距今"
          value={daysSince == null ? "—" : `${daysSince} 天`}
        />
        <SummaryStat label="總紀錄" value={`${totalRecords} 筆`} />
      </div>

      {/* 官方分數區（只在 summary.official 存在時顯示） */}
      {official ? (
        <div className="rounded-md border border-earth-100 bg-earth-50/60 px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-earth-500">健康評分</span>
            <span className="text-[10px] text-earth-500">{official.scoreLevel}</span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-earth-900">
              {official.score}
            </span>
            <span className="text-[11px] text-earth-500">/ 100</span>
            {official.riskLabel && (
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${riskPillClass(
                  official.riskLevel,
                )}`}
              >
                {official.riskLabel}
              </span>
            )}
          </div>
          {official.scoreExplanation && (
            <p className="mt-1 text-[11px] leading-relaxed text-earth-600">
              {official.scoreExplanation}
            </p>
          )}
          {official.adviceSummary.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-earth-700">
              {official.adviceSummary.slice(0, 4).map((advice, i) => (
                <li key={i}>{advice}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-earth-100 bg-earth-50/60 px-3 py-2 text-[10px] text-earth-600">
          完整健康分數請至 HealthFlow 原站查看。
        </p>
      )}

      {/* 最近量測 */}
      {latest ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-earth-500">
            身體組成
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {renderMetric("體重", latest.weight, "kg")}
            {renderMetric("BMI", latest.bmi, "")}
            {renderMetric("體脂", latest.bodyFat, "%")}
            {renderMetric("肌肉量", latest.muscleMass, "kg")}
            {renderMetric("內臟脂肪", latest.visceralFat, "")}
            {renderMetric("體水分", latest.bodyWater, "%")}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-earth-500">尚無量測紀錄。</p>
      )}

      {/* 警示（HealthFlow 端 alerts） */}
      {summary.alerts.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-earth-500">
            關注提醒
          </p>
          <ul className="space-y-1">
          {summary.alerts.slice(0, 3).map((alert, i) => (
            <li
              key={i}
              className={`rounded-md px-2 py-1 text-[11px] ${alertClass(alert.status)}`}
            >
              <span className="font-medium">{alert.label}：</span>
              {alert.message}
            </li>
          ))}
          </ul>
        </div>
      )}

      {/* CTA + 資料來源 */}
      <div className="flex items-center justify-between border-t border-earth-100 pt-2">
        <a
          href={healthFlowUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary-700 hover:underline"
        >
          前往 HealthFlow 原站 ↗
        </a>
        <span className="text-[10px] text-earth-400">
          資料來源：HealthFlow AI 健康評估
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────

function renderMetric(label: string, value: number | null, unit: string) {
  if (value == null) {
    return (
      <div className="flex min-h-8 items-center justify-between rounded-md border border-earth-100 bg-earth-50/70 px-2 py-1 text-[11px]">
        <span className="text-earth-500">{label}</span>
        <span className="text-earth-400">—</span>
      </div>
    );
  }
  return (
    <div className="flex min-h-8 items-center justify-between rounded-md border border-earth-100 bg-earth-50/70 px-2 py-1 text-[11px]">
      <span className="text-earth-500">{label}</span>
      <span className="tabular-nums text-earth-800">
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-earth-500">{unit}</span>}
      </span>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-12 rounded-md border border-earth-100 bg-earth-50/70 px-2 py-1.5">
      <div className="text-[10px] text-earth-500">{label}</div>
      <div className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-earth-900">
        {value}
      </div>
    </div>
  );
}

function formatMeasuredDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${Number(year)}/${Number(month)}/${Number(day)}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

function riskPillClass(riskLevel: string): string {
  // riskLevel 字串由 HealthFlow 端定義；Steamfoot 不硬編 enum，只做色票對應
  switch (riskLevel.toLowerCase()) {
    case "good":
    case "normal":
      return "bg-green-100 text-green-800";
    case "warning":
    case "fair":
      return "bg-amber-100 text-amber-800";
    case "danger":
    case "poor":
      return "bg-red-100 text-red-800";
    default:
      return "bg-earth-100 text-earth-700";
  }
}

function alertClass(status: "normal" | "warning" | "danger"): string {
  switch (status) {
    case "danger":
      return "border border-red-200 bg-red-50 text-red-900";
    case "warning":
      return "border border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border border-earth-100 bg-earth-50 text-earth-700";
  }
}
