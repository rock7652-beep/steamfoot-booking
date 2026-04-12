import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/session";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getHealthScore, getErrorStats24h, getRecentErrors, type ErrorCategory } from "@/lib/error-logger";
import { notFound } from "next/navigation";

// ============================================================
// Types
// ============================================================

type Status = "ok" | "warn" | "error";

interface CheckResult {
  label: string;
  status: Status;
  detail: string;
}

// ============================================================
// Checks
// ============================================================

async function checkEnvVars(): Promise<CheckResult[]> {
  const required: [string, string][] = [
    ["DATABASE_URL", "資料庫連線"],
    ["DIRECT_URL", "資料庫直連"],
    ["NEXTAUTH_SECRET", "NextAuth 密鑰"],
    ["NEXTAUTH_URL", "NextAuth URL"],
  ];

  const optional: [string, string][] = [
    ["LINE_CHANNEL_ACCESS_TOKEN", "LINE 推播 Token"],
    ["LINE_CHANNEL_SECRET", "LINE Channel Secret"],
    ["LINE_LOGIN_CHANNEL_ID", "LINE Login Channel ID"],
    ["LINE_LOGIN_CHANNEL_SECRET", "LINE Login Channel Secret"],
    ["GOOGLE_CLIENT_ID", "Google OAuth Client ID"],
    ["GOOGLE_CLIENT_SECRET", "Google OAuth Client Secret"],
    ["HEALTH_API_BASE_URL", "健康數據 API"],
  ];

  const results: CheckResult[] = [];

  for (const [key, label] of required) {
    const val = process.env[key];
    results.push({
      label: `${label} (${key})`,
      status: val ? "ok" : "error",
      detail: val ? "已設定" : "未設定（必要）",
    });
  }

  for (const [key, label] of optional) {
    const val = process.env[key];
    results.push({
      label: `${label} (${key})`,
      status: val ? "ok" : "warn",
      detail: val ? "已設定" : "未設定（選用）",
    });
  }

  return results;
}

async function checkDatabase(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    results.push({
      label: "資料庫連線",
      status: latency > 3000 ? "warn" : "ok",
      detail: `連線正常 (${latency}ms)`,
    });
  } catch (e) {
    results.push({
      label: "資料庫連線",
      status: "error",
      detail: `連線失敗: ${e instanceof Error ? e.message : String(e)}`,
    });
    return results;
  }

  // Store record
  try {
    const store = await prisma.store.findUnique({ where: { id: DEFAULT_STORE_ID } });
    results.push({
      label: "Store 記錄",
      status: store ? "ok" : "error",
      detail: store ? `${store.name} (${store.id})` : "找不到 Store 記錄",
    });
  } catch {
    results.push({ label: "Store 記錄", status: "error", detail: "查詢失敗" });
  }

  // ShopConfig
  try {
    const config = await prisma.shopConfig.findUnique({ where: { storeId: DEFAULT_STORE_ID } });
    results.push({
      label: "ShopConfig",
      status: config ? "ok" : "error",
      detail: config ? `方案: ${config.plan}, 排班: ${config.dutySchedulingEnabled ? "啟用" : "停用"}` : "找不到 ShopConfig",
    });
  } catch {
    results.push({ label: "ShopConfig", status: "error", detail: "查詢失敗" });
  }

  // Data counts
  try {
    const [users, staff, customers, bookings] = await Promise.all([
      prisma.user.count(),
      prisma.staff.count(),
      prisma.customer.count(),
      prisma.booking.count(),
    ]);
    results.push({
      label: "資料量概覽",
      status: "ok",
      detail: `使用者: ${users}, 員工: ${staff}, 顧客: ${customers}, 預約: ${bookings}`,
    });
  } catch {
    results.push({ label: "資料量概覽", status: "warn", detail: "查詢失敗" });
  }

  // Null storeId check
  try {
    const [nullCustomers, nullBookings, nullStaff] = await Promise.all([
      prisma.customer.count({ where: { storeId: { equals: null as unknown as string } } }),
      prisma.booking.count({ where: { storeId: { equals: null as unknown as string } } }),
      prisma.staff.count({ where: { storeId: { equals: null as unknown as string } } }),
    ]);
    const total = nullCustomers + nullBookings + nullStaff;
    results.push({
      label: "Null storeId 記錄",
      status: total > 0 ? "warn" : "ok",
      detail: total > 0
        ? `Customer: ${nullCustomers}, Booking: ${nullBookings}, Staff: ${nullStaff}`
        : "無 (正常)",
    });
  } catch {
    results.push({ label: "Null storeId 記錄", status: "warn", detail: "查詢失敗" });
  }

  return results;
}

