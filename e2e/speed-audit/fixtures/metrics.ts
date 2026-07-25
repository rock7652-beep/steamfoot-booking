/**
 * Speed Audit v1 — 量測與安全護欄
 *
 * 提供：
 *   - installObservers：收集 console error / 5xx / RSC 請求數 / 被擋的 mutation
 *   - installMutationGuard：全域 abort 所有非 GET 請求（read-only 最硬防線）
 *   - measure* 系列：量「點擊→第一個 UI 反應」「導航首屏」「搜尋回應」
 *   - runStep：包裝一個步驟，算出 verdict 並 attach 給 reporter（report.ts）
 *
 * 設計原則：helper 只回傳資料與判定，不直接印報告（報告統一由 report.ts 出）。
 */

import type { Page, TestInfo } from "@playwright/test";
import {
  THRESHOLDS,
  verdictForDurationMs,
  worstVerdict,
  type Verdict,
} from "./thresholds";

export type StepVerdict = Verdict | "skip";

export interface StepMetric {
  suite: string;
  step: string;
  /** 點擊/導航後到第一個 UI 反應（ms）；skip 或無法量測時為 null */
  firstReactionMs: number | null;
  detail: string;
  /** 本步驟期間新增的背景 RSC 請求數 */
  rscCount: number;
  /** 本步驟期間的 console error 數（已濾掉護欄 abort 噪音） */
  consoleErrors: number;
  /** 本步驟期間的 5xx / unexpected response 數 */
  badResponses: number;
  /** 本步驟期間被護欄擋下的 mutation 請求數（觀測用，不算失敗） */
  blocked: number;
  verdict: StepVerdict;
  note?: string;
}

export interface Observers {
  consoleErrors: string[];
  badResponses: { url: string; status: number }[];
  blockedRequests: { url: string; method: string }[];
  rscRequests: string[];
  exportRequests: string[];
}

/**
 * 護欄 abort 造成的網路錯誤噪音。這些是我們「故意」擋下 mutation 的副作用，
 * 不應被當成真正的 app console error → fail。
 */
const GUARD_NOISE =
  /failed to fetch|load failed|net::err|err_aborted|err_failed|blockedbyclient|operation was aborted|networkerror|fetch failed/i;

function isGuardNoise(text: string): boolean {
  return GUARD_NOISE.test(text);
}

function isRscRequest(url: string, headers: Record<string, string>): boolean {
  return url.includes("_rsc=") || headers["rsc"] === "1" || headers["next-router-prefetch"] === "1";
}

export function installObservers(page: Page): Observers {
  const obs: Observers = {
    consoleErrors: [],
    badResponses: [],
    blockedRequests: [],
    rscRequests: [],
    exportRequests: [],
  };

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isGuardNoise(text)) return;
    obs.consoleErrors.push(text);
  });
  page.on("pageerror", (err) => {
    if (isGuardNoise(err.message)) return;
    obs.consoleErrors.push(err.message);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) {
      obs.badResponses.push({ url: res.url(), status: res.status() });
    }
  });
  page.on("request", (req) => {
    const url = req.url();
    if (isRscRequest(url, req.headers())) obs.rscRequests.push(url);
    if (url.includes("/api/export/")) obs.exportRequests.push(url);
  });

  return obs;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 被擋下的 mutation 在 abort 前先 hold 一段時間，讓送出按鈕的 loading/disabled
 * 狀態「可被觀測」（否則 abort 太快、按鈕 disabled 視窗可能 <16ms 而抓不到）。
 * 只影響被擋的 mutation；GET 量測完全不受此延遲影響。
 */
const BLOCK_HOLD_MS = 600;

/**
 * 全域 mutation 護欄：abort 所有非 GET 請求。
 *
 * Speed Audit v1 只能 read-only — 完成預約 / 未到 / 取消 / 收款 / 指派方案 / 匯出
 * 等都不可真的送出。所有 server action（POST）、PUT/PATCH/DELETE 一律在網路層 abort，
 * 即使測試誤觸按鈕也不會送達後端。GET 查詢（搜尋、RSC、靜態資源）放行。
 *
 * 注意：登入流程（hqLoginAction，POST）發生在 setup 專案、且在裝護欄「之前」，
 * 故不受影響；audit 專案載入時已帶 storageState，不需再登入。
 *
 * 取捨：由 server action（POST）回資料的 Drawer 內容（顧客詳情 / 預約詳情）會被一併
 * 擋下，故 v1 只量「Drawer 開啟 + skeleton 立即出現」，不量內容載入完成時間。
 */
