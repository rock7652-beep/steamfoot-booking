import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import {
  DATA_EXPORT_LOCKED_MESSAGE,
  DATA_EXPORT_SELECT_STORE_MESSAGE,
  hasDataExportFeature,
} from "@/lib/data-export-gate";
import { getPresetDateRange, type DateRangePreset } from "@/lib/date-utils";
import { PageShell, PageHeader } from "@/components/desktop";
import {
  previewStaffSettlement,
  UNASSIGNED_STAFF_TOKEN,
  type SettlementSummaryRow,
  type SettlementDetailRow,
} from "@/server/queries/staff-settlement";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { SettlementsView } from "./_components/settlements-view";

/**
 * /dashboard/settlements — 店長服務費試算頁（PR-2）
 *
 * 本頁是「試算」非「正式結算單」：
 *   - 純讀取查詢，不寫入任何資料
 *   - 不影響金流、不影響報表、不影響顧客 / 預約 / 錢包
 *   - 服務費單價由 client 端輸入即時計算，**不入庫**
 *   - 規格與禁止項：docs/staff-settlement-phase1-spec.md §3 / §6
 *
 * 權限：重用 report.read。Phase 2 出現「正式結算 / 付款 / 鎖帳」動作時，
 * 再切出獨立的 settlement.* 權限。
 */

interface PageProps {
  searchParams: Promise<{
    preset?: string;
    startDate?: string;
    endDate?: string;
    /** 全部 → 不傳；歸店家 → UNASSIGNED_STAFF_TOKEN；特定店長 → cuid */
    staffId?: string;
  }>;
}

export default async function SettlementsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  // ── Date range（同 reports 頁邏輯）──
  let startDate: string;
  let endDate: string;
  let activePreset = params.preset || "month";
  if (params.startDate && params.endDate) {
    startDate = params.startDate;
    endDate = params.endDate;
    activePreset = "custom";
  } else if (params.preset && ["today", "month", "quarter"].includes(params.preset)) {
    const range = getPresetDateRange(params.preset as DateRangePreset);
    startDate = range.startDate;
    endDate = range.endDate;
  } else {
    const range = getPresetDateRange("month");
    startDate = range.startDate;
    endDate = range.endDate;
  }

  // ── Multi-store scope ──
  const activeStoreId = await getActiveStoreForRead(user);
  const canExportData = await hasDataExportFeature(activeStoreId).catch(() => false);
  const dataExportLockedMessage = activeStoreId
    ? DATA_EXPORT_LOCKED_MESSAGE
    : DATA_EXPORT_SELECT_STORE_MESSAGE;

  // ── Parallel fetch ──
  const [{ summary, details }, staffOptions] = await Promise.all([
    previewStaffSettlement({
      startDate,
      endDate,
      staffId: params.staffId,
      activeStoreId,
    }).catch((e) => {
      console.error("[settlements] previewStaffSettlement failed", {
        userId: user.id,
        storeId: activeStoreId,
        error: e instanceof Error ? e.message : String(e),
      });
      return {
        summary: [] as SettlementSummaryRow[],
        details: [] as SettlementDetailRow[],
      };
    }),
    listStaffSelectOptions(activeStoreId).catch((e) => {
      console.error("[settlements] listStaffSelectOptions failed", {
        userId: user.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof listStaffSelectOptions>>;
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="店長服務金額試算"
        subtitle={
          "依顧客方案實收金額 ÷ 總可使用堂數攤提到每筆完成服務。此頁仍為試算，不會建立正式結算單，資料不會被寫入。"
        }
      />

      {/*
        Banner 文案故意保持簡短、店長友善。
        engineering 流程（plan-amortization-wallet-review.ts → CSV → csv-to-settlement-overrides.ts →
        提 PR 更新 data/settlement-wallet-overrides.json）寫在 docs/staff-settlement-phase1-spec.md §3.7.4，
        不在 UI 顯示，避免店長以為系統還在半成品狀態。
      */}
      <div
        role="note"
        className="rounded-lg border border-earth-200 bg-earth-50 p-3 text-sm text-earth-700"
      >
        此頁為「服務金額試算」，依顧客方案金額與完成服務紀錄估算，僅供內部對帳參考，非正式結算單。
      </div>

      <SettlementsView
        activePreset={activePreset}
        startDate={startDate}
        endDate={endDate}
        staffId={params.staffId ?? null}
        staffOptions={staffOptions}
        unassignedToken={UNASSIGNED_STAFF_TOKEN}
        summary={summary}
        details={details}
        canExportData={canExportData}
        dataExportLockedMessage={dataExportLockedMessage}
      />
    </PageShell>
  );
}
