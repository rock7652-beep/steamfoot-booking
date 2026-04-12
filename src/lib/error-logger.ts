/**
 * 結構化錯誤日誌 — 寫入 ErrorLog 表
 *
 * 用於 server actions / API routes 的錯誤追蹤。
 * 非同步寫入（fire-and-forget），不阻塞業務邏輯。
 */

import { prisma } from "@/lib/db";

export type ErrorCategory =
  | "DB_CONNECTION"
  | "STORE_MISSING"
  | "ENV_MISSING"
  | "EXTERNAL_API"
  | "PERMISSION"
  | "AUTH"
  | "FK_VIOLATION"
  | "MISSING_FIELD"
  | "UNIQUE_VIOLATION"
  | "UNKNOWN";

interface LogErrorInput {
  category: ErrorCategory;
  message: string;
  userId?: string | null;
  storeId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * 寫入結構化錯誤日誌（fire-and-forget）
 * 寫入失敗時 fallback 到 console.error，不會拋出例外
 */
export function logError(input: LogErrorInput): void {
  const { category, message, userId, storeId, metadata } = input;

  // 同時保留 console.error 以便 Vercel 日誌可見
  console.error(`[ErrorLog][${category}]`, message, metadata ?? "");

  // Fire-and-forget DB write
  prisma.errorLog
    .create({
      data: {
        category,
        message: message.substring(0, 2000), // 限制長度
        userId: userId ?? null,
        storeId: storeId ?? null,
        metadata: metadata ? (metadata as Record<string, string>) : undefined,
      },
    })
    .catch((dbErr) => {
      // DB write failed — only log to console, never throw
      console.error("[ErrorLog] Failed to write to DB:", dbErr);
    });
}

/**
 * 從錯誤訊息推斷分類
 */
export function categorizeError(msg: string): ErrorCategory {
  if (msg.includes("缺少 storeId") || msg.includes("Missing storeId")) return "STORE_MISSING";
  if (msg.includes("FORBIDDEN") || msg.includes("權限不足") || msg.includes("無權")) return "PERMISSION";
  if (msg.includes("UNAUTHORIZED") || msg.includes("請先登入")) return "AUTH";
  if (msg.includes("Null constraint")) return "MISSING_FIELD";
  if (msg.includes("Foreign key constraint") || msg.includes("violates foreign key")) return "FK_VIOLATION";
  if (msg.includes("Unique constraint")) return "UNIQUE_VIOLATION";
  if (msg.includes("connect") && (msg.includes("ECONNREFUSED") || msg.includes("timed out") || msg.includes("pool"))) return "DB_CONNECTION";
  if (msg.includes("env") || msg.includes("NEXT_PUBLIC_") || msg.includes("Missing environment")) return "ENV_MISSING";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("api.line.me")) return "EXTERNAL_API";
  return "UNKNOWN";
}

// ============================================================
// 查詢 API — 供 system-status 頁面使用
// ============================================================

/** 最近 24 小時各分類錯誤數 */
export async function getErrorStats24h(): Promise<Record<ErrorCategory, number>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await prisma.errorLog.groupBy({
    by: ["category"],
    where: { createdAt: { gte: since } },
    _count: { id: true },
  });

  const stats: Record<string, number> = {
    DB_CONNECTION: 0,
    STORE_MISSING: 0,
    ENV_MISSING: 0,
    EXTERNAL_API: 0,
    PERMISSION: 0,
    AUTH: 0,
    FK_VIOLATION: 0,
    MISSING_FIELD: 0,
    UNIQUE_VIOLATION: 0,
    UNKNOWN: 0,
  };

  for (const row of rows) {
    stats[row.category] = row._count.id;
  }

  return stats as Record<ErrorCategory, number>;
}

/** 最近 N 筆錯誤 */
export async function getRecentErrors(limit = 20) {
  return prisma.errorLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      category: true,
      message: true,
      userId: true,
      storeId: true,
      createdAt: true,
    },
  });
}

/** 系統健康分數計算（0-100） */
export async function getHealthScore(): Promise<{
  score: number;
  dbLatency: number;
  errorRate24h: number;
  totalErrors24h: number;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // DB latency（5 次 ping 取平均）
  const latencies: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    latencies.push(Date.now() - start);
  }
  const dbLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  // 錯誤總數
  const totalErrors24h = await prisma.errorLog.count({
    where: { createdAt: { gte: since } },
  });

  // 分數計算：
  // - DB latency: <100ms=40分, <500ms=30分, <1000ms=20分, >1000ms=10分
  // - 錯誤數: 0=60分, 1-5=50分, 6-20=30分, >20=10分
  let latencyScore = 40;
  if (dbLatency > 1000) latencyScore = 10;
  else if (dbLatency > 500) latencyScore = 20;
  else if (dbLatency > 100) latencyScore = 30;

  let errorScore = 60;
  if (totalErrors24h > 20) errorScore = 10;
  else if (totalErrors24h > 5) errorScore = 30;
  else if (totalErrors24h > 0) errorScore = 50;

  const score = latencyScore + errorScore;

  return {
    score,
    dbLatency,
    errorRate24h: totalErrors24h,
    totalErrors24h,
  };
}
