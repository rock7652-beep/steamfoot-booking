import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { PageShell, PageHeader } from "@/components/desktop";
import {
  getTrialFollowUpList,
  getTrialFollowUpStaffOptions,
} from "@/server/queries/trial-follow-up";
import { FollowUpTable, type FollowUpRow } from "./_components/follow-up-table";

/**
 * /dashboard/trial-follow-up — 已體驗未轉方案清單（候選 B）
 *
 * 設計意圖（per audit 2026-05-26）：
 *   - 純讀新頁；不依賴 customerStage=TRIAL（候選 A 未做時也能用）
 *   - 用 TRIAL_PURCHASE SUCCESS + Customer.convertedAt IS NULL 推導
 *   - 排除 VOIDED / REFUNDED transaction、merged customer、suspended user
 *   - 沿用既有 customer.read 權限；不新增 permission code
 *   - store isolation 走 getStoreFilter
 *   - 電話末 4 碼遮罩在此檔處理（不送完整 phone 給 client）
 *
 * 不在此頁範圍：
 *   - 寫 DB（純讀）
 *   - 觸發 collectTrialPayment / markCompleted / assignPlan
 *   - 修改 customerStage（候選 A 另案）
 */

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    days?: string;
    staff?: string;
  }>;
}

function parseDays(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // 安全 cap：避免奇怪輸入
  if (n > 365) return 365;
  return Math.floor(n);
}

function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const cleaned = phone.replace(/[^\d]/g, "");
  if (cleaned.length < 4) return "—";
  return `09xx-xxx-${cleaned.slice(-4)}`;
}

export default async function TrialFollowUpPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const withinDays = parseDays(params.days);
  const assignedStaffId = params.staff || undefined;

  const [rawRows, staffOptions] = await Promise.all([
    getTrialFollowUpList(user, activeStoreId, {
      withinDays,
      assignedStaffId,
    }),
    // staff 選項取「目前清單裡出現的 staff」，避免下拉顯示不相關選項
    // 注意：用沒套 staff filter 的版本，否則切換 staff 後下拉只剩自己
    getTrialFollowUpStaffOptions(user, activeStoreId),
  ]);

  // server 端強制遮罩 phone，client 拿不到完整號碼
  const rows: FollowUpRow[] = rawRows.map((r) => ({
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhoneMasked: maskPhone(r.customerPhone),
    trialBookingDate: r.trialBookingDate,
    trialPaidAt: r.trialPaidAt,
    trialCreatedAt: r.trialCreatedAt,
    trialAmount: r.trialAmount,
    trialPaymentMethod: r.trialPaymentMethod,
    assignedStaffName: r.assignedStaffName,
    assignedStaffColor: r.assignedStaffColor,
  }));

  return (
    <PageShell>
      <PageHeader
        title="待追蹤體驗客"
        subtitle="已體驗收款，尚未購買方案"
      />

      <div className="flex items-center justify-between text-[11px] text-earth-500">
        <span>共 {rows.length} 位待追蹤顧客</span>
      </div>

      <FollowUpTable
        rows={rows}
        staffOptions={staffOptions}
        selectedDays={withinDays}
        selectedStaffId={assignedStaffId}
      />
    </PageShell>
  );
}
