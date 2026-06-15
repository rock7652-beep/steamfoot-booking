/**
 * Speed Audit v1 — 登入 setup
 *
 * 用店長端 /hq/login UI 程式化登入（email + password），把 session 存成
 * storageState（e2e/speed-audit/.auth/owner.json，已 gitignore），供 audit 專案重用。
 *
 * - 帳密一律從環境變數讀（resolveCredentials），repo 內零 hardcode。
 * - base URL 經 resolveBaseUrl 把關（缺值 fail-fast、production abort）。
 * - 本 setup「不」安裝 mutation 護欄：登入本身是 POST server action，需放行。
 */

import { test as setup, expect } from "@playwright/test";
import { resolveBaseUrl, resolveCredentials } from "./fixtures/env";

const STORAGE_STATE = "e2e/speed-audit/.auth/owner.json";

setup("authenticate via /hq/login", async ({ page }) => {
  const baseURL = resolveBaseUrl();
  const { email, password } = resolveCredentials();

  await page.goto(`${baseURL}/hq/login`, { waitUntil: "domcontentloaded" });

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);

  await Promise.all([
    page.waitForURL(/\/dashboard(\/|\?|$)/, { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);

  // 確認真的進到後台（避免存到未登入的 storageState）
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: STORAGE_STATE });
});
