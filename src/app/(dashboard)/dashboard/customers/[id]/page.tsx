import { getCustomerDetail } from "@/server/queries/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getStorePlanById } from "@/lib/store-plan";
import { hasFeature as hasPricingFeature, FEATURES as FF } from "@/lib/feature-flags";
import { getCachedPlans, getCachedStaffOptions } from "@/lib/query-cache";
import { getActiveStoreForRead } from "@/lib/store";
import { ServerTiming, withTiming } from "@/lib/perf";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCustomerTagsAndScripts } from "@/server/queries/customer-tags";
import { getOpsActionLogs } from "@/server/actions/ops-action-log";
import { getReferralsByReferrer } from "@/server/queries/referral";
import { getPointHistory } from "@/server/queries/points";
import { getUpgradeEligibility } from "@/server/queries/talent";
import { getActiveBonusRules } from "@/server/queries/bonus-rule";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";

import { CustomerHeaderCard } from "./_components/customer-header-card";
import { SidebarSummaryCard } from "./_components/sidebar-summary-card";
import { SidebarQuickActions } from "./_components/sidebar-quick-actions";
import { SidebarStatusLights } from "./_components/sidebar-status-lights";
import { SidebarLineStatus } from "./_components/sidebar-line-status";
import { SidebarValueSummary } from "./_components/sidebar-value-summary";
import { SidebarSystemInfo } from "./_components/sidebar-system-info";
import { BookingsSection } from "./_components/bookings-section";
import { PlansSection } from "./_components/plans-section";
import { GrowthCenterSection } from "./_components/growth-center-section";
import { HealthCompactSection } from "./_components/health-compact-section";
import { BasicInfoSection } from "./_components/basic-info-section";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);

  const logCtx = {
    page: "customer-detail" as const,
    customerId: id,
    activeStoreId,
    sessionRole: user.role,
    sessionStoreId: user.storeId ?? null,
  };

  const timer = new ServerTiming(`/dashboard/customers/${id}`);

  let customer: Awaited<ReturnType<typeof getCustomerDetail>>;
  try {
    customer = await withTiming("getCustomerDetail", timer, () => getCustomerDetail(id));
  } catch (e) {
    console.error("[customer-detail] base query failed", {
      ...logCtx,
      step: "base",
      error: e instanceof Error ? e.message : String(e),
    });
    notFound();
  }

  if (activeStoreId && customer.storeId !== activeStoreId) {
    console.warn("[customer-detail] cross-store access blocked", {
      ...logCtx,
      step: "store-guard",
      customerStoreId: customer.storeId,
    });
    notFound();
  }

  const effectiveStoreId = customer.storeId;

  const [
    plans,
    staffOptions,
    tagsAndScripts,
    customerActionLogs,
    canDiscount,
    customerReferrals,
    customerPoints,
    upgradeEligibility,
    activeBonusRules,
    pricingPlan,
    perksSummary,
  ] = await Promise.all([
    withTiming("getCachedPlans", timer, () => getCachedPlans(effectiveStoreId)).catch((e) => {
      console.error("[customer-detail] plans query failed", {
        ...logCtx,
        step: "plans",
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof getCachedPlans>>;
    }),
    withTiming("getCachedStaffOptions", timer, () => getCachedStaffOptions()).catch((e) => {
      console.error("[customer-detail] staffOptions query failed", {
        ...logCtx,
        step: "staffOptions",
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof getCachedStaffOptions>>;
    }),
    user.role !== "CUSTOMER"
      ? withTiming("getCustomerTagsAndScripts", timer, () => getCustomerTagsAndScripts(id)).catch(
          (e) => {
            console.error("[customer-detail] tagsAndScripts query failed", {
              ...logCtx,
              step: "tagsAndScripts",
              error: e instanceof Error ? e.message : String(e),
            });
            return { tags: [], scripts: [] } as Awaited<
              ReturnType<typeof getCustomerTagsAndScripts>
            >;
          },
        )
      : Promise.resolve({ tags: [], scripts: [] } as Awaited<
          ReturnType<typeof getCustomerTagsAndScripts>
        >),
    user.role !== "CUSTOMER"
      ? withTiming("getOpsActionLogs", timer, () =>
          getOpsActionLogs("customer_action", effectiveStoreId),
        ).catch((e) => {
          console.error("[customer-detail] opsLogs query failed", {
            ...logCtx,
            step: "opsLogs",
            error: e instanceof Error ? e.message : String(e),
          });
          return new Map() as Awaited<ReturnType<typeof getOpsActionLogs>>;
        })
      : Promise.resolve(new Map() as Awaited<ReturnType<typeof getOpsActionLogs>>),
    checkPermission(user.role, user.staffId, "transaction.discount").catch(() => false),
    user.role !== "CUSTOMER"
      ? getReferralsByReferrer(id).catch((e) => {
          console.error("[customer-detail] referrals query failed", {
            ...logCtx,
            step: "referrals",
            error: e instanceof Error ? e.message : String(e),
          });
          return [];
        })
      : Promise.resolve([]),
    user.role !== "CUSTOMER"
      ? getPointHistory(id, { limit: 10 }).catch((e) => {
          console.error("[customer-detail] points query failed", {
            ...logCtx,
            step: "points",
            error: e instanceof Error ? e.message : String(e),
          });
          return [];
        })
      : Promise.resolve([]),
    user.role === "ADMIN" || user.role === "OWNER"
      ? getUpgradeEligibility(id).catch((e) => {
          console.error("[customer-detail] upgradeEligibility query failed", {
            ...logCtx,
            step: "upgradeEligibility",
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        })
      : Promise.resolve(null),
    user.role !== "CUSTOMER"
      ? getActiveBonusRules(effectiveStoreId).catch((e) => {
          console.error("[customer-detail] bonusRules query failed", {
            ...logCtx,
            step: "bonusRules",
            error: e instanceof Error ? e.message : String(e),
          });
          return [];
        })
      : Promise.resolve([]),
    withTiming("getStorePlanById", timer, () => getStorePlanById(effectiveStoreId)).catch(
      () => "EXPERIENCE" as const,
    ),
    user.role !== "CUSTOMER"
      ? withTiming("getMyReferralSummary", timer, () =>
          getMyReferralSummary(id, { activeStoreId: effectiveStoreId }),
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  timer.finish();

  const tags = tagsAndScripts.tags;
  const scripts = tagsAndScripts.scripts;
  const hasAiHealth = hasPricingFeature(pricingPlan, FF.AI_HEALTH_SUMMARY);
  const isOwnerRole = user.role === "ADMIN" || user.role === "OWNER";
  const isAdmin = user.role === "ADMIN";
  const canEdit = user.role !== "CUSTOMER";
  const showGrowth = user.role !== "CUSTOMER";

  const staffList = isAdmin
    ? staffOptions.map((s) => ({ id: s.id, displayName: s.displayName }))
    : [];

  const wallets = customer.planWallets ?? [];
  const activeWallets = wallets.filter((w) => w.status === "ACTIVE");
  const inactiveWallets = wallets.filter((w) => w.status !== "ACTIVE");
  const totalRemaining = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);

  const bookings = customer.bookings ?? [];
  const upcomingBookings = bookings.filter(
    (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED",
  );
  const historyBookings = bookings.filter(
    (b) => b.bookingStatus !== "PENDING" && b.bookingStatus !== "CONFIRMED",
  );
  const transactions = customer.transactions ?? [];
  const totalSpend = transactions.reduce((s, t) => {
    const amt = Number(t.amount);
    return s + (amt > 0 ? amt : 0);
  }, 0);

  const referralCount = customer._count?.sponsoredCustomers ?? 0;
  const totalVisits = customer._count?.bookings ?? 0;

  const followUpEntry = (() => {
    for (const [, log] of customerActionLogs) {
      if (log.refId.includes(id)) return log;
    }
    return null;
  })();

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-6 py-6">
      {/* 麵包屑 */}
      <div className="flex items-center gap-1.5 text-[11px] text-earth-500">
        <Link href="/dashboard/customers" className="hover:text-earth-700">
          顧客管理
        </Link>
        <span className="text-earth-300">/</span>
        <span className="text-earth-700">顧客詳情</span>
      </div>

      {/* A 顧客抬頭 */}
      <CustomerHeaderCard
        name={customer.name}
        phone={customer.phone}
        lastVisitAt={customer.lastVisitAt}
        totalVisits={totalVisits}
        totalRemainingSessions={totalRemaining}
        referralCount={referralCount}
        talentStage={customer.talentStage}
      />

      {/* 70 / 30 雙欄 (xl 以上) */}
      <div className="grid grid-cols-12 gap-6">
        {/* 主內容 (col-8) */}
        <div className="col-span-12 space-y-6 xl:col-span-8">
          <BookingsSection
            customerId={id}
            activeWallets={activeWallets.map((w) => ({
              id: w.id,
              planName: w.plan.name,
              remainingSessions: w.remainingSessions,
            }))}
            upcomingBookings={upcomingBookings.map((b) => ({
              id: b.id,
              bookingDate: b.bookingDate,
              slotTime: b.slotTime,
              bookingStatus: b.bookingStatus as string,
            }))}
            historyBookings={historyBookings.map((b) => ({
              id: b.id,
              bookingDate: b.bookingDate,
              slotTime: b.slotTime,
              bookingType: b.bookingType as string,
              bookingStatus: b.bookingStatus as string,
            }))}
            transactions={transactions.map((t) => ({
              id: t.id,
              createdAt: t.createdAt,
              transactionType: t.transactionType,
              amount: t.amount,
              originalAmount: t.originalAmount,
              discountType: t.discountType,
              discountReason: t.discountReason,
              paymentMethod: t.paymentMethod,
            }))}
          />

          <PlansSection
            customerId={id}
            activeWallets={activeWallets}
            inactiveWallets={inactiveWallets}
            plans={plans.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              price: Number(p.price),
              sessionCount: p.sessionCount,
            }))}
            canDiscount={canDiscount}
            userRole={user.role}
          />

          {showGrowth && (
            <GrowthCenterSection
              customerId={id}
              customerStage={customer.customerStage}
              talentStage={customer.talentStage}
              sponsor={customer.sponsor}
              referralCount={referralCount}
              stageNote={customer.stageNote}
              isOwner={isOwnerRole}
              upgradeEligibility={upgradeEligibility}
              referrals={(customerReferrals ?? []).map((r) => ({
                id: r.id,
                referredName: r.referredName,
                referredPhone: r.referredPhone,
                status: r.status,
                note: r.note,
                createdAt:
                  r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
              }))}
              points={(customerPoints ?? []).map((p) => ({
                id: p.id,
                type: p.type,
                points: p.points,
                note: p.note,
                createdAt:
                  p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
              }))}
              totalPoints={customer.totalPoints || 0}
              bonusRules={(activeBonusRules ?? []).map((r) => ({
                id: r.id,
                name: r.name,
                points: r.points,
              }))}
              canManualAward={isOwnerRole}
              perksSummary={perksSummary}
              totalVisits={totalVisits}
            />
          )}

          <BasicInfoSection
            customerId={id}
            name={customer.name}
            phone={customer.phone}
            email={customer.email}
            gender={customer.gender}
            birthday={customer.birthday}
            height={customer.height}
            lineName={customer.lineName}
            lineLinkStatus={customer.lineLinkStatus}
            lineUserId={customer.lineUserId ?? null}
            lineLinkedAt={customer.lineLinkedAt ?? null}
            lineBindingCode={customer.lineBindingCode ?? null}
            lineBindingCodeCreatedAt={customer.lineBindingCodeCreatedAt ?? null}
            authSource={customer.authSource}
            createdAt={customer.createdAt}
            assignedStaff={customer.assignedStaff}
            notes={customer.notes}
            showOpsPanel={user.role !== "CUSTOMER"}
            opsTags={tags}
            opsScripts={scripts}
            opsFollowUp={followUpEntry}
          />

          {hasAiHealth && (
            <HealthCompactSection
              customerId={id}
              customerEmail={customer.email}
              customerPhone={customer.phone}
              healthLinkStatus={customer.healthLinkStatus}
              healthProfileId={customer.healthProfileId}
            />
          )}
        </div>

        {/* Sticky Sidebar (col-4) — xl 以上 sticky，以下自動落到下方 */}
        <aside className="col-span-12 flex flex-col gap-4 xl:col-span-4 xl:sticky xl:top-[88px] xl:self-start xl:max-h-[calc(100vh-104px)] xl:overflow-y-auto xl:pr-1">
          {/* S1 快速操作（最上層） */}
          <SidebarQuickActions customerId={id} phone={customer.phone} canEdit={canEdit} />

          {/* S2 顧客摘要 */}
          <SidebarSummaryCard
            lineLinkStatus={customer.lineLinkStatus}
            assignedStaff={customer.assignedStaff}
            customerStage={customer.customerStage}
            talentStage={customer.talentStage}
            tags={tags}
            authSource={customer.authSource}
          />

          {/* S3 狀態燈號 */}
          <SidebarStatusLights lastVisitAt={customer.lastVisitAt} />

          {/* S4 LINE */}
          <SidebarLineStatus
            lineLinkStatus={customer.lineLinkStatus}
            lineName={customer.lineName}
            lineLinkedAt={customer.lineLinkedAt ?? null}
            selfBookingEnabled={customer.selfBookingEnabled}
          />

          {/* S5 顧客價值 */}
          <SidebarValueSummary
            totalVisits={totalVisits}
            totalSpend={totalSpend}
            referralCount={referralCount}
            totalPoints={customer.totalPoints ?? 0}
            lastVisitAt={customer.lastVisitAt}
          />

          {/* S6 系統資訊 */}
          <SidebarSystemInfo
            customerId={id}
            createdAt={customer.createdAt}
            updatedAt={customer.updatedAt}
            authSource={customer.authSource}
            staffList={staffList}
            currentStaffId={customer.assignedStaffId}
            isAdmin={isAdmin}
          />
        </aside>
      </div>
    </div>
  );
}
