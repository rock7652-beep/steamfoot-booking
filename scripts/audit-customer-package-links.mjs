#!/usr/bin/env node
/**
 * 顧客 ↔ 方案連結 audit — 一鍵掃描常見誤用。
 *
 * 印 informational 輸出，不 fail build。供 PR reviewer / 日常巡檢用。
 * 執行：node scripts/audit-customer-package-links.mjs
 */
import { execSync } from "node:child_process";

const checks = [
  {
    name: "可能錯用 session.user.id 查 customer (where 子句)",
    cmd: `grep -RnE "where:\\s*\\{[^}]*userId:\\s*(session\\.user\\.id|session\\?\\.user\\?\\.id|user\\.id)" src --include='*.ts' --include='*.tsx' || true`,
  },
  {
    name: "堂數 / 方案相關查詢",
    cmd: `grep -Rn "remainingSessions\\|customerPlanWallet\\|servicePlan" src/app src/server src/components --include='*.ts' --include='*.tsx' || true`,
  },
  {
    name: "顧客端 notFound() — 只該用於權限/路徑非法，不該用於空方案",
    cmd: `grep -Rn "notFound()" "src/app/(customer)" src/server --include='*.ts' --include='*.tsx' || true`,
  },
  {
    name: "可能錯誤的方案連結 (指向 /plans 或 /packages 根路徑)",
    cmd: `grep -RnE "href=\\"/plans\\"|href=\\"/packages\\"|href=\\"plans\\"|href=\\"packages\\"" src --include='*.ts' --include='*.tsx' || true`,
  },
  {
    name: "customerPlanWallet 查詢未帶 storeId",
    cmd: `grep -RnB1 -A3 "customerPlanWallet\\.\\(findMany\\|findFirst\\|count\\)" src --include='*.ts' --include='*.tsx' | grep -B3 "customerId" | grep -v "storeId" || true`,
  },
];

for (const check of checks) {
  console.log(`\n\n=== ${check.name} ===\n`);
  try {
    const out = execSync(check.cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    process.stdout.write(out || "(無命中)\n");
  } catch (err) {
    console.error(`[audit] check failed: ${check.name}`, err?.message ?? err);
  }
}
