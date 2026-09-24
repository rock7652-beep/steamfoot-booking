import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { toLocalDateStr } from "@/lib/date-utils";
import { hasFeature, PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { isSingleStoreFeature, isSingleStoreTrial } from "@/lib/single-store-trial";
import type { FeatureKey } from "@/lib/feature-flags";
import {
  MANAGEABLE_STORE_FEATURES,
  STORE_FEATURE_CATEGORIES,
  getStoreFeatureCategory,
  getStoreFeatureLabel,
  resolveStoreFeatureDisplayState,
} from "@/lib/store-feature-catalog";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { FeatureEntitlementForm } from "./feature-entitlement-form";
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

  // Match the same gate used by the store dashboard, including the full single-store trial.
  const featureAccess = new Map(await Promise.all(
    MANAGEABLE_STORE_FEATURES.map(async (feature) => [
      feature.key,
      await hasStoreFeature(store.id, feature.key),
    ] as const),
  ));
  const fullSingleStoreAccess = isSingleStoreTrial(store) ||
    (store.plan === "EXPERIENCE" && store.industryModule === "COURSE");
  const trialNotStarted = store.plan === "EXPERIENCE" && store.industryModule === "COURSE" &&
    !store.planEffectiveAt && !store.planExpiresAt;
  const availableCount = [...featureAccess.values()].filter(Boolean).length;
  const singleStoreCount = MANAGEABLE_STORE_FEATURES.filter((feature) => isSingleStoreFeature(feature.key)).length;

  const entitlements = new Map(
    store.featureEntitlements.map((entitlement) => [
      entitlement.featureKey,
      entitlement,
    ]),
  );
  const knownFeatureKeys = new Set(MANAGEABLE_STORE_FEATURES.map((feature) => feature.key));
  const unknownEntitlements = store.featureEntitlements.filter(
    (entitlement) => !knownFeatureKeys.has(entitlement.featureKey as FeatureKey),
  );

  return (
    <PageShell className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-5">
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
          <Metric label="單店功能" value={`${singleStoreCount} 項`} />
          <Metric label="試用計時" value={trialNotStarted ? "尚未開始" : store.planExpiresAt ? (store.planExpiresAt < new Date() ? "已到期" : "已開始") : "不適用"} />
        </div>
      </div>

      {fullSingleStoreAccess && (
        <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-medium">{trialNotStarted ? "課程體驗店功能已授權，30 天試用尚未起算" : "完整單店試用權限已開放"}</p>
          <p className="mt-1 text-xs">功能授權不等於外部服務已設定。LINE 入口、提醒規則與實際發送仍須逐項驗收；多店功能不包含在單店試用內。</p>
          {!store.lineDestination && <p className="mt-1 text-xs font-medium">此店尚未設定 LINE 導流入口。</p>}
          <p className="mt-1 text-xs">試用期間單店授權覆寫不生效；試用起迄請至店舖詳情確認。</p>
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

      <div className="overflow-hidden rounded-lg border border-earth-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-earth-200 bg-earth-50 px-4 py-2.5">
          <p className="text-xs font-medium text-earth-600">功能授權清單</p>
          <p className="text-[11px] text-earth-400">預設收合，點「調整設定」再展開編輯</p>
        </div>

        <div className="grid gap-5 p-3">
          {STORE_FEATURE_CATEGORIES.map((category) => (
            <section key={category} aria-labelledby={`feature-category-${category}`}>
              <div className="mb-2 flex items-center gap-2">
                <h2
                  id={`feature-category-${category}`}
                  className="text-sm font-semibold text-earth-800"
                >
                  {category}
                </h2>
                <span className="h-px flex-1 bg-earth-100" />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {MANAGEABLE_STORE_FEATURES.filter(
                  (feature) => getStoreFeatureCategory(feature) === category,
                ).map((feature) => {
                  const entitlement = entitlements.get(feature.key) ?? null;
                  const trialAllowed = fullSingleStoreAccess && isSingleStoreFeature(feature.key);
                  const baseAllowed = trialAllowed || hasFeature(store.plan, feature.key);
                  const ordinaryState = resolveStoreFeatureDisplayState(
                    store.plan,
                    feature.key,
                    entitlement,
                  );
                  const state = trialAllowed ? {
                    effectiveAllowed: featureAccess.get(feature.key) === true,
                    statusLabel: "試用授權",
                    statusClass: "bg-blue-50 text-blue-700",
                    sourceLabel: "單店試用規則",
                  } : { ...ordinaryState, effectiveAllowed: featureAccess.get(feature.key) === true };
                  const requiresLineSetup = feature.key === "line_reminder" || feature.key === "digital_butler" || feature.key === "member_portal";

                  return (
                    <article
                      key={feature.key}
                      className="min-w-0 rounded-lg border border-earth-200 bg-white p-3 shadow-sm"
                    >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-earth-900">
                        {getStoreFeatureLabel(feature.key)}
                      </h2>
                      <span className="rounded-full bg-earth-100 px-2 py-0.5 text-[11px] font-medium text-earth-600">
                        {feature.module}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-earth-500">
                      {feature.description}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-earth-400">
                      {feature.key}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 rounded-md bg-earth-50/70 p-2.5 sm:grid-cols-3">
                  <SummaryCell label="基本授權">
                    <StatusPill
                      label={baseAllowed ? "開放" : "未開放"}
                      className={
                        baseAllowed
                          ? "bg-green-50 text-green-700"
                          : "bg-earth-100 text-earth-500"
                      }
                    />
                  </SummaryCell>

                  <SummaryCell label="最終狀態">
                    <StatusPill label={state.statusLabel} className={state.statusClass} />
                    <p className="mt-1 text-[11px] text-earth-500">
                      {state.effectiveAllowed ? "權限已開放" : "權限未開放"}
                    </p>
                  </SummaryCell>

                  <SummaryCell label="來源">
                    <p className="text-xs text-earth-700">{state.sourceLabel}</p>
                    {entitlement?.startsAt && (
                      <p className="mt-1 text-[11px] text-earth-400">
                        開始：{toLocalDateStr(entitlement.startsAt)}
                      </p>
                    )}
                    {entitlement?.expiresAt && (
                      <p className="mt-1 text-[11px] text-earth-400">
                        結束：{toLocalDateStr(entitlement.expiresAt)}
                      </p>
                    )}
                  </SummaryCell>
                </div>

                {requiresLineSetup && state.effectiveAllowed && (
                  <p className="mt-2 text-xs text-amber-800">LINE 相關功能須另行設定與實測發送，權限開放不代表通知已正常運作。</p>
                )}
                {!trialAllowed && <details className="group mt-3">
                  <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md border border-earth-200 bg-white px-3 text-xs font-medium text-earth-700 transition hover:bg-earth-50 [&::-webkit-details-marker]:hidden">
                    <span>調整設定</span>
                    <span className="text-earth-400 group-open:hidden">展開 ＋</span>
                    <span className="hidden text-earth-400 group-open:inline">收合 −</span>
                  </summary>
                  <div className="mt-3">
                    <FeatureEntitlementForm
                      key={`${store.id}:${feature.key}:${entitlement?.updatedAt?.getTime() ?? "default"}`}
                      storeId={store.id}
                      featureKey={feature.key}
                      override={entitlement?.status ?? "INHERIT"}
                      source={entitlement?.source ?? "MANUAL"}
                      startsAt={entitlement?.startsAt ? toLocalDateStr(entitlement.startsAt) : ""}
                      expiresAt={entitlement?.expiresAt ? toLocalDateStr(entitlement.expiresAt) : ""}
                      note={entitlement?.note ?? ""}
                    />
                  </div>
                </details>}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function SummaryCell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium text-earth-400">{label}</p>
      {children}
    </div>
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

function StatusPill({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
