import { settingsStep, traceSettingsRead } from "@/server/services/settings-timing";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import { getCourseSetup } from "@/server/queries/course-setup";
import { CourseSetupGuide } from "@/components/admin/course-setup-guide";
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
import { isStoreFeatureEnabledForRead as hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { computeLifecycle, effectiveStateLabel } from "@/lib/subscription-lifecycle";
import { toLocalDateStr } from "@/lib/date-utils";
import { TRIAL_DEFAULTS, DEFAULT_BOOKABLE_DAYS_AHEAD } from "@/lib/shop-config";

export type CourseHubView = "settings" | "operations";
async function readCourseSharedHub({view, panel, panelQuery}:{view:CourseHubView; panel?: string; panelQuery?: string}) {
  const user = await settingsStep("authorization", getCurrentUser);
  if (!user) notFound();
  const permission = view === "operations" ? "cashbook.read" : "booking.read";
  if (!(await checkPermission(user.role, user.staffId, permission))) notFound();
  if (view === "settings" && !["ADMIN", "OWNER", "PARTNER"].includes(user.role))
    notFound();
  const storeId = await settingsStep("store_scope", () => getActiveStoreForRead(user));
  if (!storeId || (await settingsStep("module_check", () => getStoreIndustryModule(storeId))) !== "course")
    notFound();
  if (view === "operations") redirect("/dashboard/revenue");
  const readOnly = (await resolveStoreViewContextFromCookie(user))?.isViewMode ?? false;
  const title = "設定";
  const subtitle = "店長控制台 · 查看狀態、同頁編輯設定";
  let body: React.ReactNode;
  {
    const canPaymentRequest = checkPermission(user.role, user.staffId, "plans.edit");
    const [[store, rule, canEdit, config, canPayment, canStaff, canPlans], [digitalButler, referralShare, lineReminder, customerCare, waitlistFeature, musicGrant], usage] = await Promise.all([
    settingsStep("read_config", () => Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true, plan: true, currentSubscription: { select: { status: true, expiresAt: true } }, subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, expiresAt: true } } },
      }),
      coursePrisma.courseBookingRule.findUnique({ where: { storeId } }),
      checkPermission(user.role, user.staffId, "business_hours.manage"),
      prisma.shopConfig.findUnique({ where: { storeId }, select: { address: true, shopPhone: true, lineOfficialId: true, mapUrl: true, lineOfficialUrl: true, bankName: true, bankCode: true, bankAccountNumber: true, bookingWindowDays: true, bookingOpensAt:true, bookableUntilDate: true, dutySchedulingEnabled: true, trialEnabled: true, trialDefaultPrice: true, trialAllowPriceEdit: true, trialMinPrice: true, trialMaxPrice: true } }),
      canPaymentRequest,
      user.role === "OWNER" && checkPermission(user.role,user.staffId,"staff.view"),
      checkPermission(user.role,user.staffId,"wallet.read"),
    ])),
    settingsStep("read_features", () => Promise.all([
      hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER),
      hasStoreFeature(storeId, FEATURES.REFERRAL_SHARE),
      hasStoreFeature(storeId, FEATURES.LINE_REMINDER),
      hasStoreFeature(storeId, FEATURES.CUSTOMER_CARE),
      hasStoreFeature(storeId, FEATURES.COURSE_WAITLIST),
      prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{id:true}}),
    ])),
    canPaymentRequest.then(allowed => allowed ? settingsStep("read_usage", () => getStoreUsage(storeId)) : null),
    ]);
    const waitlistSetting = waitlistFeature
      ? await settingsStep("read_waitlist", () => coursePrisma.courseWaitlistSetting.findUnique({ where: { storeId } }))
      : null;
    const music = !!musicGrant;
    const subscription = store?.currentSubscription ?? store?.subscriptions[0];
    const subscriptionSummary = subscription ? effectiveStateLabel(computeLifecycle(subscription, toLocalDateStr()).state) + (subscription.expiresAt ? " · 到期日 " + subscription.expiresAt.toISOString().slice(0, 10) : " · 未設定到期日") : "尚無訂閱紀錄；續約或調整方案請聯絡總部。";
    // Direct panel queries must not render protected server content for a hidden/locked
    // feature, an unauthorized account or a read-only store view.
    const featurePanelAllowed = panel === "reminders" ? !readOnly && canEdit && lineReminder
      : panel === "referral" ? !readOnly && canPayment && referralShare
      : panel === "butler" ? !readOnly && canPayment && digitalButler
      : true;
    body = (<>
      {!readOnly&&["OWNER","ADMIN"].includes(user.role)&&<CourseSetupGuide storeId={storeId} key={`setup:${storeId}`} manual {...await settingsStep("read_setup", () => getCourseSetup(storeId,user.id))} localSections/>}
      <CourseSettingsWorkspace
        native={sportsNativePreview(storeId)} music={music}
        panelContent={featurePanelAllowed ? <CourseSettingsPanelContent panel={panel} query={panelQuery} /> : null}
        key={`settings:${storeId}`}
        canDigitalButler={canPayment && !readOnly}
        canReferralShare={canPayment && !readOnly}
        canUnassignedPlans={canPlans && await checkPermission(user.role,user.staffId,"customer.read")}
        subscriptionSummary={canPayment ? subscriptionSummary : undefined}
        today={toLocalDateStr()}
        trialSettings={{ trialEnabled: config?.trialEnabled ?? TRIAL_DEFAULTS.trialEnabled, trialDefaultPrice: Number(config?.trialDefaultPrice ?? TRIAL_DEFAULTS.trialDefaultPrice), trialAllowPriceEdit: config?.trialAllowPriceEdit ?? TRIAL_DEFAULTS.trialAllowPriceEdit, trialMinPrice: Number(config?.trialMinPrice ?? TRIAL_DEFAULTS.trialMinPrice), trialMaxPrice: Number(config?.trialMaxPrice ?? TRIAL_DEFAULTS.trialMaxPrice) }}
        bookingOpensAt={config?.bookingOpensAt?.toISOString()??null}
        bookingWindowDays={config?.bookingWindowDays ?? DEFAULT_BOOKABLE_DAYS_AHEAD}
        bookableUntilDate={config?.bookableUntilDate?.toISOString().slice(0,10) ?? null}
        dutyEnabled={config?.dutySchedulingEnabled ?? false}
        trialEnabled={config?.trialEnabled ?? TRIAL_DEFAULTS.trialEnabled}
        trialPrice={Number(config?.trialDefaultPrice ?? TRIAL_DEFAULTS.trialDefaultPrice)}
        storeId={storeId} planLabel={store ? PRICING_PLAN_INFO[store.plan].label : "—"} canPayment={canPayment && !readOnly} canStaff={canStaff} canPlans={canPlans}
        name={store?.name ?? ""}
        bankName={config?.bankName??""} bankCode={config?.bankCode??""} bankAccountNumber={config?.bankAccountNumber??""}
        shopPhone={config?.shopPhone ?? ""} lineOfficialId={config?.lineOfficialId ?? ""} address={config?.address ?? ""} mapUrl={config?.mapUrl ?? ""} lineOfficialUrl={config?.lineOfficialUrl ?? ""}
        selfBookingEnabled={rule?.selfBookingEnabled ?? true}
        selfBookingRevision={rule?.selfBookingRevision ?? 0}
        selfLeaveEnabled={rule?.selfLeaveEnabled ?? true}
        selfRescheduleEnabled={rule?.selfRescheduleEnabled ?? rule?.selfBookingEnabled ?? true}
        backendNoticesEnabled={rule?.backendNoticesEnabled ?? true}
        bookingLeadMinutes={rule?.bookingLeadMinutes ?? 0}
        cancellationLeadMinutes={rule?.cancellationLeadMinutes ?? 0}
        canEdit={canEdit && !readOnly}
        usageMetrics={usage?.metrics}
        canTrial={!readOnly && await checkPermission(user.role,user.staffId,"trial.manage")}
        canReminders={!readOnly && canEdit}
        canCare={customerCare && await checkPermission(user.role,user.staffId,"customer.read")}
        canDutyRead={await checkPermission(user.role,user.staffId,"duty.read")}
        canDutyManage={!readOnly && await checkPermission(user.role,user.staffId,"duty.manage")}
        canHours={!readOnly && await checkPermission(user.role,user.staffId,"business_hours.view")}
        waitlistFeatureAvailable={waitlistFeature}
        waitlistSettings={waitlistFeature ? {
          enabled: waitlistSetting?.enabled ?? false,
          defaultLimit: waitlistSetting?.defaultLimit ?? 5,
          autoPromoteStopMinutes: waitlistSetting?.autoPromoteStopMinutes ?? 240,
        } : undefined}
      />
    </>);

  }
  return <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6"><PageHeader title={title} subtitle={subtitle}/><div className="space-y-5">{body}</div></PageShell>;
}

export function CourseSharedHub(props: Parameters<typeof readCourseSharedHub>[0]) {
  return traceSettingsRead("hub", () => readCourseSharedHub(props));
}
