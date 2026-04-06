import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listReconciliationRuns, getReconciliationRunDetail } from "@/server/queries/reconciliation";
import { RunReconciliationButton } from "./run-button";

interface PageProps {
  searchParams: Promise<{ runId?: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pass: { label: "通過", color: "text-green-700", bg: "bg-green-100" },
  mismatch: { label: "不一致", color: "text-yellow-700", bg: "bg-yellow-100" },
  error: { label: "錯誤", color: "text-red-700", bg: "bg-red-100" },
  running: { label: "執行中", color: "text-blue-700", bg: "bg-blue-100" },
};

export default async function ReconciliationPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const [runs, selectedRun] = await Promise.all([
    listReconciliationRuns(20),
    params.runId ? getReconciliationRunDetail(params.runId) : null,
  ]);

  const latestRun = runs[0] ?? null;
  const displayRun = selectedRun ?? (latestRun ? await getReconciliationRunDetail(latestRun.id) : null);

  return (
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

      {/* Latest status summary */}
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

          {/* Check details */}
          <div className="mt-5 space-y-3">
            <h3 className="text-sm font-semibold text-earth-700">檢查明細</h3>
            {displayRun.checks.map((check) => {
              const config = STATUS_CONFIG[check.status];
              const sources = check.sources as Record<string, number>;
              const debug = check.debugPayload as Record<string, unknown>;
              return (
                <div
                  key={check.id}
                  className={`rounded-xl border p-4 ${
                    check.status === "pass"
                      ? "border-green-200 bg-green-50/50"
                      : check.status === "mismatch"
                      ? "border-yellow-200 bg-yellow-50/50"
                      : "border-red-200 bg-red-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${config?.color}`}>
                        {check.status === "pass" ? "\u2713" : check.status === "mismatch" ? "\u26A0" : "\u2717"}
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

                  {/* Sources table */}
                  {Object.keys(sources).length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-earth-200">
                            <th className="pb-1 text-left font-medium text-earth-500">資料來源</th>
                            <th className="pb-1 text-right font-medium text-earth-500">數值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(sources).map(([name, value]) => (
                            <tr key={name} className="border-b border-earth-100 last:border-0">
                              <td className="py-1 text-earth-700">{name}</td>
                              <td className="py-1 text-right font-mono text-earth-900">
                                {typeof value === "number" ? value.toLocaleString() : String(value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Error message */}
                  {check.errorMessage && (
                    <p className="mt-2 text-xs text-red-600">{check.errorMessage}</p>
                  )}

                  {/* Debug payload (collapsible) */}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-earth-400 hover:text-earth-600">
                      Debug 資訊
                    </summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-earth-900 p-3 text-[11px] text-earth-100">
                      {JSON.stringify(debug, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!displayRun && (
        <div className="rounded-xl border border-earth-200 bg-white py-12 text-center shadow-sm">
          <p className="text-sm text-earth-400">尚無對帳記錄</p>
          <p className="mt-1 text-xs text-earth-400">點擊上方「手動執行對帳」開始第一次對帳</p>
        </div>
      )}

      {/* History */}
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
          <li>每項檢查��多個來源取值後交叉比對（aggregate vs groupBy vs 逐筆加總）</li>
          <li>點擊各項目的「Debug 資訊」可查看完整的日期範圍、公式、來源明細</li>
          <li>異常時 Dashboard 首頁會顯示警示條（僅 Owner 可見）</li>
        </ul>
      </div>
    </div>
  );
}
