import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getHealthScore, getErrorStats24h, getRecentErrors, type ErrorCategory } from "@/lib/error-logger";
import { notFound } from "next/navigation";

// ============================================================
// Types
// ============================================================

type Status = "ok" | "attention" | "inactive" | "error";

interface CheckResult {
  label: string;
  status: Status;
  detail: string;
}

// ============================================================
// Checks — 分三層：核心營運 / 進階模組 / 總部監控
// ============================================================

async function checkCoreOperations(): Promise<{ results: CheckResult[]; dbLatency: number }> {
  const results: CheckResult[] = [];
  let dbLatency = 0;

  // 1. 資料庫連線
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;
    results.push({
      label: "資料庫",
      status: dbLatency > 3000 ? "attention" : "ok",
      detail: dbLatency > 3000 ? `回應較慢（${dbLatency}ms）` : `連線正常（${dbLatency}ms）`,
    });
  } catch {
    dbLatency = Date.now() - start;
    results.push({ label: "資料庫", status: "error", detail: "資料庫連線異常，營運功能可能受影響" });
    return { results, dbLatency };
  }

  // 2. 預約系統
  try {
    const bookingCount = await prisma.booking.count();
    results.push({ label: "預約系統", status: "ok", detail: `運作正常，累計 ${bookingCount.toLocaleString()} 筆預約` });
  } catch {
    results.push({ label: "預約系統", status: "error", detail: "預約資料查詢異常" });
  }

  // 3. 顧客資料
  try {
    const customerCount = await prisma.customer.count();
    results.push({ label: "顧客資料", status: "ok", detail: `運作正常，共 ${customerCount.toLocaleString()} 位顧客` });
  } catch {
    results.push({ label: "顧客資料", status: "error", detail: "顧客資料查詢異常" });
  }

  // 4. 交易紀錄
  try {
    const txCount = await prisma.transaction.count();
    results.push({ label: "交易紀錄", status: "ok", detail: `運作正常，累計 ${txCount.toLocaleString()} 筆交易` });
  } catch {
    results.push({ label: "交易紀錄", status: "error", detail: "交易資料查詢異常" });
  }

  // 5. LINE 通知
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (lineToken) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/info", {
        headers: { Authorization: `Bearer ${lineToken}` },
        signal: AbortSignal.timeout(5000),
      });
      results.push({
        label: "LINE 通知",
        status: res.ok ? "ok" : "attention",
        detail: res.ok ? "LINE 推播服務正常" : "LINE 服務回應異常，通知可能延遲",
      });
    } catch {
      results.push({ label: "LINE 通知", status: "attention", detail: "LINE 服務暫時無法連線，通知可能延遲" });
    }
  } else {
    results.push({ label: "LINE 通知", status: "inactive", detail: "LINE 推播尚未設定，不影響預約與營運" });
  }

  return { results, dbLatency };
}

async function checkAdvancedModules(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 健康數據 API
  const healthUrl = process.env.HEALTH_API_BASE_URL;
  if (healthUrl) {
    try {
      const res = await fetch(`${healthUrl}/health`, { signal: AbortSignal.timeout(5000) });
      results.push({
        label: "健康分析模組",
        status: res.ok ? "ok" : "attention",
        detail: res.ok ? "健康分析 API 正常運作" : "健康分析 API 回應異常",
      });
    } catch {
      results.push({ label: "健康分析模組", status: "attention", detail: "健康分析 API 暫時無法連線" });
    }
  } else {
    results.push({ label: "健康分析模組", status: "inactive", detail: "未啟用，此為進階功能，不影響日常營運" });
  }

  // AI 健康分析
  const healthApiKey = process.env.HEALTH_API_KEY;
  if (healthApiKey) {
    results.push({ label: "AI 健康分析", status: "ok", detail: "AI 分析服務已啟用" });
  } else {
    results.push({ label: "AI 健康分析", status: "inactive", detail: "未啟用，此為選配功能" });
  }

  // Google OAuth
  const googleId = process.env.GOOGLE_CLIENT_ID;
  if (googleId) {
    results.push({ label: "Google 登入", status: "ok", detail: "Google OAuth 已設定" });
  } else {
    results.push({ label: "Google 登入", status: "inactive", detail: "未啟用，顧客可透過其他方式登入" });
  }

  return results;
}

