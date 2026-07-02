import { notFound, redirect } from "next/navigation";
import type {
  PricingPlan,
  StoreFeatureEntitlementSource,
  StoreFeatureEntitlementStatus,
} from "@prisma/client";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { toLocalDateStr } from "@/lib/date-utils";
import { hasFeature, PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { FeatureKey } from "@/lib/feature-flags";
import {
  STORE_FEATURE_CATALOG,
  getStoreFeatureLabel,
} from "@/lib/store-feature-catalog";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { FeatureEntitlementForm } from "./feature-entitlement-form";

type EntitlementRow = {
  id: string;
  featureKey: string;
  status: StoreFeatureEntitlementStatus;
  source: StoreFeatureEntitlementSource;
  startsAt: Date | null;
  expiresAt: Date | null;
  note: string | null;
  updatedAt: Date;
};

type FeatureState = {
  effectiveAllowed: boolean;
  statusLabel: string;
  statusClass: string;
  sourceLabel: string;
};

interface PageProps {
  params: Promise<{ storeId: string }>;
}

export default async function StoreFeatureSettingsPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/hq/login");

  const { storeId } = await params;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
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

  const entitlements = new Map(
    store.featureEntitlements.map((entitlement) => [
      entitlement.featureKey,
      entitlement,
    ]),
  );
  const knownFeatureKeys = new Set(STORE_FEATURE_CATALOG.map((feature) => feature.key));
  const unknownEntitlements = store.featureEntitlements.filter(
    (entitlement) => !knownFeatureKeys.has(entitlement.featureKey as FeatureKey),
  );

  return (
    <PageShell className="mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-5">
      <PageHeader
        title={`功能設定 · ${store.name}`}
        subtitle={`${store.slug} · ${PRICING_PLAN_INFO[store.plan].label}（${store.plan}）`}
        actions={
          <div className="flex items-center gap-2">
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
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <Metric label="目前方案" value={PRICING_PLAN_INFO[store.plan].label} />
          <Metric
            label="方案內含"
            value={`${STORE_FEATURE_CATALOG.filter((feature) => hasFeature(store.plan, feature.key)).length} 項`}
          />
          <Metric
            label="單店開啟"
            value={`${store.featureEntitlements.filter((e) => e.status === "ENABLED").length} 項`}
          />
          <Metric
            label="單店關閉"
            value={`${store.featureEntitlements.filter((e) => e.status === "DISABLED").length} 項`}
          />
        </div>
      </div>

      {unknownEntitlements.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">此店有未登錄於程式功能清單的授權資料</p>
          <p className="mt-1 text-xs">
            {unknownEntitlements.map((entitlement) => entitlement.featureKey).join(", ")}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-earth-200 bg-white">
        <div className="grid gap-2 border-b border-earth-200 bg-earth-50 px-4 py-2 text-xs font-medium text-earth-600 lg:grid-cols-[minmax(240px,1fr)_110px_120px_120px_minmax(720px,1.6fr)]">
          <span>功能</span>
          <span>方案預設</span>
          <span>狀態</span>
          <span>來源</span>
          <span>單店覆寫</span>
        </div>

        <div className="divide-y divide-earth-100">
          {STORE_FEATURE_CATALOG.map((feature) => {
            const entitlement = entitlements.get(feature.key) ?? null;
            const baseAllowed = hasFeature(store.plan, feature.key);
            const state = resolveFeatureState(store.plan, feature.key, entitlement);

            return (
              <div
                key={feature.key}
                className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(240px,1fr)_110px_120px_120px_minmax(720px,1.6fr)]"
              >
                <div>
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

                <div className="text-sm">
                  <StatusPill
                    label={baseAllowed ? "內含" : "未內含"}
                    className={
                      baseAllowed
                        ? "bg-green-50 text-green-700"
                        : "bg-earth-100 text-earth-500"
                    }
                  />
                </div>

                <div>
                  <StatusPill
                    label={state.statusLabel}
                    className={state.statusClass}
                  />
                  <p className="mt-1 text-[11px] text-earth-500">
                    {state.effectiveAllowed ? "目前可用" : "目前不可用"}
                  </p>
                </div>

                <div className="text-xs text-earth-600">
                  <p>{state.sourceLabel}</p>
                  {entitlement?.startsAt && (
                    <p className="mt-1 text-earth-400">
                      起：{toLocalDateStr(entitlement.startsAt)}
                    </p>
                  )}
                  {entitlement?.expiresAt && (
                    <p className="mt-1 text-earth-400">
                      迄：{toLocalDateStr(entitlement.expiresAt)}
                    </p>
                  )}
                </div>

                <FeatureEntitlementForm
                  storeId={store.id}
                  featureKey={feature.key}
                  override={entitlement?.status ?? "INHERIT"}
                  source={entitlement?.source ?? "MANUAL"}
                  startsAt={entitlement?.startsAt ? toLocalDateStr(entitlement.startsAt) : ""}
                  expiresAt={entitlement?.expiresAt ? toLocalDateStr(entitlement.expiresAt) : ""}
                  note={entitlement?.note ?? ""}
                />
              </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}

function resolveFeatureState(
  plan: PricingPlan,
  feature: FeatureKey,
  entitlement: EntitlementRow | null,
): FeatureState {
  const baseAllowed = hasFeature(plan, feature);
  if (!entitlement) {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: baseAllowed ? "可用" : "未開通",
      statusClass: baseAllowed
        ? "bg-green-50 text-green-700"
        : "bg-earth-100 text-earth-500",
      sourceLabel: baseAllowed ? PRICING_PLAN_INFO[plan].label : "跟隨方案",
    };
  }

  const now = new Date();
  if (entitlement.startsAt && entitlement.startsAt > now) {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: "尚未生效",
      statusClass: "bg-blue-50 text-blue-700",
      sourceLabel: entitlement.source,
    };
  }

  if (entitlement.expiresAt && entitlement.expiresAt < now) {
    return {
      effectiveAllowed: baseAllowed,
      statusLabel: "已過期",
      statusClass: "bg-amber-50 text-amber-700",
      sourceLabel: `${entitlement.source}（回到方案）`,
    };
  }

  if (entitlement.status === "DISABLED") {
    return {
      effectiveAllowed: false,
      statusLabel: "已關閉",
      statusClass: "bg-red-50 text-red-700",
      sourceLabel: entitlement.source,
    };
  }

  return {
    effectiveAllowed: true,
    statusLabel: "可用",
    statusClass: "bg-green-50 text-green-700",
    sourceLabel: entitlement.source,
  };
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
