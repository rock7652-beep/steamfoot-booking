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

export function HealthStatusCard(props: HealthStatusCardProps) {
  return (
    <SideCard title="AI 健康評估" subtitle="HealthFlow 連結狀態">
      <div className="px-3 pb-3">
        <HealthStatusBody {...props} />
      </div>
    </SideCard>
  );
}

/**
 * HealthStatusBody — HealthStatusCard 的內層內容（不含 SideCard 外框）
 *
 * 抽出來是為了能嵌進顧客詳情頁右欄的「顧客狀態總覽」合併卡，
 * 與 LINE 綁定、系統狀態共用同一張卡。外層 padding 由呼叫端決定。
 */
export function HealthStatusBody({
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
    <div className="space-y-2.5 text-[11px]">
      <div
        className={`rounded-md border px-2.5 py-2 ${
          isLinked
            ? "border-green-200 bg-green-50"
            : healthLinkStatus === "not_found"
              ? "border-amber-200 bg-amber-50"
              : healthLinkStatus === "error"
                ? "border-red-200 bg-red-50"
                : "border-earth-200 bg-earth-50/70"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {isLinked ? (
            <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-green-700">
              已連結
            </span>
          ) : healthLinkStatus === "not_found" ? (
            <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
              配對失敗
            </span>
          ) : healthLinkStatus === "error" ? (
            <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
              連結錯誤
            </span>
          ) : (
            <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-earth-600">
              尚未連結
            </span>
          )}
          {healthSyncedAt && (
            <span className={isLinked ? "text-green-800" : "text-earth-600"}>
              最近同步 {formatTWTime(healthSyncedAt, { style: "short" })}
            </span>
          )}
        </div>
        {isLinked && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-green-800">
            <span>HealthFlow 摘要可用</span>
            {healthProfileId && (
              <span className="font-mono text-green-700">
                ID {healthProfileId.slice(0, 8)}...
              </span>
            )}
          </div>
        )}
      </div>

      {isLinked ? (
        <>
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
        <p className="leading-relaxed text-earth-600">
          尚未找到可連結的 HealthFlow 評估資料。
        </p>
      ) : healthLinkStatus === "error" ? (
        <p className="leading-relaxed text-earth-600">
          上次連結流程發生錯誤，請稍後再確認。
        </p>
      ) : (
        <p className="leading-relaxed text-earth-600">
          尚未連結 HealthFlow 評估資料。
        </p>
      )}
    </div>
  );
}
