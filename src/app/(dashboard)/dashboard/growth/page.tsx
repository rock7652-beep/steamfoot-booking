import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { formatTWTime } from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PageShell,
  PageHeader,
  KpiStrip,
} from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCustomerCareOverview } from "@/server/queries/customer-care";
import { CareSection, type CareItem } from "./_components/care-section";
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

const SCRIPTS = {
  trial:
    "您好～想關心您上次體驗後的感受,如果覺得不錯,我們也可以協助您安排下一次時間。",
  inactive:
    "好久不見,最近比較忙嗎?最近要不要找個時間回來好好放鬆一下呢😊",
  low: "您好～提醒您目前方案堂數快用完了,可以先幫您安排後續時間,避免中斷保養節奏。",
  expiring:
    "您好～提醒您方案快到期了,目前還有剩餘堂數,建議可以提早安排時間使用呦😊",
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

function CustomerCareLockedState() {
  return (
    <PageShell>
      <PageHeader
        title="顧客經營"
        subtitle="今天要關心誰,一頁看懂。"
        actions={
          <Link
            href="/dashboard"
            className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
          >
            返回儀表板
          </Link>
        }
      />
      <EmptyState
        icon="lock"
        title="此功能尚未開通"
        description="請聯絡總部加購或升級方案後,再使用顧客經營。"
        action={{ label: "返回儀表板", href: "/dashboard" }}
      />
    </PageShell>
  );
}

export default async function CustomerCarePage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  if (activeStoreId && !(await hasStoreFeature(activeStoreId, FEATURES.CUSTOMER_CARE))) {
    return <CustomerCareLockedState />;
  }

  const overview = await getCustomerCareOverview(user, activeStoreId);
  const { trialFollowUps, inactiveCustomers, lowSessionCustomers, expiringPlanCustomers, summary } =
    overview;

  const totalReminders =
    summary.trialFollowUps +
    summary.inactiveCustomers +
    summary.lowSessionCustomers +
    summary.expiringPlanCustomers;

  // ---- 各區轉成統一顯示模型 ----
  const trialItems: CareItem[] = trialFollowUps.map((r) => ({
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

  const inactiveItems: CareItem[] = inactiveCustomers.map((r) => ({
    customerId: r.customerId,
    name: r.customerName,
    phoneMasked: maskPhone(r.phone),
    reason: `已 ${r.daysSinceLastVisit} 天未到店,仍有 ${r.validPackageSessions} 堂`,
    meta: `最後到店 ${dateOnly(r.lastVisitAt)}`,
    staffName: r.assignedStaffName,
    lastFollowUpText: followUpText(r.lastFollowUp),
    script: SCRIPTS.inactive,
  }));

  const lowItems: CareItem[] = lowSessionCustomers.map((r) => ({
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

  const expiringItems: CareItem[] = expiringPlanCustomers.map((r) => ({
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
