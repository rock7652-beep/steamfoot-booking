import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { toLocalDateStr } from "@/lib/date-utils";
import { hasFeature, PRICING_PLAN_INFO } from "@/lib/feature-flags";
import type { FeatureKey } from "@/lib/feature-flags";
import {
  MANAGEABLE_STORE_FEATURES,
  STORE_FEATURE_CATEGORIES,
  getStoreFeatureCategory,
  getStoreFeatureLabel,
  resolveStoreFeatureDisplayState,
} from "@/lib/store-feature-catalog";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { FeatureEntitlementForm } from "./feature-entitlement-form";
import { DigitalButlerActivationForm } from "./digital-butler-activation-form";

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
          <Metric
            label="方案內含"
            value={`${MANAGEABLE_STORE_FEATURES.filter((feature) => hasFeature(store.plan, feature.key)).length} 項`}
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
                  const baseAllowed = hasFeature(store.plan, feature.key);
                  const state = resolveStoreFeatureDisplayState(
                    store.plan,
                    feature.key,
                    entitlement,
                  );

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
                  <SummaryCell label="方案預設">
                    <StatusPill
                      label={baseAllowed ? "內含" : "未內含"}
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
                      {state.effectiveAllowed ? "目前可用" : "目前不可用"}
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

                <details className="group mt-3">
                  <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md border border-earth-200 bg-white px-3 text-xs font-medium text-earth-700 transition hover:bg-earth-50 [&::-webkit-details-marker]:hidden">
                    <span>調整設定</span>
                    <span className="text-earth-400 group-open:hidden">展開 ＋</span>
                    <span className="hidden text-earth-400 group-open:inline">收合 −</span>
                  </summary>
                  <div className="mt-3">
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
                </details>
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
