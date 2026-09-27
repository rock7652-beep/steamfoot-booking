import { CourseSettingsWorkspace } from "./settings-workspace";
import { CourseSettingsPanelContent } from "./settings-panel-content";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { PageShell, PageHeader } from "@/components/desktop";
import { getStoreUsage } from "@/server/queries/usage";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { computeLifecycle, effectiveStateLabel } from "@/lib/subscription-lifecycle";
import { toLocalDateStr } from "@/lib/date-utils";
import { TRIAL_DEFAULTS, DEFAULT_BOOKABLE_DAYS_AHEAD } from "@/lib/shop-config";

export type CourseHubView = "settings" | "operations";
export async function CourseSharedHub({view, panel, panelQuery}:{view:CourseHubView; panel?: string; panelQuery?: string}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const permission = view === "operations" ? "cashbook.read" : "booking.read";
  if (!(await checkPermission(user.role, user.staffId, permission))) notFound();
  if (view === "settings" && !["ADMIN", "OWNER", "PARTNER"].includes(user.role))
    notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || (await getStoreIndustryModule(storeId)) !== "course")
    notFound();
  if (view === "operations") redirect("/dashboard/revenue");
  const readOnly = (await resolveStoreViewContextFromCookie(user))?.isViewMode ?? false;
  const title = "設定";
  const subtitle = "店長控制台 · 查看狀態、同頁編輯設定";
  let body: React.ReactNode;
  {
    const [store, rule, canEdit, config, canPayment, canStaff, canPlans] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true, plan: true, currentSubscription: { select: { status: true, expiresAt: true } }, subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, expiresAt: true } } },
      }),
      coursePrisma.courseBookingRule.findUnique({ where: { storeId } }),
      checkPermission(user.role, user.staffId, "business_hours.manage"),
      prisma.shopConfig.findUnique({ where: { storeId }, select: { address: true, mapUrl: true, lineOfficialUrl: true, bankName: true, bankCode: true, bankAccountNumber: true, bookingWindowDays: true, bookableUntilDate: true, dutySchedulingEnabled: true, trialEnabled: true, trialDefaultPrice: true, trialAllowPriceEdit: true, trialMinPrice: true, trialMaxPrice: true } }),
      checkPermission(user.role,user.staffId,"plans.edit"),
      user.role === "OWNER" && checkPermission(user.role,user.staffId,"staff.view"),
      checkPermission(user.role,user.staffId,"wallet.read"),
    ]);
    const [usage, digitalButler, referralShare, lineReminder, customerCare] = await Promise.all([
      canPayment ? getStoreUsage(storeId) : null,
      hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER),
      hasStoreFeature(storeId, FEATURES.REFERRAL_SHARE),
      hasStoreFeature(storeId, FEATURES.LINE_REMINDER),
      hasStoreFeature(storeId, FEATURES.CUSTOMER_CARE),
    ]);
    const music = !!(await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{id:true}}));
    const subscription = store?.currentSubscription ?? store?.subscriptions[0];
    const subscriptionSummary = subscription ? effectiveStateLabel(computeLifecycle(subscription, toLocalDateStr()).state) + (subscription.expiresAt ? " · 到期日 " + subscription.expiresAt.toISOString().slice(0, 10) : " · 未設定到期日") : "尚無訂閱紀錄；續約或調整方案請聯絡總部。";
    body = (
      <CourseSettingsWorkspace
        music={music}
        panelContent={<CourseSettingsPanelContent panel={panel} query={panelQuery} />}
        key={storeId}
        canDigitalButler={canPayment && !readOnly && digitalButler}
        canReferralShare={canPayment && !readOnly && referralShare}
        canUnassignedPlans={canPlans && await checkPermission(user.role,user.staffId,"customer.read")}
        subscriptionSummary={canPayment ? subscriptionSummary : undefined}
        today={toLocalDateStr()}
        trialSettings={{ trialEnabled: config?.trialEnabled ?? TRIAL_DEFAULTS.trialEnabled, trialDefaultPrice: Number(config?.trialDefaultPrice ?? TRIAL_DEFAULTS.trialDefaultPrice), trialAllowPriceEdit: config?.trialAllowPriceEdit ?? TRIAL_DEFAULTS.trialAllowPriceEdit, trialMinPrice: Number(config?.trialMinPrice ?? TRIAL_DEFAULTS.trialMinPrice), trialMaxPrice: Number(config?.trialMaxPrice ?? TRIAL_DEFAULTS.trialMaxPrice) }}
        bookingWindowDays={config?.bookingWindowDays ?? DEFAULT_BOOKABLE_DAYS_AHEAD}
        bookableUntilDate={config?.bookableUntilDate?.toISOString().slice(0,10) ?? null}
        dutyEnabled={config?.dutySchedulingEnabled ?? false}
        trialEnabled={config?.trialEnabled ?? TRIAL_DEFAULTS.trialEnabled}
        trialPrice={Number(config?.trialDefaultPrice ?? TRIAL_DEFAULTS.trialDefaultPrice)}
        storeId={storeId} planLabel={store ? PRICING_PLAN_INFO[store.plan].label : "—"} canPayment={canPayment && !readOnly} canStaff={canStaff} canPlans={canPlans}
        name={store?.name ?? ""}
        bankName={config?.bankName??""} bankCode={config?.bankCode??""} bankAccountNumber={config?.bankAccountNumber??""}
        address={config?.address ?? ""} mapUrl={config?.mapUrl ?? ""} lineOfficialUrl={config?.lineOfficialUrl ?? ""}
        bookingLeadMinutes={rule?.bookingLeadMinutes ?? 0}
        cancellationLeadMinutes={rule?.cancellationLeadMinutes ?? 0}
        canEdit={canEdit && !readOnly}
        usageMetrics={usage?.metrics}
        canTrial={!readOnly && await checkPermission(user.role,user.staffId,"trial.manage")}
        canReminders={!readOnly && lineReminder && await checkPermission(user.role,user.staffId,"business_hours.manage")}
        canCare={customerCare && await checkPermission(user.role,user.staffId,"customer.read")}
        canDutyRead={await checkPermission(user.role,user.staffId,"duty.read")}
        canDutyManage={!readOnly && await checkPermission(user.role,user.staffId,"duty.manage")}
        canHours={!readOnly && await checkPermission(user.role,user.staffId,"business_hours.view")}
      />
    );

  }
  return <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6"><PageHeader title={title} subtitle={subtitle}/><div className="space-y-5">{body}</div></PageShell>;
}
