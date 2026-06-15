/**
 * Speed Audit v1 — A. 預約管理 速度巡檢（全程 read-only）
 *
 * 涵蓋：進入 /dashboard/bookings → 點日期開當日 Drawer → 新增預約入口 →
 *       顧客搜尋 → 新增補課入口 → 體驗預約 Drawer →
 *       完成 / 未到 / 取消 按鈕「是否立即 loading / 可用」（不送出）。
 *
 * 安全：全域 mutation 護欄 abort 所有非 GET；任何 confirm/alert 一律 dismiss。
 *       資料相依步驟（當日需有預約）取不到時記為 skip，不 hard-fail。
 */

import { test } from "@playwright/test";
import {
  installObservers,
  installMutationGuard,
  measureNavigation,
  measureUntilVisible,
  measureUntilResponse,
  runStep,
} from "./fixtures/metrics";

const SUITE = "A. 預約管理 (bookings)";

const DAY_SHEET_TITLE = "#day-detail-sheet-title"; // 當日預約 Drawer 標題（bookings-manager）
const BOOKING_SEARCH_INPUT = 'input[placeholder^="搜尋姓名"]'; // /bookings/new 顧客搜尋（customer-search）
const SEARCH_API = /\/api\/customers\/search/;
const SEARCH_QUERY = process.env.SPEED_AUDIT_SEARCH_QUERY ?? "測試"; // ≥2 字觸發搜尋

test("A. 預約管理 速度巡檢", async ({ page }, testInfo) => {
  const obs = installObservers(page);
  await installMutationGuard(page, obs);
  // confirm()/alert() 一律 dismiss → 取消預約等 native confirm 不會被接受、不送出。
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss().catch(() => {});
  });

  // 1) 進入 /dashboard/bookings
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "進入 /dashboard/bookings",
    run: async () => {
      const ms = await measureNavigation(page, "/dashboard/bookings");
      return { firstReactionMs: ms, detail: ms <= 1000 ? "首屏/loading 即現" : "首屏 >1s" };
    },
  });

  // 2) 點「今日」開當日 Drawer
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "點日期開當日 Drawer",
    run: async () => {
      const ms = await measureUntilVisible(
        page,
        () => page.getByRole("button", { name: "今日" }).click(),
        DAY_SHEET_TITLE,
      );
      return { firstReactionMs: ms, detail: ms <= 500 ? "Drawer 即時開啟" : "Drawer 開啟 >0.5s" };
    },
  });

  // 3) 點「新增預約」入口 → /bookings/new（停在表單，不送）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "點新增預約入口",
    run: async () => {
      const ms = await measureUntilVisible(
        page,
        () => page.getByRole("link", { name: /新增預約/ }).first().click(),
        BOOKING_SEARCH_INPUT,
      );
      return { firstReactionMs: ms, detail: "新增預約表單載入（未送出）" };
    },
  });

  // 4) 顧客搜尋（GET /api/customers/search）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "顧客搜尋",
    run: async () => {
      const input = page.locator(BOOKING_SEARCH_INPUT).first();
      const ms = await measureUntilResponse(
        page,
        async () => {
          await input.click();
          await input.fill(SEARCH_QUERY);
        },
        SEARCH_API,
      );
      return { firstReactionMs: ms, detail: "search API 回應（含 250ms debounce）" };
    },
  });

  // 5) 新增補課入口（/bookings/new?mode=makeup，停在表單，不送）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "新增補課入口",
    run: async () => {
      const ms = await measureNavigation(page, "/dashboard/bookings/new?mode=makeup");
      return { firstReactionMs: ms, detail: "補課表單載入（未送出）" };
    },
  });

  // 6) 體驗預約 Drawer（找「建立體驗預約」trigger；找不到則 skip）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "體驗預約 Drawer",
    run: async () => {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const trigger = page.getByRole("button", { name: /建立體驗預約/ }).first();
      if ((await trigger.count()) === 0) {
        return { firstReactionMs: null, detail: "本頁無體驗預約入口", skipped: true, note: "需調整入口頁" };
      }
      const ms = await measureUntilVisible(
        page,
        () => trigger.click(),
        '[role="dialog"]',
      );
      return { firstReactionMs: ms, detail: ms <= 500 ? "Drawer 即時開啟" : "Drawer 開啟 >0.5s" };
    },
  });

  // 7) 完成 / 未到 / 取消 — 按鈕「立即 loading / 可用」（全程不送出）
  //    需當日有預約；取不到則整組 skip。
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "開啟預約明細 Drawer（查看）",
    run: async () => {
      await page.goto("/dashboard/bookings", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "今日" }).click();
      await page.locator(DAY_SHEET_TITLE).waitFor({ state: "visible" });
      const view = page.getByRole("button", { name: "查看" }).first();
      if ((await view.count()) === 0) {
        return { firstReactionMs: null, detail: "今日無預約可開啟", skipped: true, note: "需在測試日建立預約" };
      }
      // 開啟 Booking Detail Drawer（client 即時開啟，summary/prefill 來自月資料）
      const ms = await measureUntilVisible(
        page,
        () => view.click(),
        'button:has-text("完成服務"), button:has-text("收款")',
      );
      return { firstReactionMs: ms, detail: "預約明細 Drawer 開啟" };
    },
  });

  // 完成服務：直接動作 → 點下去應立即 disabled/loading（護欄擋住 markCompleted，不落地）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "完成服務 → 立即 loading",
    run: async () => {
      const btn = page.getByRole("button", { name: "完成服務" }).first();
      if ((await btn.count()) === 0) {
        return { firstReactionMs: null, detail: "此預約無「完成服務」按鈕", skipped: true };
      }
      await btn.click();
      // 護欄 hold 住 markCompleted，期間按鈕應 disabled
      let disabled = false;
      try {
        await btn.waitFor({ state: "attached" });
        await page.waitForFunction(
          (el) => (el as HTMLButtonElement).disabled,
          await btn.elementHandle(),
          { timeout: 1500 },
        );
        disabled = true;
      } catch {
        disabled = false;
      }
      return {
        firstReactionMs: null,
        detail: disabled ? "送出後按鈕立即 disabled（未送出，已攔截）" : "未觀測到 disabled/loading",
        extraVerdict: disabled ? undefined : "fail",
        note: "未送出",
      };
    },
  });

  // 標記未到 / 取消預約：v1 只驗「按鈕存在且可用」（開 modal / native confirm），不點擊送出。
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "未到 / 取消 按鈕可用",
    run: async () => {
      const noShow = page.getByRole("button", { name: "標記未到" }).first();
      const cancel = page.getByRole("button", { name: "取消預約" }).first();
      const hasNoShow = (await noShow.count()) > 0;
      const hasCancel = (await cancel.count()) > 0;
      if (!hasNoShow && !hasCancel) {
        return { firstReactionMs: null, detail: "此預約無未到/取消按鈕", skipped: true };
      }
      const parts: string[] = [];
      if (hasNoShow) parts.push(`未到 ${(await noShow.isEnabled()) ? "可用" : "停用"}`);
      if (hasCancel) parts.push(`取消 ${(await cancel.isEnabled()) ? "可用" : "停用"}`);
      return {
        firstReactionMs: null,
        detail: parts.join(" / ") + "（v1 不點擊送出）",
        note: "未送出",
      };
    },
  });
});
