import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { formatTWTime } from "@/lib/date-utils";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  DataTable,
  type Column,
} from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCustomerCareOverview } from "@/server/queries/customer-care";
import { CareRowActions } from "./_components/care-row-actions";
import { formatRelativeDaysTW } from "@/lib/customer-follow-up";

/**
 * /dashboard/growth — 顧客經營 MVP（PR-2B）
 *
 * 把舊「成長系統」改造成店長每天會用的「今天要關心誰」一頁。
 * 純讀:吃 PR #284 的 getCustomerCareOverview read model,四區提醒,
 * 不寫 DB / 不改 schema / 不 migration。CTA 全為導向或純前端複製。
 *
 * 四區（顯示順序 = 優先序）:
 *   1. 待追蹤體驗客  2. 好久不見  3. 堂數偏低  4. 方案快到期
 *
 * 權限:沿用 customer.read（與顧客管理 / 待追蹤體驗客頁一致）,不新增 permission。
 */

export const dynamic = "force-dynamic";

/** UI 端先顯示各區前 N 筆;完整列表待後續 PR */
const TOP_N = 10;

const SCRIPTS = {
  trial:
    "您好～想關心您上次體驗後的感受,如果覺得不錯,我們也可以協助您安排下一次時間。",
  inactive:
    "您好～看到您還有剩餘堂數,最近比較忙嗎?我們可以協助您安排一個適合的時間回來放鬆一下。",
  low: "您好～提醒您目前方案堂數快用完了,可以先幫您安排後續時間,避免中斷保養節奏。",
  expiring:
    "您好～提醒您方案快到期了,目前還有剩餘堂數,建議可以先安排時間使用,避免浪費。",
} as const;

function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const cleaned = phone.replace(/[^\d]/g, "");
  if (cleaned.length < 4) return "—";
  return `09xx-xxx-${cleaned.slice(-4)}`;
}

function dateOnly(d: Date): string {
  return formatTWTime(d, { dateOnly: true });
}

function followUpText(
  followUp: NonNullable<
    Awaited<ReturnType<typeof getCustomerCareOverview>>["trialFollowUps"][number]["lastFollowUp"]
  > | null,
): string {
  if (!followUp) return "最後追蹤：從未追蹤";
  return `最後追蹤：${followUp.createdByName}・${formatRelativeDaysTW(followUp.createdAt)}`;
}

/** 各區統一的顯示模型（理由 / 次要資訊都在 server 端算好） */
interface CareItem {
  customerId: string;
  name: string;
  phoneMasked: string;
  /** 主理由文案 — 讓店長一眼看懂為什麼要關心 */
  reason: string;
  /** 次要資訊行（日期 / 金額 / 總堂數等）；無則 null */
  meta: string | null;
  staffName: string | null;
  lastFollowUpText: string;
  script: string;
}