export async function installMutationGuard(page: Page, obs: Observers): Promise<void> {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (SAFE_METHODS.has(req.method())) return route.continue();
    obs.blockedRequests.push({ url: req.url(), method: req.method() });
    // hold 一下再 abort，讓 loading 狀態可被觀測，再保證請求不落地。
    await new Promise((r) => setTimeout(r, BLOCK_HOLD_MS));
    return route.abort("blockedbyclient");
  });
}

function snapshot(obs: Observers) {
  return {
    rsc: obs.rscRequests.length,
    err: obs.consoleErrors.length,
    bad: obs.badResponses.length,
    blk: obs.blockedRequests.length,
  };
}

// ── 量測 primitives ────────────────────────────────────────────────

/** 量導航首屏：goto → domcontentloaded（含 loading.tsx / 首屏內容）。 */
export async function measureNavigation(page: Page, url: string): Promise<number> {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return Date.now() - t0;
}

/** 量「執行 action → 某 selector 可見」的時間（drawer 開啟、skeleton 出現等）。 */
export async function measureUntilVisible(
  page: Page,
  action: () => Promise<void>,
  selector: string,
  timeout = 15_000,
): Promise<number> {
  const t0 = Date.now();
  await action();
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
  return Date.now() - t0;
}

/** 量「執行 action → 命中某網路回應」的時間（搜尋 API 回應等）。 */
export async function measureUntilResponse(
  page: Page,
  action: () => Promise<void>,
  urlPattern: RegExp,
  timeout = 15_000,
): Promise<number> {
  const t0 = Date.now();
  await Promise.all([
    page.waitForResponse(urlPattern, { timeout }),
    action(),
  ]);
  return Date.now() - t0;
}

/** 量「執行 action → URL 變成符合 regex」的時間（列表搜尋 server 導航等）。 */
export async function measureUntilUrl(
  page: Page,
  action: () => Promise<void>,
  urlPattern: RegExp,
  timeout = 15_000,
): Promise<number> {
  const t0 = Date.now();
  await action();
  await page.waitForURL(urlPattern, { timeout });
  return Date.now() - t0;
}

// ── 步驟包裝 ────────────────────────────────────────────────────────

export interface StepResult {
  firstReactionMs: number | null;
  detail: string;
  /** 額外判定（例：按鈕未進入 loading → fail） */
  extraVerdict?: Verdict;
  note?: string;
  /** 此步驟無法執行（例：staging 當日無預約）→ 記為 skip，不算 pass/fail */
  skipped?: boolean;
}

/**
 * 執行一個步驟並記錄 metric。
 * - 量測期間以 observer delta 計算 RSC / console error / 5xx
 * - 依時間 + RSC + error + 額外判定算出 verdict
 * - 把 metric attach 給 reporter（report.ts 統一輸出）
 */
export async function runStep(
  testInfo: TestInfo,
  obs: Observers,
  opts: { suite: string; step: string; run: () => Promise<StepResult> },
): Promise<void> {
  const before = snapshot(obs);
  let result: StepResult;
  try {
    result = await opts.run();
  } catch (e) {
    result = {
      firstReactionMs: null,
      detail: `執行錯誤：${e instanceof Error ? e.message : String(e)}`,
      extraVerdict: "fail",
      note: "step threw",
    };
  }
  const after = snapshot(obs);

  const rscCount = after.rsc - before.rsc;
  const consoleErrors = after.err - before.err;
  const badResponses = after.bad - before.bad;
  const blocked = after.blk - before.blk;

  let verdict: StepVerdict;
  if (result.skipped) {
    verdict = "skip";
  } else {
    const verdicts: Verdict[] = [];
    if (result.firstReactionMs != null) verdicts.push(verdictForDurationMs(result.firstReactionMs));
    if (rscCount > THRESHOLDS.rscWarnCount) verdicts.push("warn");
    if (consoleErrors > 0) verdicts.push("fail");
    if (badResponses > 0) verdicts.push("fail");
    if (result.extraVerdict) verdicts.push(result.extraVerdict);
    verdict = worstVerdict(verdicts.length ? verdicts : ["pass"]);
  }

  const metric: StepMetric = {
    suite: opts.suite,
    step: opts.step,
    firstReactionMs: result.firstReactionMs,
    detail: result.detail,
    rscCount,
    consoleErrors,
    badResponses,
    blocked,
    verdict,
    note: result.note,
  };

  await testInfo.attach("speed-metric", {
    body: JSON.stringify(metric),
    contentType: "application/json",
  });
}