async function checkExternalServices(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (lineToken) {
    try {
      const start = Date.now();
      const res = await fetch("https://api.line.me/v2/bot/info", {
        headers: { Authorization: `Bearer ${lineToken}` },
        signal: AbortSignal.timeout(5000),
      });
      const latency = Date.now() - start;
      results.push({
        label: "LINE Messaging API",
        status: res.ok ? "ok" : "warn",
        detail: res.ok ? `正常 (${latency}ms)` : `HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({
        label: "LINE Messaging API",
        status: "error",
        detail: `連線失敗: ${e instanceof Error ? e.message : "timeout"}`,
      });
    }
  } else {
    results.push({ label: "LINE Messaging API", status: "warn", detail: "未設定 Token（跳過）" });
  }

  const healthUrl = process.env.HEALTH_API_BASE_URL;
  if (healthUrl) {
    try {
      const start = Date.now();
      const res = await fetch(`${healthUrl}/health`, { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - start;
      results.push({
        label: "健康數據 API",
        status: res.ok ? "ok" : "warn",
        detail: res.ok ? `正常 (${latency}ms)` : `HTTP ${res.status}`,
      });
    } catch {
      results.push({ label: "健康數據 API", status: "warn", detail: "連線失敗或未啟用" });
    }
  } else {
    results.push({ label: "健康數據 API", status: "warn", detail: "未設定（跳過）" });
  }

  return results;
}

// ============================================================
// UI Components
// ============================================================

const STATUS_ICON: Record<Status, string> = { ok: "🟢", warn: "🟡", error: "🔴" };

function StatusRow({ result }: { result: CheckResult }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-earth-100 bg-white px-4 py-3">
      <span className="mt-0.5 text-sm">{STATUS_ICON[result.status]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-earth-800">{result.label}</p>
        <p className="text-xs text-earth-500 break-all">{result.detail}</p>
      </div>
    </div>
  );
}

function Section({ title, results }: { title: string; results: CheckResult[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-earth-700">{title}</h2>
      <div className="space-y-1.5">
        {results.map((r, i) => (
          <StatusRow key={i} result={r} />
        ))}
      </div>
    </section>
  );
}

function HealthScoreCard({
  score,
  dbLatency,
  totalErrors24h,
}: {
  score: number;
  dbLatency: number;
  totalErrors24h: number;
}) {
  const color =
    score >= 80 ? "text-green-600 border-green-200 bg-green-50" :
    score >= 50 ? "text-yellow-600 border-yellow-200 bg-yellow-50" :
    "text-red-600 border-red-200 bg-red-50";

  const label = score >= 80 ? "健康" : score >= 50 ? "注意" : "異常";

  return (
    <div className={`rounded-xl border-2 p-5 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium opacity-70">系統健康分數</p>
          <p className="text-4xl font-bold">{score}</p>
          <p className="text-sm font-medium">{label}</p>
        </div>
        <div className="space-y-2 text-right text-sm">
          <div>
            <p className="text-xs opacity-60">DB Latency</p>
            <p className="font-mono font-semibold">{dbLatency}ms</p>
          </div>
          <div>
            <p className="text-xs opacity-60">24h 錯誤</p>
            <p className="font-mono font-semibold">{totalErrors24h}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  DB_CONNECTION: "DB 連線",
  STORE_MISSING: "StoreId 遺失",
  ENV_MISSING: "環境變數缺失",
  EXTERNAL_API: "外部 API",
  PERMISSION: "權限",
  AUTH: "認證",
  FK_VIOLATION: "FK 違反",
  MISSING_FIELD: "欄位缺失",
  UNIQUE_VIOLATION: "唯一值衝突",
  UNKNOWN: "未分類",
};

const CATEGORY_COLORS: Record<string, string> = {
  DB_CONNECTION: "bg-red-100 text-red-700",
  STORE_MISSING: "bg-orange-100 text-orange-700",
  ENV_MISSING: "bg-yellow-100 text-yellow-700",
  EXTERNAL_API: "bg-purple-100 text-purple-700",
  PERMISSION: "bg-blue-100 text-blue-700",
  AUTH: "bg-indigo-100 text-indigo-700",
  FK_VIOLATION: "bg-pink-100 text-pink-700",
  MISSING_FIELD: "bg-amber-100 text-amber-700",
  UNIQUE_VIOLATION: "bg-teal-100 text-teal-700",
  UNKNOWN: "bg-gray-100 text-gray-700",
};

function ErrorStatsGrid({ stats }: { stats: Record<ErrorCategory, number> }) {
  const entries = Object.entries(stats).filter(([, count]) => count > 0);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-earth-100 bg-white px-4 py-6 text-center">
        <p className="text-sm text-earth-400">過去 24 小時無錯誤記錄</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {entries.map(([cat, count]) => (
        <div
          key={cat}
          className={`rounded-lg px-3 py-2.5 ${CATEGORY_COLORS[cat] ?? "bg-gray-100 text-gray-700"}`}
        >
          <p className="text-xs font-medium opacity-70">{CATEGORY_LABELS[cat] ?? cat}</p>
          <p className="text-xl font-bold">{count}</p>
        </div>
      ))}
    </div>
  );
}

function RecentErrorsList({
  errors,
}: {
  errors: {
    id: string;
    category: string;
    message: string;
    userId: string | null;
    storeId: string | null;
    createdAt: Date;
  }[];
}) {
  if (errors.length === 0) {
    return (
      <div className="rounded-lg border border-earth-100 bg-white px-4 py-6 text-center">
        <p className="text-sm text-earth-400">無最近錯誤記錄</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {errors.map((err) => (
        <div
          key={err.id}
          className="rounded-lg border border-earth-100 bg-white px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                CATEGORY_COLORS[err.category] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {CATEGORY_LABELS[err.category] ?? err.category}
            </span>
            <span className="text-[10px] text-earth-400 font-mono">
              {err.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
            </span>
          </div>
          <p className="text-xs text-earth-700 break-all line-clamp-2">
            {err.message}
          </p>
          {(err.userId || err.storeId) && (
            <p className="mt-1 text-[10px] text-earth-400 font-mono">
              {err.userId && `user: ${err.userId.substring(0, 12)}...`}
              {err.userId && err.storeId && " | "}
              {err.storeId && `store: ${err.storeId}`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default async function SystemStatusPage() {
  const user = await requireAdminSession().catch(() => null);
  if (!user) notFound();

  const [envResults, dbResults, extResults, healthScore, errorStats, recentErrors] =
    await Promise.all([
      checkEnvVars(),
      checkDatabase(),
      checkExternalServices(),
      getHealthScore(),
      getErrorStats24h(),
      getRecentErrors(15),
    ]);

  const allResults = [...envResults, ...dbResults, ...extResults];
  const errorCount = allResults.filter((r) => r.status === "error").length;
  const warnCount = allResults.filter((r) => r.status === "warn").length;

  const overallStatus: Status = errorCount > 0 ? "error" : warnCount > 0 ? "warn" : "ok";
  const overallLabel =
    overallStatus === "ok" ? "系統正常" : overallStatus === "warn" ? "部分警告" : "有錯誤需處理";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{STATUS_ICON[overallStatus]}</span>
        <div>
          <h1 className="text-lg font-bold text-earth-900">系統狀態</h1>
          <p className="text-sm text-earth-500">
            {overallLabel} — {allResults.length} 項檢查, {errorCount} 錯誤, {warnCount} 警告
          </p>
        </div>
      </div>

      {/* Health Score */}
      <HealthScoreCard
        score={healthScore.score}
        dbLatency={healthScore.dbLatency}
        totalErrors24h={healthScore.totalErrors24h}
      />

      {/* Error Stats */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-earth-700">錯誤統計（最近 24 小時）</h2>
        <ErrorStatsGrid stats={errorStats} />
      </section>

      {/* Recent Errors */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-earth-700">最近錯誤</h2>
        <RecentErrorsList errors={recentErrors} />
      </section>

      {/* System Checks */}
      <Section title="環境變數" results={envResults} />
      <Section title="資料庫" results={dbResults} />
      <Section title="外部服務" results={extResults} />

      <p className="text-xs text-earth-400 text-center">
        檢查時間: {new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
      </p>
    </div>
  );
}
