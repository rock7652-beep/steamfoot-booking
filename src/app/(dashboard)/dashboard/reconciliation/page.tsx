import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCachedShopPlan } from "@/lib/query-cache";
import { FEATURES } from "@/lib/shop-plan";
import { ServerTiming, withTiming } from "@/lib/perf";
import { FeatureGate } from "@/components/feature-gate";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { listReconciliationRuns, getReconciliationRunDetail } from "@/server/queries/reconciliation";
import { RunReconciliationButton } from "./run-button";

interface PageProps {
  searchParams: Promise<{ runId?: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pass: { label: "通過", color: "text-green-700", bg: "bg-green-100", icon: "✓" },
  mismatch: { label: "不一致", color: "text-yellow-700", bg: "bg-yellow-100", icon: "⚠" },
  error: { label: "錯誤", color: "text-red-700", bg: "bg-red-100", icon: "✗" },
  running: { label: "執行中", color: "text-blue-700", bg: "bg-blue-100", icon: "…" },
};

export default async function ReconciliationPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const timer = new ServerTiming("/dashboard/reconciliation");
  const [runs, selectedRun, shopPlan] = await Promise.all([
    withTiming("listReconciliationRuns", timer, () => listReconciliationRuns(20)),
    params.runId ? withTiming("getReconciliationRunDetail", timer, () => getReconciliationRunDetail(params.runId!)) : null,
    withTiming("getCachedShopPlan", timer, () => getCachedShopPlan()),
  ]);
  timer.finish();

  const latestRun = runs[0] ?? null;
  const displayRun = selectedRun ?? (latestRun ? await getReconciliationRunDetail(latestRun.id) : null);

  // 分離通過與異常項目
  const passedChecks = displayRun?.checks.filter((c) => c.status === "pass") ?? [];
  const failedChecks = displayRun?.checks.filter((c) => c.status !== "pass") ?? [];

