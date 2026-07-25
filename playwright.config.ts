import { defineConfig, devices } from "@playwright/test";
import { resolveBaseUrl, bypassHeaders } from "./e2e/speed-audit/fixtures/env";

/**
 * Speed Audit v1 — Playwright 設定
 *
 * 只為「店長核心流程速度巡檢」服務，全程 read-only，只跑 Preview / Staging。
 * baseURL 由 resolveBaseUrl() 解析：缺 SPEED_AUDIT_BASE_URL 會 fail-fast、
 * 命中 production domain 會直接 abort（見 e2e/speed-audit/fixtures/env.ts）。
 *
 * workers:1、retries:0：staging 在 connection_limit=1 下，平行打會讓量測失真。
 *
 * trace/screenshot/video 一律 off：避免 bypass token（extraHTTPHeaders）被寫進 artifact。
 */

// 在 config 載入時就驗證（fail-fast / production abort）。
const baseURL = resolveBaseUrl();
// Vercel Deployment Protection 通道：有 token 才帶 header，無 token 為 no-op。
// token 只從 env 讀，絕不出現在 log / report / artifact。
const extraHTTPHeaders = bypassHeaders();

export default defineConfig({
  testDir: "./e2e/speed-audit",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // v1 為「報告制」，不當 CI hard gate：即使有 fail step 也只反映在文字報告，
  // 報告由自訂 reporter 輸出（report.ts）。list reporter 提供即時進度。
  reporter: [["list"], ["./e2e/speed-audit/fixtures/report.ts"]],
  use: {
    baseURL,
    extraHTTPHeaders,
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "speed-audit",
      testMatch: /.*\.audit\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/speed-audit/.auth/owner.json",
      },
    },
  ],
});
