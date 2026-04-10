/**
 * 輕量級 Server Timing 工具
 *
 * 用於記錄頁面載入耗時、查詢耗時、快取命中率，
 * 結果以結構化 JSON 輸出到 stdout（[PERF] 前綴）。
 *
 * 使用方式：
 *   const timer = new ServerTiming("/dashboard/duty");
 *   const data = await withTiming("getDutyByWeek", timer, () => getDutyByWeek(...));
 *   timer.cacheStatus("business-hours", "hit");
 *   timer.finish();
 */

import { getSla } from "@/lib/sla";

type CacheStatus = "hit" | "miss";

interface Span {
  name: string;
  durationMs: number;
}

interface PerfLog {
  page: string;
  totalMs: number;
  spans: Span[];
  cache: Record<string, CacheStatus>;
  queryCount: number;
  timestamp: string;
}

export class ServerTiming {
  private t0: number;
  private page: string;
  private spans: Span[] = [];
  private cacheMap: Record<string, CacheStatus> = {};

  constructor(page: string) {
    this.page = page;
    this.t0 = performance.now();
  }

  /** 記錄一個已完成的 span（手動傳入 durationMs） */
  record(name: string, durationMs: number) {
    this.spans.push({ name, durationMs: Math.round(durationMs * 100) / 100 });
  }

  /** 記錄快取命中狀態 */
  cacheStatus(tag: string, status: CacheStatus) {
    this.cacheMap[tag] = status;
  }

  /** 取得總耗時（ms） */
  get totalMs(): number {
    return Math.round(performance.now() - this.t0);
  }

  /** 結束計時並輸出結構化日誌（含 SLA breach 偵測） */
  finish(): PerfLog {
    const log: PerfLog = {
      page: this.page,
      totalMs: this.totalMs,
      spans: this.spans,
      cache: this.cacheMap,
      queryCount: this.spans.length,
      timestamp: new Date().toISOString(),
    };
    console.log(`[PERF] ${JSON.stringify(log)}`);

    const sla = getSla(this.page);
    if (sla && log.totalMs > sla.targetMs) {
      console.warn(
        `[PERF:SLA_BREACH] ${this.page} took ${log.totalMs}ms (target: ${sla.targetMs}ms, tier: ${sla.tier})`,
      );
    }
    return log;
  }
}

/**
 * 包裝一個 async 函式，自動記錄耗時
 *
 * @example
 *   const rows = await withTiming("getCachedBusinessHours", timer, () => getCachedBusinessHours());
 */
export async function withTiming<T>(
  name: string,
  timer: ServerTiming | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!timer) return fn();
  const t0 = performance.now();
  try {
    const result = await fn();
    const ms = performance.now() - t0;
    timer.record(name, ms);
    // 快取命中推測：unstable_cache 命中時通常 < 10ms（dev mode 含 Turbopack overhead）
    if (ms < 10) {
      timer.cacheStatus(name, "hit");
    }
    return result;
  } catch (error) {
    const ms = performance.now() - t0;
    timer.record(name, ms);
    console.error(
      `[PERF:ERROR] ${JSON.stringify({
        query: name,
        durationMs: Math.round(ms),
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })}`,
    );
    throw error;
  }
}