  return (
    <FeatureGate plan={shopPlan} feature={FEATURES.RECONCILIATION}>
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">
            ← 首頁
          </Link>
          <h1 className="text-xl font-bold text-earth-900">對帳中心</h1>
        </div>
        <RunReconciliationButton />
      </div>

      {/* ═══════ 第一層：總覽狀態 ═══════ */}
      {displayRun && (
        <div className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-earth-800">
                {selectedRun ? "選取的對帳結果" : "最新對帳結果"}
              </h2>
              <p className="mt-0.5 text-xs text-earth-400">
                {new Date(displayRun.startedAt).toLocaleString("zh-TW")}
                <span className="ml-2">
                  {displayRun.triggeredBy === "manual" ? "手動觸發" : "排程觸發"}
                </span>
                {displayRun.durationMs != null && (
                  <span className="ml-2">{displayRun.durationMs}ms</span>
                )}
              </p>
            </div>
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                STATUS_CONFIG[displayRun.status]?.bg ?? "bg-earth-100"
              } ${STATUS_CONFIG[displayRun.status]?.color ?? "text-earth-700"}`}
            >
              {STATUS_CONFIG[displayRun.status]?.label ?? displayRun.status}
            </span>
          </div>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-earth-50 px-3 py-2 text-center">
              <p className="text-[11px] text-earth-500">總檢查</p>
              <p className="text-lg font-bold text-earth-800">{displayRun.totalChecks}</p>
            </div>
            <div className="rounded-lg bg-green-50 px-3 py-2 text-center">
              <p className="text-[11px] text-green-600">通過</p>
              <p className="text-lg font-bold text-green-700">{displayRun.passCount}</p>
            </div>
            <div className="rounded-lg bg-yellow-50 px-3 py-2 text-center">
              <p className="text-[11px] text-yellow-600">不一致</p>
              <p className="text-lg font-bold text-yellow-700">{displayRun.mismatchCount}</p>
            </div>
            <div className="rounded-lg bg-red-50 px-3 py-2 text-center">
              <p className="text-[11px] text-red-600">錯誤</p>
              <p className="text-lg font-bold text-red-700">{displayRun.errorCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ 第二層：異常項目優先顯示 ═══════ */}
      {displayRun && failedChecks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-red-700">需注意的項目（{failedChecks.length}）</h3>
          {failedChecks.map((check) => (
            <CheckDetailCard key={check.id} check={check} />
          ))}
        </div>
      )}

      {displayRun && passedChecks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-green-700">通過的項目（{passedChecks.length}）</h3>
          {passedChecks.map((check) => (
            <CheckDetailCard key={check.id} check={check} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!displayRun && (
        <EmptyState
          icon="settings"
          title="尚無對帳記錄"
          description="點擊上方「手動執行對帳」開始第一次對帳"
        />
      )}

      {/* ═══════ 歷史列表 ═══════ */}
      {runs.length > 0 && (
        <div className="rounded-xl border border-earth-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-earth-800">對帳歷史</h2>
          <div className="space-y-1.5">
            {runs.map((run) => {
              const config = STATUS_CONFIG[run.status];
              const isSelected = displayRun?.id === run.id;
              return (
                <Link
                  key={run.id}
                  href={`/dashboard/reconciliation?runId=${run.id}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? "bg-primary-50 border border-primary-200"
                      : "hover:bg-earth-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${config?.bg} ${config?.color}`}
                    >
                      {config?.label}
                    </span>
                    <span className="text-xs text-earth-600">
                      {new Date(run.startedAt).toLocaleString("zh-TW")}
                    </span>
                    <span className="text-xs text-earth-400">
                      {run.triggeredBy === "manual" ? "手動" : "排程"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-earth-500">
                    <span className="text-green-600">{run.passCount} 過</span>
                    {run.mismatchCount > 0 && (
                      <span className="text-yellow-600">{run.mismatchCount} 不符</span>
                    )}
                    {run.errorCount > 0 && (
                      <span className="text-red-600">{run.errorCount} 錯誤</span>
                    )}
                    {run.durationMs != null && (
                      <span className="text-earth-400">{run.durationMs}ms</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl border border-earth-200 bg-earth-50/50 p-4 text-xs text-earth-500">
        <p className="font-medium text-earth-600">對帳說明</p>
        <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
          <li>每次執行檢查 5 個項目：今日營收、本月營收、今日預約筆數、今日預約人數、CSV 合計列</li>
          <li>數字比對容許誤差 = 0（必須完全一致）</li>
          <li>每項檢查從多個來源取值後交叉比對（aggregate vs groupBy vs 逐筆加總）</li>
          <li>點擊各項目的「Debug 資訊」可查看完整的日期範圍、公式、來源明細</li>
          <li>異常時 Dashboard 首頁會顯示警示條（僅 Owner 可見）</li>
        </ul>
      </div>
    </div>
    </FeatureGate>
  );
}

// ════════════════════════════════════════════════
// 單項檢查明細卡片（第二層 + 第三層合併）
// ════════════════════════════════════════════════

interface CheckCardProps {
  check: {
    id: string;
    checkCode: string;
    checkName: string;
    status: string;
    sources: unknown;
    expected?: string | null;
    errorMessage?: string | null;
    debugPayload: unknown;
  };
}

function CheckDetailCard({ check }: CheckCardProps) {
  const config = STATUS_CONFIG[check.status];
  const sources = check.sources as Record<string, number>;
  const debug = check.debugPayload as Record<string, unknown>;

  // 計算來源值是否一致（用於顯示差異高亮）
  const sourceValues = Object.values(sources).filter((v) => typeof v === "number");
  const allSame = sourceValues.length > 0 && sourceValues.every((v) => v === sourceValues[0]);

  return (
    <div
      className={`rounded-xl border p-4 ${
        check.status === "pass"
          ? "border-green-200 bg-green-50/50"
          : check.status === "mismatch"
          ? "border-yellow-200 bg-yellow-50/50"
          : "border-red-200 bg-red-50/50"
      }`}
    >
      {/* 標題列 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${config?.color}`}>
            {config?.icon}
          </span>
          <span className="text-sm font-semibold text-earth-800">{check.checkName}</span>
          <span className="text-xs text-earth-400">{check.checkCode}</span>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${config?.bg} ${config?.color}`}
        >
          {config?.label}
        </span>
      </div>

      {/* 期望結果 */}
      {check.expected && (
        <p className="mt-1.5 text-xs text-earth-500">
          期望：{check.expected}
        </p>
      )}

      {/* 第二層：來源比對表 */}
      {Object.keys(sources).length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-earth-200">
                <th className="pb-1.5 text-left font-medium text-earth-500">資料來源</th>
                <th className="pb-1.5 text-right font-medium text-earth-500">數值</th>
                {!allSame && (
                  <th className="pb-1.5 text-right font-medium text-earth-500">差異</th>
                )}
              </tr>
            </thead>
            <tbody>
              {Object.entries(sources).map(([name, value], idx) => {
                const firstValue = sourceValues[0];
                const diff = typeof value === "number" && typeof firstValue === "number" ? value - firstValue : 0;
                return (
                  <tr key={name} className="border-b border-earth-100 last:border-0">
                    <td className="py-1.5 text-earth-700">{name}</td>
                    <td className={`py-1.5 text-right font-mono ${
                      !allSame && idx > 0 && diff !== 0 ? "font-bold text-yellow-700" : "text-earth-900"
                    }`}>
                      {typeof value === "number" ? value.toLocaleString() : String(value)}
                    </td>
                    {!allSame && (
                      <td className="py-1.5 text-right font-mono text-xs">
                        {idx === 0 ? (
                          <span className="text-earth-400">基準</span>
                        ) : diff !== 0 ? (
                          <span className={diff > 0 ? "text-red-600" : "text-red-600"}>
                            {diff > 0 ? "+" : ""}{diff.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-green-600">一致</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Error message */}
      {check.errorMessage && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2">
          <p className="text-xs font-medium text-red-700">錯誤訊息</p>
          <p className="mt-0.5 text-xs text-red-600">{check.errorMessage}</p>
        </div>
      )}

      {/* 第三層：Debug payload（可摺疊） */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-earth-400 hover:text-earth-600">
          展開 Debug 資訊
        </summary>
        <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-earth-900 p-3 text-[11px] text-earth-100">
          {JSON.stringify(debug, null, 2)}
        </pre>
      </details>
    </div>
  );
}
