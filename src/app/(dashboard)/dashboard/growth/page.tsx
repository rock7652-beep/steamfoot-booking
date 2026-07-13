import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { formatTWTime, toLocalMonthStr } from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCustomerCareOverview } from "@/server/queries/customer-care";
import { getMonthlyUnconvertedCustomers } from "@/server/queries/conversion-metrics";
import { getBirthdayCustomersForMonth } from "@/server/queries/customer-birthday";
import {
  CUSTOMER_KPI_SEGMENTS,
  getCustomerKpiSegmentCustomers,
  isCustomerKpiSegment,
} from "@/server/queries/customer-kpi-segments";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
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
  birthday: "生日快樂！祝您新的一歲平安順心，也期待很快再見到您🎂",
  general: "您好～想關心您最近的狀況，需要我們協助安排下一次服務嗎？",
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
  followUp: { createdAt: Date; createdByName: string } | null,
): string | null {
  if (!followUp) return null;
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

export default async function CustomerCarePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams: Promise<{ segment?: string; month?: string }>;
} = { searchParams: Promise.resolve({}) }) {
  const params = await searchParams;
  const requestedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "")
    ? params.month!
    : null;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const viewedStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const queryUser = userForViewContext(user, storeViewContext);
  if (viewedStoreId && !(await hasStoreFeature(viewedStoreId, FEATURES.CUSTOMER_CARE))) {
    return <CustomerCareLockedState />;
  }

  const workspaceMonth = requestedMonth ?? toLocalMonthStr();
  if (isCustomerKpiSegment(params.segment)) {
    const selectedSegment = params.segment;
    const config = CUSTOMER_KPI_SEGMENTS[selectedSegment];
    const customers = viewedStoreId
      ? await getCustomerKpiSegmentCustomers(viewedStoreId, workspaceMonth, selectedSegment)
      : [];
    const segmentItems: CareItem[] = customers.map((customer) => ({
      customerId: customer.customerId,
      name: customer.customerName,
      phoneMasked: maskPhone(customer.customerPhone),
      reason: config.description,
      meta: `統計月份 ${workspaceMonth}`,
      staffName: customer.assignedStaffName,
      lastFollowUpText: followUpText(customer.lastFollowUp),
      script: selectedSegment.includes("return") ? SCRIPTS.inactive : SCRIPTS.general,
      readOnly: isViewMode,
    }));

    return (
      <PageShell>
        <PageHeader
          title="顧客經營"
          subtitle={`${workspaceMonth}｜${config.title}`}
          actions={
            <Link
              href={`/dashboard/reports?month=${workspaceMonth}`}
              className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              返回營運分析
            </Link>
          }
        />
        <CareSection
          title={config.title}
          description={config.description}
          emptyText={`${workspaceMonth} 沒有符合此條件的顧客。`}
          items={segmentItems}
          totalCount={segmentItems.length}
        />
      </PageShell>
    );
  }

  const [overview, monthlyUnconverted, birthdayCustomers] = await Promise.all([
    getCustomerCareOverview(queryUser, viewedStoreId),
    viewedStoreId ? getMonthlyUnconvertedCustomers(viewedStoreId, workspaceMonth) : [],
    viewedStoreId ? getBirthdayCustomersForMonth(viewedStoreId, workspaceMonth) : [],
  ]);
  const { trialFollowUps, inactiveCustomers, lowSessionCustomers, expiringPlanCustomers, summary } =
    overview;

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

  const monthlyUnconvertedItems: CareItem[] = monthlyUnconverted.map((r) => ({
    customerId: r.customerId,
    name: r.customerName,
    phoneMasked: maskPhone(r.customerPhone),
    reason: "本月完成體驗，未於體驗完成當天開卡",
    meta: `體驗完成 ${dateOnly(r.trialCompletedAt)}`,
    staffName: r.assignedStaffName,
    lastFollowUpText: r.lastFollowUp
      ? `最後追蹤：${r.lastFollowUp.createdByName}・${formatRelativeDaysTW(r.lastFollowUp.createdAt)}`
      : null,
    script: SCRIPTS.trial,
    readOnly: isViewMode,
  }));

  const birthdayItems: CareItem[] = birthdayCustomers.map((r) => ({
    customerId: r.customerId,
    name: r.customerName,
    phoneMasked: maskPhone(r.customerPhone),
    reason: "本月生日，適合送上祝福",
    meta: `生日 ${String(r.birthday.getUTCMonth() + 1).padStart(2, "0")}/${String(r.birthday.getUTCDate()).padStart(2, "0")}`,
    staffName: r.assignedStaffName,
    lastFollowUpText: r.lastFollowUp
      ? `最後追蹤：${r.lastFollowUp.createdByName}・${formatRelativeDaysTW(r.lastFollowUp.createdAt)}`
      : null,
    script: SCRIPTS.birthday,
    readOnly: isViewMode,
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

      <CareSection
        title="本月生日"
        description="今天送上生日祝福。"
        emptyText="本月沒有生日顧客。"
        items={birthdayItems}
        totalCount={birthdayItems.length}
      />
      <CareSection
        title="本月體驗未開卡"
        description="今天最值得追蹤。"
        emptyText="本月沒有體驗未開卡顧客。"
        items={monthlyUnconvertedItems}
        totalCount={monthlyUnconvertedItems.length}
      />
      <CareSection
        title="好久不見"
        description="超過 30 天未到店，適合主動關心。"
        emptyText="目前沒有久未到店的顧客。"
        items={inactiveItems}
        totalCount={summary.inactiveCustomers}
      />
      <CareSection
        title="建議安排回店"
        description="適合安排下一次服務。"
        emptyText="目前沒有需要安排回店的顧客。"
        items={lowItems}
        totalCount={summary.lowSessionCustomers}
      />
      <CareSection
        title="建議續約"
        description="提前安排續約。"
        emptyText="目前沒有需要提前續約的顧客。"
        items={expiringItems}
        totalCount={summary.expiringPlanCustomers}
      />
      <CareSection
        title="其他待追蹤體驗客"
        description="依既有體驗收款與方案狀態判斷，與本月未開卡口徑不同。"
        emptyText="目前沒有其他需要追蹤的體驗客。"
        items={trialItems}
        totalCount={summary.trialFollowUps}
      />
    </PageShell>
  );
}
