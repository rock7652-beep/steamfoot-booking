import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import {
  getLineHealthFlowDiagnostics,
  type DiagnosticStatus,
  type EnvironmentDiagnostic,
  type FeatureDiagnostic,
  type StoreLineHealthFlowDiagnostic,
} from "@/server/services/line-healthflow-diagnostics";

const STATUS_STYLES: Record<DiagnosticStatus, string> = {
  PASS: "bg-green-50 text-green-700 border-green-200",
  WARN: "bg-amber-50 text-amber-700 border-amber-200",
  MISSING: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABELS: Record<DiagnosticStatus, string> = {
  PASS: "PASS",
  WARN: "WARN",
  MISSING: "MISSING",
};

export default async function LineHealthFlowDiagnosticsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/hq/login");

  const diagnostics = await getLineHealthFlowDiagnostics();
  const summary = diagnostics.stores.reduce(
    (acc, store) => {
      acc[store.status] += 1;
      return acc;
    },
    { PASS: 0, WARN: 0, MISSING: 0 } as Record<DiagnosticStatus, number>,
  );

  return (
    <PageShell className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-5">
      <PageHeader
        title="LINE / LIFF / HealthFlow 設定診斷"
        subtitle="只讀檢查各店 LINE、LIFF 與 HealthFlow 設定完整度；不發 LINE、不呼叫 HealthFlow、不修改資料。"
        actions={
          <Link
            href="/hq/dashboard/stores"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            返回店舖列表
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="檢查店舖" value={`${diagnostics.stores.length} 間`} />
        <Metric label="PASS" value={`${summary.PASS} 間`} tone="pass" />
        <Metric label="WARN" value={`${summary.WARN} 間`} tone="warn" />
        <Metric label="MISSING" value={`${summary.MISSING} 間`} tone="missing" />
      </section>

      <section className="rounded-lg border border-earth-200 bg-white">
        <div className="border-b border-earth-200 bg-earth-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-earth-800">Environment 設定</h2>
          <p className="mt-1 text-xs text-earth-500">
            只顯示 env key 是否存在，不顯示 secret / token 原文。
          </p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {diagnostics.environment.map((item) => (
            <EnvironmentCard key={item.key} item={item} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-earth-200 bg-white">
        <div className="border-b border-earth-200 bg-earth-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-earth-800">各店 LINE / LIFF / 功能授權</h2>
          <p className="mt-1 text-xs text-earth-500">
            LINE runtime mapping 以 store.id 判斷；若只有 slug mapping，會標示 WARN 供上線前修正。
          </p>
        </div>
        <div className="divide-y divide-earth-100">
          {diagnostics.stores.map((store) => (
            <StoreDiagnosticsRow key={store.id} store={store} />
          ))}
        </div>
        {diagnostics.stores.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-earth-400">
            尚無店舖資料可診斷
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "pass" | "warn" | "missing";
}) {
  const toneClass =
    tone === "pass"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "missing"
          ? "text-red-700"
          : "text-earth-900";
  return (
    <div className="rounded-lg border border-earth-200 bg-white px-4 py-3">
      <p className="text-xs text-earth-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: DiagnosticStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function EnvironmentCard({ item }: { item: EnvironmentDiagnostic }) {
  return (
    <div className="rounded-lg border border-earth-100 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-earth-800">{item.label}</p>
          <p className="mt-1 font-mono text-xs text-earth-400">{item.key}</p>
        </div>
        <StatusPill status={item.status} />
      </div>
      <p className="mt-2 text-xs text-earth-500">
        {item.exists ? "已設定，值已遮蔽" : "未設定"}
      </p>
    </div>
  );
}

function StoreDiagnosticsRow({ store }: { store: StoreLineHealthFlowDiagnostic }) {
  return (
    <article className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.8fr)]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-earth-900">{store.name}</h3>
          <StatusPill status={store.status} />
        </div>
        <p className="mt-1 font-mono text-xs text-earth-400">{store.slug}</p>
        <p className="mt-1 text-xs text-earth-500">{store.planLabel}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <CheckBlock
          label="LINE Destination"
          status={store.lineDestination.status}
          detail={store.lineDestination.exists ? "Store.lineDestination 已設定" : "缺 Store.lineDestination"}
        />
        <CheckBlock
          label="LIFF ID"
          status={store.liff.status}
          detail={
            store.liff.source === "DB"
              ? "使用 Store.liffId"
              : store.liff.source === "ENV"
                ? `使用 ${store.liff.envName}`
                : `缺 Store.liffId / ${store.liff.envName}`
          }
        />
        <CheckBlock
          label="LINE Token / Secret"
          status={store.lineEnvironment.status}
          detail={store.lineEnvironment.detail}
        >
          <p className="mt-1 font-mono text-[11px] text-earth-400">
            {store.lineEnvironment.accessTokenEnvName ?? "NO_TOKEN_ENV"} /{" "}
            {store.lineEnvironment.channelSecretEnvName ?? "NO_SECRET_ENV"}
          </p>
        </CheckBlock>
        <div className="rounded-lg border border-earth-100 px-3 py-3">
          <p className="text-xs font-semibold text-earth-500">功能授權</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {store.features.map((feature) => (
              <FeatureChip key={feature.key} feature={feature} />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function CheckBlock({
  label,
  status,
  detail,
  children,
}: {
  label: string;
  status: DiagnosticStatus;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-earth-100 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-earth-500">{label}</p>
        <StatusPill status={status} />
      </div>
      <p className="mt-2 text-xs text-earth-600">{detail}</p>
      {children}
    </div>
  );
}

function FeatureChip({ feature }: { feature: FeatureDiagnostic }) {
  return (
    <span
      title={feature.detail}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${STATUS_STYLES[feature.status]}`}
    >
      {feature.label}
      <span className="font-normal">{feature.available ? "可用" : "未開通"}</span>
    </span>
  );
}
