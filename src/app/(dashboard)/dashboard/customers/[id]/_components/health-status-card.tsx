/**
 * HealthStatusCard — 顧客詳情頁 HealthFlow 連結狀態（DB-only，方案 A）
 *
 * 後台店長看一眼就知道：這位顧客是否已連結 HealthFlow、最近同步何時、
 * 在哪可以查看完整評估。**完全不在 page load 打 HealthFlow API**。
 *
 * 嚴格遵守的限制（per audit）：
 *   ❌ 不 import / 呼叫 tryAutoLinkHealth
 *   ❌ 不 import / 呼叫 getHealthSummarySafe
 *   ❌ 不 useEffect auto-link
 *   ❌ 不 server-render fetch HealthFlow
 *   ❌ 不使用 deprecated computeHealthScore
 *   ✅ 只讀 props 傳入的 customer DB 三欄
 *   ✅ Server component，零 client JS
 *   ✅ 外部 HealthFlow URL 只是 <a> link，使用者點才開新分頁
 *
 * 4 個 state（依 healthLinkStatus）：
 *   - linked       已連結 + 顯示同步時間 + 外部 HealthFlow 入口 + LIFF 提示
 *   - unlinked     尚未連結 + 引導批次 sync / 手動連結
 *   - not_found    Dashboard 自動配對失敗 + 引導手動連結
 *   - error        dashboard 上次配對 error + 引導手動連結
 *
 * 未來若要顯示「最新分數摘要」(方案 B)，再加一個 client lazy fetch button。
 * 不在本 PR 範圍。
 */

import { SideCard } from "@/components/desktop";
import { formatTWTime } from "@/lib/date-utils";
import { getHealthAssessmentUrl } from "@/lib/health-assessment";
import { HealthSummaryLazy } from "./health-summary-lazy";

interface HealthStatusCardProps {
  customerId: string;
  healthProfileId: string | null;
  /** "unlinked" | "linked" | "not_found" | "error" — 字串而非 enum（schema 是 String） */
  healthLinkStatus: string;
  healthSyncedAt: Date | null;
}

export function HealthStatusCard({
  customerId,
  healthProfileId,
  healthLinkStatus,
  healthSyncedAt,
}: HealthStatusCardProps) {
  const isLinked =
    healthLinkStatus === "linked" && healthProfileId !== null;

  // 外部 HealthFlow 連結 — 只是 href，不在 render 時打 API
  const healthFlowUrl = getHealthAssessmentUrl(customerId);

  return (
    <SideCard title="AI 健康評估" subtitle="HealthFlow 連結狀態">
      <div className="space-y-2 px-3 pb-3 text-[11px]">
        {/* Status row — 顯示連結狀態 */}
        <div className="flex items-center gap-1.5">
          {isLinked ? (
            <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
              已連結
            </span>
          ) : healthLinkStatus === "not_found" ? (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              配對失敗
            </span>
          ) : healthLinkStatus === "error" ? (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
              連結錯誤
            </span>
          ) : (
            <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[11px] font-medium text-earth-500">
              尚未連結
            </span>
          )}
          {healthSyncedAt && (
            <span className="text-earth-500">
              · 最近同步 {formatTWTime(healthSyncedAt, { style: "short" })}
            </span>
          )}
        </div>

        {/* 文案依 state 切換 */}
        {isLinked ? (
          <>
            <p className="leading-relaxed text-earth-600">
              顧客可在 LINE Mini App「我的健康紀錄」查看完整摘要與分數。
            </p>
            <a
              href={healthFlowUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-700 hover:underline"
            >
              前往 HealthFlow 原站 ↗
            </a>
            {/* dashboard-health-lazy：店長點按鈕才 fetch HealthFlow summary。
                page load 仍維持 DB-only（沿用 PR #204 設計）。 */}
            <HealthSummaryLazy customerId={customerId} />
          </>
        ) : healthLinkStatus === "not_found" ? (
          <>
            <p className="leading-relaxed text-earth-600">
              批次同步以 email / phone 自動配對 HealthFlow profile，但未找到對應資料。
              請與顧客確認 HealthFlow 端的聯絡資訊，或請技術人員手動連結。
            </p>
            <p className="text-earth-500">
              批次工具：<code className="rounded bg-earth-100 px-1 py-0.5 text-[10px]">scripts/healthflow-link-execute.ts</code>
            </p>
          </>
        ) : healthLinkStatus === "error" ? (
          <>
            <p className="leading-relaxed text-earth-600">
              上次配對流程發生錯誤，請檢視 server log 或請技術人員協助重試。
            </p>
            <p className="text-earth-500">
              批次工具：<code className="rounded bg-earth-100 px-1 py-0.5 text-[10px]">scripts/healthflow-link-execute.ts</code>
            </p>
          </>
        ) : (
          <>
            <p className="leading-relaxed text-earth-600">
              顧客尚未連結 HealthFlow 評估資料。可由系統批次 sync 自動連結，
              或請技術人員手動指定 profileId。
            </p>
            <p className="text-earth-500">
              批次工具：<code className="rounded bg-earth-100 px-1 py-0.5 text-[10px]">scripts/healthflow-link-execute.ts</code>
            </p>
          </>
        )}

        {/* 開發備忘 — 給技術看，店長可忽略 */}
        {healthProfileId && (
          <p className="border-t border-earth-100 pt-1.5 text-[10px] text-earth-400">
            profileId: <code className="text-earth-500">{healthProfileId.slice(0, 8)}...</code>
          </p>
        )}
      </div>
    </SideCard>
  );
}
