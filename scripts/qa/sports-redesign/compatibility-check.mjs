import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright"),
  { PrismaClient } = require("../../../generated/course-client");
const url = "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test";
if (process.env.DATABASE_URL !== url) throw Error("Isolated database required");
const db = new PrismaClient({ datasourceUrl: url }),
  storeId = "sports-live-flow-store",
  checks = [],
  out = "artifacts/sports-redesign-live";
let browser, page;
const pass = (name, more = {}) => {
  checks.push({ name, passed: true, ...more });
  console.log("PASS", name);
};
async function close(p = page) {
  const d = p.getByRole("dialog");
  await d.getByRole("button", { name: "關閉", exact: true }).click();
  await d.waitFor({ state: "hidden" });
}
async function open(time, p = page) {
  await p
    .locator("button.lesson:not([data-faded])")
    .filter({ has: p.locator("strong", { hasText: time }) })
    .click();
  return p.getByRole("dialog");
}
async function move(from, to) {
  const d = await open(from);
  await d.getByRole("button", { name: "調整本堂時間", exact: true }).click();
  await d.getByLabel("新時間", { exact: true }).fill(to);
  await d.getByRole("button", { name: "儲存本堂時間", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  await page
    .locator("button.lesson:not([data-faded])")
    .filter({ has: page.locator("strong", { hasText: to }) })
    .waitFor();
}
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    storageState: "/tmp/sports-owner-state.json",
    viewport: { width: 1440, height: 1000 },
  });
  page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on("dialog", (d) => d.accept());
  await page.goto(
    "http://localhost:3107/s/sports-live-flow/admin/dashboard/courses/staging",
  );
  await page.getByRole("heading", { name: "課表", exact: true }).waitFor();
  await page.evaluate(() => (window.__doc = "same"));
  await move("12:00", "13:00");
  assert.equal(await page.locator('[data-faded="true"]').count(), 2);
  pass("隔週固定單堂異動保留淡化原位");
  await move("09:00", "08:00");
  await move("14:00", "15:00");
  await move("16:00", "17:00");
  assert.equal(await page.locator('[data-faded="true"]').count(), 2);
  pass("單次、體驗、出租異動皆不留下淡化原位");
  let d = await open("19:00");
  await d.getByRole("button", { name: "取消本堂", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  pass("取消固定單堂釋放指定學員預約");
  d = await open("17:00");
  await d.getByRole("button", { name: "取消本堂", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  pass("出租作廢收款後可取消租借");
  const plan = await db.coursePointPlan.findFirst({
      where: { storeId, name: "肌力十堂" },
    }),
    cardsBefore = await db.coursePointCard.findMany({
      where: { storeId, planId: plan.id },
    }),
    purchasesBefore = await db.coursePurchase.findMany({
      where: { storeId, planId: plan.id },
    });
  await page.getByRole("button", { name: "收費方式", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "肌力十堂" });
  await row.getByRole("button", { name: "編輯", exact: true }).click();
  const other = await ctx.newPage();
  await other.goto(page.url());
  await other.getByRole("button", { name: "收費方式", exact: true }).click();
  await other
    .getByRole("row")
    .filter({ hasText: "肌力十堂" })
    .getByRole("button", { name: "編輯", exact: true })
    .click();
  await other.getByLabel("售價（元）", { exact: true }).fill("6600");
  await page.getByLabel("售價（元）", { exact: true }).fill("6500");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await other
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "更新" })
    .waitFor();
  assert.equal(
    await other.getByLabel("售價（元）", { exact: true }).inputValue(),
    "6600",
  );
  assert.equal(
    (await db.coursePointPlan.findUnique({ where: { id: plan.id } })).price,
    6500,
  );
  assert.deepEqual(
    await db.coursePointCard.findMany({ where: { storeId, planId: plan.id } }),
    cardsBefore,
  );
  assert.deepEqual(
    await db.coursePurchase.findMany({ where: { storeId, planId: plan.id } }),
    purchasesBefore,
  );
  pass("改售價保留原卡額度、效期、購買快照；過期編輯拒絕覆寫並保留輸入");
  await other.screenshot({ path: out + "/conflict-preserves-input.png" });
  await other.close();
  for (const [width, height] of [
    [1440, 900],
    [1366, 1024],
    [1024, 1366],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    for (const tab of ["教學項目", "收費方式", "課表"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Page-level horizontal overflow",
      );
      await page
        .getByRole("button", {
          name:
            "＋新增" +
            (tab === "課表"
              ? "排課"
              : tab === "教學項目"
                ? "教學項目"
                : "收費方式"),
          exact: true,
        })
        .click();
      const d = page.getByRole("dialog");
      await d.waitFor();
      const bounds = await d.boundingBox();
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
      await close();
    }
    await page.screenshot({ path: out + `/rwd-${width}x${height}.png` });
    pass(`真實後台三頁及新增視窗 RWD ${width}×${height}`);
  }
  assert.equal(await page.evaluate(() => window.__doc), "same");
  pass("異動、取消、設定修改及 RWD 切換維持同一頁面");
  writeFileSync(
    out + "/compatibility-checks.json",
    JSON.stringify({ checks }, null, 2),
  );
} catch (e) {
  if (page) {
    console.log((await page.locator("body").innerText()).slice(-2200));
    await page
      .screenshot({ path: out + "/compatibility-failure.png" })
      .catch(() => {});
  }
  writeFileSync(
    out + "/compatibility-checks.json",
    JSON.stringify({ checks, error: String(e) }, null, 2),
  );
  throw e;
} finally {
  await browser?.close();
  await db.$disconnect();
}
