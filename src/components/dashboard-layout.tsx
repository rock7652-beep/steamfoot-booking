import { canReadInventoryFinance } from "@/server/inventory-finance-access";
import { isHqPlatformPath } from "@/lib/hq-navigation";
import { FeaturePresentationProvider } from "@/components/feature-presentation";
import { CustomerLabelsProvider } from "@/components/customer-labels";
import { loadCustomerLabels } from "@/server/actions/customer-labels";
import { isOperationGuidePreview } from "@/lib/operation-guide-preview";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { redirect, notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { logoutAction } from "@/server/actions/auth";
import { getUserPermissions, ROLE_LABELS, checkPermission, isStaffRole } from "@/lib/permissions";
import { getCachedStorePlan, getCachedTrialStatus } from "@/lib/query-cache";
import { getActiveStoreForRead, getStoreOptions } from "@/lib/store";
import { OperationScope } from "@/components/operations/operation-scope";
import DashboardShell from "@/components/dashboard-shell-with-hq-line";
import { LogoutButton } from "@/components/logout-button";
import { SubscriptionStatusBanner } from "@/components/subscription-status-banner";
import { trialRetentionMessage } from "@/lib/trial-retention";
import { StoreOperatingStatusBanner } from "@/components/store-operating-status-banner";
import { ViewModeBanner } from "@/components/view-mode-banner";
import { prisma } from "@/lib/db";
import { computeLifecycle } from "@/lib/subscription-lifecycle";
import { toLocalDateStr } from "@/lib/date-utils";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature, getStoreFeaturePresentation } from "@/lib/feature-gate";
import type { StoreOperatingStatus } from "@/lib/store-operating-status";
import {
  resolveStoreViewContext,
  type StoreViewContext,
  type ViewableStoreOption,
} from "@/lib/store-organization";
import type { IndustryModuleId } from "@/lib/industry-modules";
import { PreviewNavigationReporter } from "@/components/device-preview/preview-navigation-reporter";