export default async function CustomerCarePage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const overview = await getCustomerCareOverview(user, activeStoreId);
  const { trialFollowUps, inactiveCustomers, lowSessionCustomers, expiringPlanCustomers, summary } =
    overview;

  const totalReminders =
    summary.trialFollowUps +
    summary.inactiveCustomers +
    summary.lowSessionCustomers +
    summary.expiringPlanCustomers;

  // ---- 各區轉成統一顯示模型 ----
  const trialItems: CareItem[] = trialFollowUps.slice(0, TOP_N).map((r) => ({
    customerId: r.customerId,
    name: r.customerName,
    phoneMasked: maskPhone(r.customerPhone),
    reason: "體驗後尚未轉正式方案",
    meta: [
      r.trialPaidAt ? `體驗 ${dateOnly(r.trialPaidAt)}` : null,
      `NT$ ${r.trialAmount.toLocaleString()}`,
    ]
      .filter(Boolean)
      .join("｜"),
    staffName: r.assignedStaffName,
    lastFollowUpText: followUpText(r.lastFollowUp),
    script: SCRIPTS.trial,
  }));

  const inactiveItems: CareItem[] = inactiveCustomers.slice(0, TOP_N).map((r) => ({
    customerId: r.customerId,
    name: r.customerName,
    phoneMasked: maskPhone(r.phone),
    reason: `已 ${r.daysSinceLastVisit} 天未到店,仍有 ${r.validPackageSessions} 堂`,
    meta: `最後到店 ${dateOnly(r.lastVisitAt)}`,
    staffName: r.assignedStaffName,
    lastFollowUpText: followUpText(r.lastFollowUp),
    script: SCRIPTS.inactive,
  }));

  const lowItems: CareItem[] = lowSessionCustomers.slice(0, TOP_N).map((r) => ({
    customerId: r.customerId,
    name: r.customerName,
    phoneMasked: maskPhone(r.phone),
    reason:
      r.validPackageSessions === 1
        ? "剩 1 堂,建議提前關心續約"
        : `剩 ${r.validPackageSessions} 堂,可提前安排後續`,
    meta: null,
    staffName: r.assignedStaffName,
    lastFollowUpText: followUpText(r.lastFollowUp),
    script: SCRIPTS.low,
  }));

  const expiringItems: CareItem[] = expiringPlanCustomers.slice(0, TOP_N).map((r) => ({
    customerId: r.customerId,
    name: r.customerName,
    phoneMasked: maskPhone(r.phone),
    reason:
      r.daysUntilExpiry === 0
        ? `今天到期,仍有 ${r.remainingSessions} 堂`
        : `${r.daysUntilExpiry} 天後到期,仍有 ${r.remainingSessions} 堂`,
    meta: `到期 ${dateOnly(r.expiryDate)}｜有效共 ${r.validPackageSessions} 堂`,
    staffName: r.assignedStaffName,
    lastFollowUpText: followUpText(r.lastFollowUp),
    script: SCRIPTS.expiring,
  }));

  return (
    <PageShell>
      <PageHeader
        title="顧客經營"
        subtitle="今天要關心誰,一頁看懂。"
        actions={
          <Link
            href="/dashboard/customers"
            className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            顧客管理
          </Link>
        }
      />

      <KpiStrip
        items={[
          { label: "待追蹤體驗客", value: summary.trialFollowUps, tone: "amber" },
          { label: "好久不見", value: summary.inactiveCustomers, tone: "blue" },
          { label: "堂數偏低", value: summary.lowSessionCustomers, tone: "green" },
          { label: "方案快到期", value: summary.expiringPlanCustomers, tone: "primary" },
          { label: "提醒項目", value: totalReminders, tone: "earth" },
        ]}
      />

      {totalReminders === 0 ? (
        <div className="rounded-xl border border-earth-200 bg-white px-4 py-6 text-center">
          <p className="text-sm font-medium text-earth-900">
            今天沒有特別需要追蹤的顧客,可以專心服務現場顧客。
          </p>
        </div>
      ) : null}

      <CareSection
        title="待追蹤體驗客"
        description="已完成體驗但尚未轉正式消費的顧客,適合關心體驗感受。"
        emptyText="目前沒有需要追蹤的體驗客。"
        items={trialItems}
        totalCount={summary.trialFollowUps}
      />
      <CareSection
        title="好久不見"
        description="仍有有效方案,但已超過 30 天沒有完成到店。"
        emptyText="目前沒有久未到店的顧客。"
        items={inactiveItems}
        totalCount={summary.inactiveCustomers}
      />
      <CareSection
        title="堂數偏低"
        description="有效方案剩餘堂數偏低,適合提前提醒與安排後續。"
        emptyText="目前沒有堂數偏低的顧客。"
        items={lowItems}
        totalCount={summary.lowSessionCustomers}
      />
      <CareSection
        title="方案快到期"
        description="方案即將到期且仍有剩餘堂數,適合提醒顧客安排時間。"
        emptyText="目前沒有快到期的方案。"
        items={expiringItems}
        totalCount={summary.expiringPlanCustomers}
      />
    </PageShell>
  );
}

// ============================================================
// CareSection — 單一提醒區塊（compact table + 友善 empty state）
// ============================================================

function CareSection({
  title,
  description,
  emptyText,
  items,
  totalCount,
}: {
  title: string;
  description: string;
  emptyText: string;
  items: CareItem[];
  totalCount: number;
}) {
  const columns: Column<CareItem>[] = [
    {
      key: "customer",
      header: "顧客",
      priority: "primary",
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-earth-900">{row.name}</span>
          <span className="text-[11px] tabular-nums text-earth-500">{row.phoneMasked}</span>
        </div>
      ),
      width: "w-40",
    },
    {
      key: "reason",
      header: "提醒原因",
      accessor: (row) => (
        <div className="flex flex-col">
          <span className="text-sm text-earth-800">{row.reason}</span>
          {row.meta ? (
            <span className="text-[11px] text-earth-500">{row.meta}</span>
          ) : null}
          <span className="text-[11px] text-earth-500">{row.lastFollowUpText}</span>
        </div>
      ),
    },
    {
      key: "staff",
      header: "直屬店長",
      priority: "secondary",
      accessor: (row) =>
        row.staffName ? (
          <span className="text-xs text-earth-700">{row.staffName}</span>
        ) : (
          <span className="text-xs text-earth-400">未指派</span>
        ),
      width: "w-24",
    },
    {
      key: "actions",
      header: <span className="sr-only">操作</span>,
      align: "right",
      noLink: true,
      accessor: (row) => <CareRowActions customerId={row.customerId} script={row.script} />,
      width: "w-[280px]",
    },
  ];

  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-earth-900">
          {title}
          {totalCount > 0 ? (
            <span className="ml-1.5 text-[11px] font-normal text-earth-500">{totalCount} 位</span>
          ) : null}
        </h2>
        {totalCount > TOP_N ? (
          <span className="text-[11px] text-earth-400">顯示前 {TOP_N} 筆,共 {totalCount} 筆</span>
        ) : null}
      </div>
      <p className="text-[11px] text-earth-500">{description}</p>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.customerId}
        empty={
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-earth-600">{emptyText}</p>
          </div>
        }
      />
    </section>
  );
}
