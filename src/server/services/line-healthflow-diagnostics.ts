import type { FeatureKey } from "@/lib/feature-flags";
import { FEATURES, PRICING_PLAN_INFO } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { prisma } from "@/lib/db";
import { getLineEnvironmentDiagnosticsForStore } from "@/lib/line-config";

export type DiagnosticStatus = "PASS" | "WARN" | "MISSING";

export type EnvironmentDiagnostic = {
  key: string;
  label: string;
  exists: boolean;
  status: DiagnosticStatus;
};

export type FeatureDiagnostic = {
  key: FeatureKey;
  label: string;
  available: boolean;
  status: DiagnosticStatus;
  detail: string;
};

export type StoreLineHealthFlowDiagnostic = {
  id: string;
  slug: string;
  name: string;
  planLabel: string;
  status: DiagnosticStatus;
  lineDestination: {
    exists: boolean;
    status: DiagnosticStatus;
  };
  liff: {
    exists: boolean;
    source: "DB" | "ENV" | "MISSING";
    envName: string;
    status: DiagnosticStatus;
  };
  lineEnvironment: {
    mappedStoreSlug: string | null;
    accessTokenEnvName: string | null;
    channelSecretEnvName: string | null;
    hasAccessToken: boolean;
    hasSecret: boolean;
    status: DiagnosticStatus;
    detail: string;
  };
  features: FeatureDiagnostic[];
};

export type LineHealthFlowDiagnostics = {
  environment: EnvironmentDiagnostic[];
  stores: StoreLineHealthFlowDiagnostic[];
};

const FEATURE_CHECKS: Array<{ key: FeatureKey; label: string }> = [
  { key: FEATURES.LINE_REMINDER, label: "LINE 提醒" },
  { key: FEATURES.AI_HEALTH_SUMMARY, label: "AI 健康摘要" },
  { key: FEATURES.MEMBER_PORTAL, label: "LINE 會員中心" },
];

function nonEmptyEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function envStatus(name: string, label: string): EnvironmentDiagnostic {
  const exists = nonEmptyEnv(name);
  return {
    key: name,
    label,
    exists,
    status: exists ? "PASS" : "MISSING",
  };
}

function liffEnvNameForSlug(slug: string): string {
  return `NEXT_PUBLIC_LIFF_ID_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function chooseWorstStatus(statuses: DiagnosticStatus[]): DiagnosticStatus {
  if (statuses.includes("MISSING")) return "MISSING";
  if (statuses.includes("WARN")) return "WARN";
  return "PASS";
}

async function featureStatus(
  storeId: string,
  feature: FeatureKey,
  label: string,
): Promise<FeatureDiagnostic> {
  try {
    const available = await hasStoreFeature(storeId, feature);
    return {
      key: feature,
      label,
      available,
      status: available ? "PASS" : "WARN",
      detail: available ? "目前可用" : "目前未開通或依方案不可用",
    };
  } catch {
    return {
      key: feature,
      label,
      available: false,
      status: "WARN",
      detail: "無法判斷功能授權狀態",
    };
  }
}

export function getHealthFlowEnvironmentDiagnostics(): EnvironmentDiagnostic[] {
  return [
    envStatus("HEALTH_API_URL", "HealthFlow API URL"),
    envStatus("HEALTH_API_KEY", "HealthFlow API Key"),
  ];
}

export async function getLineHealthFlowDiagnostics(): Promise<LineHealthFlowDiagnostics> {
  const stores = await prisma.store.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      plan: true,
      lineDestination: true,
      liffId: true,
    },
  });

  const storeDiagnostics = await Promise.all(
    stores.map(async (store): Promise<StoreLineHealthFlowDiagnostic> => {
      const liffEnvName = liffEnvNameForSlug(store.slug);
      const hasDbLiffId = Boolean(store.liffId?.trim());
      const hasEnvLiffId = nonEmptyEnv(liffEnvName);
      const liffStatus: DiagnosticStatus = hasDbLiffId || hasEnvLiffId ? "PASS" : "MISSING";
      const lineById = getLineEnvironmentDiagnosticsForStore(store.id);
      const lineBySlug = getLineEnvironmentDiagnosticsForStore(store.slug);
      const idMappingComplete = lineById.hasAccessToken && lineById.hasSecret;
      const slugMappingComplete = lineBySlug.hasAccessToken && lineBySlug.hasSecret;
      const lineEnvironmentStatus: DiagnosticStatus = idMappingComplete
        ? "PASS"
        : slugMappingComplete
          ? "WARN"
          : "MISSING";
      const features = await Promise.all(
        FEATURE_CHECKS.map((feature) => featureStatus(store.id, feature.key, feature.label)),
      );
      const lineDestinationStatus: DiagnosticStatus = store.lineDestination?.trim()
        ? "PASS"
        : "MISSING";

      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        planLabel: PRICING_PLAN_INFO[store.plan].label,
        status: chooseWorstStatus([
          lineDestinationStatus,
          liffStatus,
          lineEnvironmentStatus,
          ...features.map((feature) => feature.status),
        ]),
        lineDestination: {
          exists: lineDestinationStatus === "PASS",
          status: lineDestinationStatus,
        },
        liff: {
          exists: hasDbLiffId || hasEnvLiffId,
          source: hasDbLiffId ? "DB" : hasEnvLiffId ? "ENV" : "MISSING",
          envName: liffEnvName,
          status: liffStatus,
        },
        lineEnvironment: {
          mappedStoreSlug: lineById.storeSlug ?? lineBySlug.storeSlug,
          accessTokenEnvName: lineById.accessTokenEnvName ?? lineBySlug.accessTokenEnvName,
          channelSecretEnvName: lineById.channelSecretEnvName ?? lineBySlug.channelSecretEnvName,
          hasAccessToken: lineById.hasAccessToken,
          hasSecret: lineById.hasSecret,
          status: lineEnvironmentStatus,
          detail: idMappingComplete
            ? "store.id runtime mapping 完整"
            : slugMappingComplete
              ? "slug env 存在，但 store.id runtime mapping 未完整"
              : "LINE token / secret mapping 缺少或未設定",
        },
        features,
      };
    }),
  );

  return {
    environment: getHealthFlowEnvironmentDiagnostics(),
    stores: storeDiagnostics,
  };
}