// ============================================================
// UI Components
// ============================================================

const STATUS_CONFIG: Record<Status, { icon: React.ReactNode; bg: string; border: string; text: string }> = {
  ok: {
    icon: <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>,
    bg: "bg-green-50", border: "border-green-200", text: "text-green-700",
  },
  attention: {
    icon: <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>,
    bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700",
  },
  inactive: {
    icon: <svg className="h-4 w-4 text-earth-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>,
    bg: "bg-earth-50", border: "border-earth-200", text: "text-earth-500",
  },
  error: {
    icon: <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" /></svg>,
    bg: "bg-red-50", border: "border-red-200", text: "text-red-700",
  },
};

function StatusRow({ result }: { result: CheckResult }) {
  const cfg = STATUS_CONFIG[result.status];
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${cfg.border} ${cfg.bg}`}>
      <div className="shrink-0">{cfg.icon}</div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${cfg.text}`}>{result.label}</p>
        <p className="text-xs text-earth-500">{result.detail}</p>
      </div>
    </div>
  );
}

function OverviewCard({
  coreOk,
  coreTotal,
  dbLatency,
  totalErrors24h,
}: {
  coreOk: number;
  coreTotal: number;
  dbLatency: number;
  totalErrors24h: number;
}) {
  const allOk = coreOk === coreTotal;
  const hasError = coreOk < coreTotal - 1; // 容許 1 項非 ok（如 LINE 未設定）

  const statusLabel = allOk ? "正常運作" : hasError ? "需進一步處理" : "需留意";
  const statusColor = allOk
    ? "border-green-200 bg-gradient-to-br from-green-50 to-emerald-50"
    : hasError
    ? "border-red-200 bg-gradient-to-br from-red-50 to-orange-50"
    : "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50";
  const statusTextColor = allOk ? "text-green-700" : hasError ? "text-red-700" : "text-amber-700";
  const statusIcon = allOk
    ? <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    : hasError
    ? <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" /></svg>
    : <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>;

  return (
    <div className={`rounded-xl border-2 p-5 ${statusColor}`}>
      <div className="flex items-start gap-4">
        <div className="shrink-0">{statusIcon}</div>
        <div className="flex-1">
          <p className={`text-lg font-bold ${statusTextColor}`}>平台狀態：{statusLabel}</p>
          <p className="mt-1 text-sm text-earth-600">
            核心功能 {coreOk}/{coreTotal} 項正常
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-white/60 px-3 py-2">
          <p className="text-[10px] text-earth-500">資料庫回應</p>
          <p className="text-base font-bold text-earth-800">{dbLatency}ms</p>
          <p className="text-[10px] text-earth-400">{dbLatency < 200 ? "非常快" : dbLatency < 1000 ? "正常" : "較慢"}</p>
        </div>
        <div className="rounded-lg bg-white/60 px-3 py-2">
          <p className="text-[10px] text-earth-500">24 小時警示</p>
          <p className="text-base font-bold text-earth-800">{totalErrors24h}</p>
          <p className="text-[10px] text-earth-400">{totalErrors24h === 0 ? "無異常" : "筆系統記錄"}</p>
        </div>
      </div>
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
    createdAt: Date;
  }[];
}) {
  if (errors.length === 0) {
    return (
      <div className="rounded-lg border border-earth-200 bg-white px-4 py-6 text-center">
        <p className="text-sm text-earth-400">過去 24 小時無系統警示</p>
      </div>
    );
  }

  const FRIENDLY_CATEGORY: Record<string, string> = {
    DB_CONNECTION: "資料庫連線",
    STORE_MISSING: "店舖資訊",
    ENV_MISSING: "系統設定",
    EXTERNAL_API: "外部服務",
    PERMISSION: "權限",
    AUTH: "登入驗證",
    FK_VIOLATION: "資料關聯",
    MISSING_FIELD: "資料欄位",
    UNIQUE_VIOLATION: "資料重複",
    UNKNOWN: "其他",
  };

  return (
    <div className="space-y-1.5">
      {errors.slice(0, 10).map((err) => (
        <div key={err.id} className="rounded-lg border border-earth-100 bg-white px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-600">
              {FRIENDLY_CATEGORY[err.category] ?? err.category}
            </span>
            <span className="text-[10px] text-earth-400">
              {err.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-1 text-xs text-earth-600 line-clamp-1">{friendlyMessage(err.message)}</p>
        </div>
      ))}
    </div>
  );
}

/** 將技術訊息轉為白話 */
function friendlyMessage(msg: string): string {
  if (msg.includes("connect") || msg.includes("ECONNREFUSED")) return "資料庫連線暫時中斷";
  if (msg.includes("storeId") || msg.includes("STORE_MISSING")) return "店舖資訊不完整";
  if (msg.includes("Null constraint")) return "部分資料欄位缺失";
  if (msg.includes("Foreign key")) return "相關資料不存在";
  if (msg.includes("Unique constraint")) return "資料重複衝突";
  if (msg.includes("UNAUTHORIZED") || msg.includes("登入")) return "登入驗證異常";
  if (msg.includes("FORBIDDEN") || msg.includes("權限")) return "權限不足操作";
  if (msg.includes("timeout") || msg.includes("Timeout")) return "外部服務回應逾時";
  return msg.length > 60 ? msg.slice(0, 57) + "..." : msg;
}

// ============================================================
// Page
// ============================================================

export default async function SystemStatusPage() {
  const user = await requireStaffSession().catch(() => null);
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER")) notFound();

  const [{ results: coreResults, dbLatency }, advancedResults, healthScore, errorStats, recentErrors] =
    await Promise.all([
      checkCoreOperations(),
      checkAdvancedModules(),
      getHealthScore(),
      getErrorStats24h(),
      getRecentErrors(10),
    ]);

  // 核心營運中，只計算 ok 和 error（inactive 不算扣分）
  const coreOkCount = coreResults.filter((r) => r.status === "ok").length;
  const coreScoredCount = coreResults.filter((r) => r.status !== "inactive").length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-earth-900">營運健康中心</h1>
        <p className="mt-0.5 text-sm text-earth-500">
          即時監控核心營運功能，確保平台穩定運作
        </p>
      </div>

      {/* Overview Card */}
      <OverviewCard
        coreOk={coreOkCount}
        coreTotal={coreScoredCount}
        dbLatency={dbLatency}
        totalErrors24h={healthScore.totalErrors24h}
      />

      {/* 核心營運 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-earth-800">核心營運</h2>
        <p className="text-xs text-earth-400">預約、顧客、交易、通知等核心功能狀態</p>
        <div className="space-y-1.5">
          {coreResults.map((r, i) => (
            <StatusRow key={i} result={r} />
          ))}
        </div>
      </section>

      {/* 進階模組 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-earth-800">進階模組</h2>
        <p className="text-xs text-earth-400">選配功能，未啟用不影響日常營運</p>
        <div className="space-y-1.5">
          {advancedResults.map((r, i) => (
            <StatusRow key={i} result={r} />
          ))}
        </div>
      </section>

      {/* 總部監控 */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-earth-800">系統監控紀錄</h2>
        <p className="text-xs text-earth-400">最近 24 小時的系統異常記錄</p>
        <RecentErrorsList errors={recentErrors} />
      </section>

      <p className="text-[10px] text-earth-300 text-center">
        檢查時間：{new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
      </p>
    </div>
  );
}
