/**
 * Speed Audit v1 — B. 顧客管理 速度巡檢（全程 read-only）
 *
 * 涵蓋：進入 /dashboard/customers → 搜尋顧客 → 點 row 開 Drawer →
 *       Drawer 是否立即打開 + skeleton 是否立即出現 → 編輯顧客入口 →
 *       新增預約入口 → 匯出按鈕「沒有進頁就偷跑 /api/export/customers」（不點擊匯出）。
 *
 * 安全：全域 mutation 護欄 abort 所有非 GET（含 getCustomerDrawerDetailAction，
 *       故只量 Drawer 開啟 + skeleton，不量內容載入）。匯出絕不點擊。
 */

import { test } from "@playwright/test";
import {
  installObservers,
  installMutationGuard,
  measureNavigation,
  measureUntilVisible,
  measureUntilUrl,
  runStep,
} from "./fixtures/metrics";

const SUITE = "B. 顧客管理 (customers)";

const LIST_SEARCH_INPUT = 'input[name="search"]'; // customers-toolbar 搜尋框
const DIALOG = '[role="dialog"]';
const SKELETON = '[role="dialog"] .animate-pulse'; // CustomerDrawerSkeleton
const EXPORT_LINK = 'a[href="/api/export/customers"]';
const SEARCH_QUERY = process.env.SPEED_AUDIT_SEARCH_QUERY ?? "測試";

test("B. 顧客管理 速度巡檢", async ({ page }, testInfo) => {
  const obs = installObservers(page);
  await installMutationGuard(page, obs);
  page.on("dialog", (d) => void d.dismiss().catch(() => {}));

  // 1) 進入 /dashboard/customers
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "進入 /dashboard/customers",
    run: async () => {
      const ms = await measureNavigation(page, "/dashboard/customers");
      return { firstReactionMs: ms, detail: ms <= 1000 ? "首屏/loading 即現" : "首屏 >1s" };
    },
  });

  // 2) 搜尋顧客（toolbar → server 導航，URL 帶 search=）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "搜尋顧客",
    run: async () => {
      const input = page.locator(LIST_SEARCH_INPUT).first();
      const ms = await measureUntilUrl(
        page,
        async () => {
          await input.fill(SEARCH_QUERY);
          await page.getByRole("button", { name: "搜尋" }).click();
        },
        /search=/,
      );
      return { firstReactionMs: ms, detail: ms <= 1000 ? "結果/loading 即現" : "搜尋 >1s" };
    },
  });

  // 3) 點 row「查看」開 Drawer（含 skeleton）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "點 row 開 Drawer",
    run: async () => {
      const view = page.getByRole("button", { name: "查看" }).first();
      if ((await view.count()) === 0) {
        return { firstReactionMs: null, detail: "清單無顧客可開啟", skipped: true, note: "需 staging 有顧客" };
      }
      const ms = await measureUntilVisible(page, () => view.click(), DIALOG);
      return { firstReactionMs: ms, detail: ms <= 500 ? "Drawer 即時開啟" : "Drawer 開啟 >0.5s" };
    },
  });

  // 4) skeleton / loading 是否立即出現
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "skeleton 立即出現",
    run: async () => {
      const skel = page.locator(SKELETON).first();
      if ((await skel.count()) === 0) {
        return { firstReactionMs: null, detail: "未偵測到 skeleton（drawer 可能已關）", skipped: true };
      }
      const ms = await measureUntilVisible(page, async () => {}, SKELETON);
      // 護欄擋住內容 server action（POST），故 drawer 維持在 skeleton — 符合預期。
      return { firstReactionMs: ms, detail: "skeleton 立即顯示（內容讀取已被護欄攔截，符合 read-only）" };
    },
  });

  // 取一個顧客 id（GET search API，供 5/6 構造路徑；取不到則後續 skip）
  let customerId: string | null = null;
  try {
    const resp = await page.request.get(
      `/api/customers/search?q=${encodeURIComponent(SEARCH_QUERY)}&limit=1`,
    );
    if (resp.ok()) {
      const data = (await resp.json()) as Array<{ id: string }>;
      customerId = data[0]?.id ?? null;
    }
  } catch {
    customerId = null;
  }

  // 5) 編輯顧客入口（/customers/[id]/edit，停在表單，不送）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "編輯顧客入口",
    run: async () => {
      if (!customerId) {
        return { firstReactionMs: null, detail: "無可用顧客 id", skipped: true };
      }
      const ms = await measureNavigation(page, `/dashboard/customers/${customerId}/edit`);
      return { firstReactionMs: ms, detail: "編輯表單載入（未送出）" };
    },
  });

  // 6) 新增預約入口（/bookings/new?customerId=，停在表單，不送）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "新增預約入口",
    run: async () => {
      if (!customerId) {
        return { firstReactionMs: null, detail: "無可用顧客 id", skipped: true };
      }
      const ms = await measureNavigation(
        page,
        `/dashboard/bookings/new?customerId=${customerId}`,
      );
      return { firstReactionMs: ms, detail: "帶顧客的新增預約表單載入（未送出）" };
    },
  });

  // 7) 匯出按鈕：靜置監聽，確認「沒有進頁就偷跑」/api/export/customers（不點擊）
  await runStep(testInfo, obs, {
    suite: SUITE,
    step: "匯出無背景偷跑",
    run: async () => {
      await page.goto("/dashboard/customers", { waitUntil: "domcontentloaded" });
      const before = obs.exportRequests.length;
      await page.waitForTimeout(1500); // 靜置視窗：期間不應有任何 export 請求
      const leaked = obs.exportRequests.length - before;
      const link = page.locator(EXPORT_LINK).first();
      const hasLink = (await link.count()) > 0;
      return {
        firstReactionMs: null,
        detail: leaked === 0
          ? `靜置 1.5s 無背景 export（匯出鍵${hasLink ? "存在" : "未見"}，未點擊）`
          : `⚠️ 偵測到 ${leaked} 筆背景 /api/export/customers（prefetch 可能回退）`,
        extraVerdict: leaked === 0 ? undefined : "warn",
        note: "未點擊匯出",
      };
    },
  });
});
