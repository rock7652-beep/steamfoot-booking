import { readCourseSharedCardSnapshot } from "@/server/services/course-shared-card";
import { resolveCourseSharedCardState } from "@/lib/course-shared-card-policy";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { toLocalDateStr } from "@/lib/date-utils";
import { hasFeature, PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { isSingleStoreTrial } from "@/lib/single-store-trial";
import type { FeatureKey } from "@/lib/feature-flags";
import {
  MANAGEABLE_STORE_FEATURES,
  STORE_FEATURE_CATEGORIES,
  getStoreFeatureCategory,
  getStoreFeatureLabel,
  resolveStoreFeatureDisplayState,
  isRetiredStoreFeature,
} from "@/lib/store-feature-catalog";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { FeatureEntitlementList } from "./feature-entitlement-list";
import { DigitalButlerActivationForm } from "./digital-butler-activation-form";

interface PageProps {
  params: Promise<{ storeId: string }>;
}

export default async function StoreFeatureSettingsPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || !(await checkPermission(user.role, user.staffId, "staff.manage"))) redirect("/hq/login");

  const { storeId } = await params;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      planStatus: true,
      planEffectiveAt: true,
      planExpiresAt: true,
      industryModule: true,
      lineDestination: true,
      digitalButlerEnabled: true,
      featureEntitlements: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          featureKey: true,
          status: true,
          source: true,
          startsAt: true,
          expiresAt: true,
          note: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!store) notFound();

  const supportsSharedCard = store.industryModule === "COURSE" && !store.featureEntitlements.some(e => e.featureKey === "business.music" && e.status === "ENABLED");
  const sharedCardSnapshot = supportsSharedCard ? await readCourseSharedCardSnapshot(prisma, store.id) : null;
  const sharedCardState = resolveCourseSharedCardState(sharedCardSnapshot);
  const manageableFeatures = MANAGEABLE_STORE_FEATURES.filter(feature => feature.key !== "shared_card" || supportsSharedCard);

  // Match the same gate used by the store dashboard, including the full single-store trial.
  const featureAccess = new Map(await Promise.all(
    manageableFeatures.map(async (feature) => [
      feature.key,
      await hasStoreFeature(store.id, feature.key),
    ] as const),
  ));
  const fullSingleStoreAccess = isSingleStoreTrial(store) ||
    (store.plan === "EXPERIENCE" && store.industryModule === "COURSE");
  const trialNotStarted = store.plan === "EXPERIENCE" && store.industryModule === "COURSE" &&
    !store.planEffectiveAt && !store.planExpiresAt;
  const availableCount = [...featureAccess.values()].filter(Boolean).length;
  const singleStoreCount = manageableFeatures.length;

  const entitlements = new Map(
    store.featureEntitlements.map((entitlement) => [
      entitlement.featureKey,
      entitlement,
    ]),
  );
  const knownFeatureKeys = new Set(MANAGEABLE_STORE_FEATURES.map((feature) => feature.key));
  const unknownEntitlements = store.featureEntitlements.filter(
    (entitlement) => !knownFeatureKeys.has(entitlement.featureKey as FeatureKey) && !isRetiredStoreFeature(entitlement.featureKey),
  );

  return (
    <PageShell className="box-border flex w-full min-w-0 flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <PageHeader
        title={`功能設定 · ${store.name}`}
        subtitle={`${store.slug} · ${PRICING_PLAN_INFO[store.plan].label}（${store.plan}）`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/hq/dashboard/stores/${store.id}`}
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              返回店舖詳情
            </Link>
            <Link
              href="/hq/dashboard/stores"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              店舖列表
            </Link>
          </div>
        }
      />

      <div className="rounded-lg border border-earth-200 bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Metric label="目前方案" value={PRICING_PLAN_INFO[store.plan].label} />
          <Metric label="實際授權" value={`${availableCount} 項`} />
          <Metric label="試用功能" value={`${singleStoreCount} 項`} />
          <Metric label="試用計時" value={trialNotStarted ? "尚未開始" : store.planExpiresAt ? (store.planExpiresAt < new Date() ? "已到期" : "已開始") : "不適用"} />
        </div>
      </div>

      {fullSingleStoreAccess && (
        <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-medium">{trialNotStarted ? "課程體驗店功能已授權，30 天試用尚未起算" : "完整功能試用權限已開放"}</p>
          <p className="mt-1 text-xs">功能授權不等於外部服務已設定。LINE 入口、提醒規則與實際發送仍須逐項驗收；包含母子店與展店功能，預設可串接一家分店。</p>
          {!store.lineDestination && <p className="mt-1 text-xs font-medium">此店尚未設定 LINE 導流入口。</p>}
          <p className="mt-1 text-xs">試用保留完整功能授權；隱藏／鎖定依總部設定生效，既有資料保留。</p>
        </div>
      )}

      <DigitalButlerActivationForm
        storeId={store.id}
        enabled={store.digitalButlerEnabled}
      />

      {unknownEntitlements.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">此店有未登錄於程式功能清單的授權資料</p>
          <p className="mt-1 text-xs">
            {unknownEntitlements.map((entitlement) => entitlement.featureKey).join(", ")}
          </p>
        </div>
      )}

      <FeatureEntitlementList storeId={store.id} categories={[...STORE_FEATURE_CATEGORIES]} rows={manageableFeatures.map(feature => {
                  const entitlement = entitlements.get(feature.key) ?? null;
                  const trialAllowed = fullSingleStoreAccess && feature.key !== "shared_card";
                  const baseAllowed = feature.key === "shared_card" ? false : trialAllowed || hasFeature(store.plan, feature.key);
                  const ordinaryState = resolveStoreFeatureDisplayState(
                    store.plan,
                    feature.key,
                    entitlement,
                  );
                  const explicitlyRestricted = (entitlement?.status === "HIDDEN" || entitlement?.status === "LOCKED") && (ordinaryState.statusLabel === "隱藏" || ordinaryState.statusLabel === "鎖定");
                  const explicitlyEnabled = entitlement?.status === "ENABLED" && ordinaryState.statusLabel === "啟用";
                  const state = feature.key === "shared_card" ? {
                    effectiveAllowed: sharedCardState === "ENABLED",
                    statusLabel: sharedCardState === "ENABLED" ? "可用" : sharedCardState === "HIDDEN" ? "隱藏" : "鎖定",
                    statusClass: sharedCardState === "ENABLED" ? "bg-green-50 text-green-700" : "bg-earth-100 text-earth-600",
                    sourceLabel: entitlement ? "總部覆寫（保留既有權益）" : "需總部開通／舊店資格初始化",
                  } : trialAllowed && !explicitlyRestricted && !explicitlyEnabled ? {
                    effectiveAllowed: featureAccess.get(feature.key) === true,
                    statusLabel: "試用授權",
                    statusClass: "bg-blue-50 text-blue-700",
                    sourceLabel: "完整功能試用規則",
                  } : { ...ordinaryState, effectiveAllowed: featureAccess.get(feature.key) === true };
                  const requiresLineSetup = feature.key === "line_reminder" || feature.key === "digital_butler" || feature.key === "member_portal";

        return {
          key: feature.key, label: getStoreFeatureLabel(feature.key), category: getStoreFeatureCategory(feature),
          description: feature.description, baseAllowed, ...state, requiresLineSetup,
          override: entitlement?.status ?? "INHERIT", source: entitlement?.source ?? "MANUAL",
          startsAt: entitlement?.startsAt ? toLocalDateStr(entitlement.startsAt) : "",
          expiresAt: entitlement?.expiresAt ? toLocalDateStr(entitlement.expiresAt) : "", note: entitlement?.note ?? "",
        };
      })} />
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-earth-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-earth-900">{value}</p>
    </div>
  );
}
