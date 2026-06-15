/**
 * Speed Audit v1 — 速度門檻（單一來源）
 *
 * 這裡是 client 端「感知延遲」門檻，刻意與 server 端 src/lib/sla.ts
 * （量 SSR render 時間）分開：一個量使用者感覺、一個量伺服器耗時。
 *
 * v1 為「報告制」，不是 CI hard gate：verdict 只反映在文字報告，
 * 不讓 playwright 退出碼變成阻擋。
 */

export type Verdict = "pass" | "warn" | "fail";

export const THRESHOLDS = {
  /** 頁面進入：1 秒內要有畫面或 loading（超過記為 warn 提示） */
  pageEnterMs: 1000,
  /** Drawer 開啟：0.5 秒內要有反應 */
  drawerOpenMs: 500,
  /** 顧客搜尋：0.5–1 秒內要有結果或 loading */
  searchMs: 1000,
  /** 單一步驟通用 warn 線：超過 2 秒 */
  stepWarnMs: 2000,
  /** 單一步驟 fail 線：超過 5 秒 */
  stepFailMs: 5000,
  /** 背景 RSC 請求數 warn 線：超過 10 筆 */
  rscWarnCount: 10,
} as const;

/**
 * 依「單一步驟總時」給 verdict：>5s fail、>2s warn、其餘 pass。
 * 這是時間類指標的通用判定。個別更嚴格的軟門檻（drawer 0.5s、search 1s）
 * 只降級成 warn，不會升級成 fail（v1 不想把「稍慢」變成紅燈）。
 */
export function verdictForDurationMs(ms: number): Verdict {
  if (ms > THRESHOLDS.stepFailMs) return "fail";
  if (ms > THRESHOLDS.stepWarnMs) return "warn";
  return "pass";
}

/** 合併多個 verdict，取最嚴重者（fail > warn > pass）。 */
export function worstVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("warn")) return "warn";
  return "pass";
}