export default async function DashboardLayout({
  children,
  hqPlatform = false,
}: {
  children: React.ReactNode;
  hqPlatform?: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/hq/login");
  }
  hqPlatform = hqPlatform || (user.role === "ADMIN" && isHqPlatformPath((await headers()).get("x-next-pathname") ?? ""));
  if (hqPlatform && user.role !== "ADMIN") redirect("/hq/login");
  if (user.role === "CUSTOMER") {
    // B7-4: 顧客不可進後台，導回所屬店
    const { cookies: getCookies } = await import("next/headers");
    const ck = await getCookies();
    const slug = ck.get("store-slug")?.value ?? "zhubei";
    redirect(`/s/${slug}/book`);
  }

  if (hqPlatform && !(await checkPermission(user.role, user.staffId, "staff.manage"))) notFound();

  const roleLabel = ROLE_LABELS[user.role] ?? "";
  const isAdmin = user.role === "ADMIN";
  // Legacy sidebar ownerOnly means backend identity; individual permissions still control each item.
  const isOwnerLevel = isStaffRole(user.role);

  // Source of truth: Store.plan (PricingPlan)
  const [permissions, storeOptions, activeStoreId] =
    await Promise.all([
      getUserPermissions(user.role, user.staffId),
      getStoreOptions(user),
      getActiveStoreForRead(user).catch(error => {
        if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND")) notFound();
        throw error;
      }),
    ]);
  if (isAdmin && activeStoreId && !storeOptions.some(store => store.id === activeStoreId)) {
    const archived = await prisma.store.findUnique({ where: { id: activeStoreId }, select: { id: true, slug: true, name: true, isDefault: true, archivedAt: true } });
    if (archived?.archivedAt) storeOptions.push({ id: archived.id, slug: archived.slug, name: archived.name, isDefault: archived.isDefault, isArchived: true });
  }
  const industryModule = !hqPlatform && activeStoreId ? await getStoreIndustryModule(activeStoreId) : "steamfoot";
  // Course stores must not enter legacy Steamfoot/SPA dashboard reads while
  // the remaining course-specific areas are being delivered.
  if (industryModule === "course") {
    const isOwnerChildStoreView =
      user.role === "OWNER" && !!user.storeId && activeStoreId !== user.storeId;
    if (user.role !== "ADMIN" && !isOwnerChildStoreView) {
      const {prisma}=await import("@/lib/db");
      if (!await prisma.staff.findFirst({where:{id:user.staffId ?? "",storeId:activeStoreId!,userId:user.id,status:"ACTIVE"}})) notFound();
    }
    const requestedPath = (await headers()).get("x-next-pathname") ?? "";
    if (!/\/dashboard\/?$/.test(requestedPath) && !/\/dashboard\/(?:work-orders(?:\/|$)|inventory(?:\/|$)|courses(?:\/|$)|customers\/merge\/?$|duty(?:\/\d{4}-\d{2}-\d{2})?\/?$|settings\/(?:duty|trial|referral-share|digital-butler)\/?$|staff(?:\/[^/]+\/edit)?\/?$|teachers\/?$|cashbook(?:\/new|\/[^/]+\/edit)?\/?$|cash-drawer\/?$|revenue\/?$|transactions\/?$|data-export\/?$|growth\/?$|digital-butler\/leads\/?$|reconciliation\/?$|store-revenue\/?$|service-fee-calculator\/?$|guide\/?$|frontend-preview\/?$|device-preview\/?$|operation-audits\/?$)/.test(requestedPath)) {
      redirect("/dashboard/courses");
    }
  }
  const trialStatus = hqPlatform ? undefined : industryModule === "course"
    ? await (await import("@/lib/shop-config")).getTrialStatus(activeStoreId ?? undefined)
    : await getCachedTrialStatus(activeStoreId ?? undefined);

  // ADMIN 看到的 plan：切到特定店時用該店 plan，全部分店時解鎖全部功能（ALLIANCE）
  // OWNER/PARTNER：用自己店的 plan
  // 走 unstable_cache（60s TTL, tag: "store-plan"）— 之前直接呼叫
  // getStorePlanById 是同步阻塞，每次切頁都打一次 prisma，現在多人切頁
  // 共享 cache。Mutation 路徑已透過 revalidation.ts 失效對應 tag。
  const effectiveStoreId = hqPlatform ? undefined : activeStoreId ?? undefined;
  const pricingPlan = isAdmin && (hqPlatform || !activeStoreId)
    ? ("ALLIANCE" as const)
    : effectiveStoreId
      ? await getCachedStorePlan(effectiveStoreId)
      : ("EXPERIENCE" as const);
  const featureStates = effectiveStoreId
    ? Object.fromEntries(await Promise.all(Object.values(FEATURES).map(async feature => [feature, await getStoreFeaturePresentation(effectiveStoreId, feature)])))
    // HQ opens a store selector; page and iframe enforce the selected store's grant.
    : {
      [FEATURES.BASIC_REPORTS]: isAdmin ? "ENABLED" as const : "LOCKED" as const,
      [FEATURES.FRONTEND_PREVIEW]: isAdmin ? "ENABLED" as const : "LOCKED" as const,
    };
  const effectiveFeatures = Object.fromEntries(Object.entries(featureStates).map(([feature, state]) => [feature, state === "ENABLED"]));


  // 讀取 store-slug 用於 logout redirect（ADMIN 不帶 slug，回 /）
  const ckStore = await cookies();
  const dashStoreSlug = !isAdmin ? (ckStore.get("store-slug")?.value ?? null) : null;

  // §5 訂閱到期 / 暫停登入提醒（衍生狀態）。
  // 只 select status + expiresAt（既有欄位）→ prod-safe（不碰 #295 新欄位）；
  // 查詢失敗不影響後台（提醒非關鍵功能）。本階段只提醒、不限制操作。
  let subBannerState: "EXPIRED" | "SUSPENDED" | null = null;
  let operatingStatus: StoreOperatingStatus | null = null;
  let storeName: string | null = null;
  let storeViewContext: StoreViewContext | null = null;
  let viewableStores: ViewableStoreOption[] = [];
  let multiStoreEnabled = false;
  let industryModuleId: IndustryModuleId = "steamfoot";
  if (effectiveStoreId) {
    try {
      const store = await prisma.store.findUnique({
        where: { id: effectiveStoreId },
        select: { name: true, operatingStatus: true },
      });
      storeName = store?.name ?? null;
      operatingStatus = store?.operatingStatus ?? null;
      industryModuleId = await getStoreIndustryModule(effectiveStoreId);
    } catch {
      // 忽略：店名/營運狀態失敗時使用 UI fallback
    }

    try {
      const current = await prisma.store.findUnique({
        where: { id: effectiveStoreId },
        select: { currentSubscription: { select: { status: true, expiresAt: true } } },
      });
      const sub = current?.currentSubscription ?? await prisma.storeSubscription.findFirst({
        where: { storeId: effectiveStoreId },
        orderBy: { createdAt: "desc" },
        select: { status: true, expiresAt: true },
      });
      if (sub) {
        const lc = computeLifecycle(
          { status: sub.status, expiresAt: sub.expiresAt },
          toLocalDateStr(),
        );
        if (lc.state === "EXPIRED" || lc.state === "SUSPENDED") {
          subBannerState = lc.state;
        }
      }
    } catch {
      // 忽略：提醒非關鍵功能
    }
  }

  if (user.role === "OWNER" && user.storeId) {
    multiStoreEnabled = await hasStoreFeature(user.storeId, FEATURES.MULTI_STORE);
    viewableStores = storeOptions.map((store) => ({
      id: store.id,
      name: store.name,
      isOwnStore: store.id === user.storeId,
    }));
    storeViewContext = await resolveStoreViewContext(user, {
      viewedStoreId: activeStoreId,
    });
  }

  const ownStore = user.storeId
    ? viewableStores.find((store) => store.id === user.storeId)
    : null;
  const descendantStores = viewableStores.filter((store) => !store.isOwnStore);
  const viewedStore = storeViewContext?.viewedStoreId
    ? viewableStores.find((store) => store.id === storeViewContext?.viewedStoreId)
    : null;

  const operationScope = JSON.stringify([user.id, user.role, user.staffId, activeStoreId,
    storeViewContext?.viewedStoreId, industryModule, [...permissions].sort()]);
  return (
    <OperationScope key={operationScope} scope={operationScope}>
    <FeaturePresentationProvider states={featureStates}>
    <DashboardShell
      cashDrawerStoreId={effectiveStoreId && permissions.includes("cashDrawer.read") && effectiveFeatures[FEATURES.CASH_DRAWER] && await canReadInventoryFinance(effectiveStoreId, user) ? effectiveStoreId : undefined}
      operationGuidePreview={isOperationGuidePreview()}
      industryModule={industryModule}
      isOwner={isOwnerLevel}
      permissions={permissions}
      pricingPlan={pricingPlan}
      effectiveFeatures={effectiveFeatures}
      featureStates={featureStates}
      musicEnabled={industryModule==="course" && !!effectiveStoreId && !!await prisma.storeFeatureEntitlement.findFirst({where:{storeId:effectiveStoreId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}})}
      userName={user.name ?? ""}
      roleLabel={roleLabel}
      logoutButton={
        <form action={logoutAction}>
          {dashStoreSlug && dashStoreSlug !== "__hq__" && (
            <input type="hidden" name="storeSlug" value={dashStoreSlug} />
          )}
          <LogoutButton
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-earth-600 hover:bg-earth-50"
            iconClassName="text-earth-400"
            iconSize={14}
          />
        </form>
      }
      trialStatus={trialStatus}
      storeName={storeName}
      storeOptions={isAdmin ? storeOptions : undefined}
      activeStoreId={isAdmin ? activeStoreId : undefined}
      viewMode={
        user.role === "OWNER" && ownStore && storeViewContext
          ? {
              ownStore,
              descendantStores,
              viewedStoreId: storeViewContext.viewedStoreId ?? ownStore.id,
              multiStoreEnabled,
            }
          : undefined
      }
      industryModuleId={industryModuleId}
      notices={
        <>
          {storeViewContext?.isViewMode && viewedStore ? (
            <ViewModeBanner viewedStoreName={viewedStore.name} />
          ) : null}
          {operatingStatus ? (
            <StoreOperatingStatusBanner status={operatingStatus} />
          ) : null}
          {subBannerState ? (
            <SubscriptionStatusBanner state={subBannerState} retentionMessage={trialStatus?.retention ? trialRetentionMessage(trialStatus.retention) : undefined} />
          ) : null}
        </>
      }
    >
      <PreviewNavigationReporter />
      <CustomerLabelsProvider key={`${user.id}:${activeStoreId}:${user.role}:${user.staffId ?? ""}`} initial={permissions.includes("customer.read") ? await loadCustomerLabels() : undefined}>{children}</CustomerLabelsProvider>
    </DashboardShell>
    </FeaturePresentationProvider>
    </OperationScope>
  );
}
