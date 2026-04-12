/**
 * 外部服務防炸標準（External Service Resilience）
 *
 * 統一的外部 API 安全呼叫 wrapper。
 * 外部 API 失敗時回傳 fallback 值，不 throw，不讓整頁 SSR crash。
 *
 * 適用：Health API、LINE API、第三方服務
 * 不適用：DB 查詢（可進 error boundary）、權限錯誤（應 throw）
 */

import { logError } from "@/lib/error-logger";

interface SafeApiOptions<T> {
  /** 呼叫識別名稱，e.g. "health.getSummary" */
  name: string;
  /** 實際呼叫的 async function */
  fn: () => Promise<T>;
  /** 失敗時回傳的預設值 */
  fallback: T;
  /** 日誌上下文 */
  context?: {
    userId?: string | null;
    storeId?: string | null;
    customerId?: string | null;
  };
}

export async function safeApi<T>({
  name,
  fn,
  fallback,
  context,
}: SafeApiOptions<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.substring(0, 500) : undefined;

    logError({
      category: "EXTERNAL_API",
      message: `${name} failed: ${message}`,
      userId: context?.userId ?? null,
      storeId: context?.storeId ?? null,
      metadata: {
        serviceName: name,
        error: message,
        ...(stack ? { stack } : {}),
        ...(context?.customerId ? { customerId: context.customerId } : {}),
      },
    });

    return fallback;
  }
}
