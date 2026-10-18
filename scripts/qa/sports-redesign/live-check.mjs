import {assertActionSuccess} from "./action-result.mjs";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright"),
  { PrismaClient } = require("../../../generated/course-client");
const url = "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test";
if (process.env.DATABASE_URL !== url) throw Error("Isolated database only");
const db = new PrismaClient({ datasourceUrl: url }),
  storeId = "sports-live-flow-store",
  out = "artifacts/sports-redesign-live";
mkdirSync(out, { recursive: true });
const checks = [];
let browser, page, lastCommand;
const check = (name, details = {}) => {
  checks.push({ name, passed: true, ...details });
  console.log("PASS", name);
};
async function until(fn) {
  for (let n = 0; n < 100; n++) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Database assertion timed out");
}
async function close() {
  const d = page.getByRole("dialog");
  if (await d.count()) {
    await d.getByRole("button", { name: "關閉", exact: true }).click();
    await d.waitFor({ state: "hidden" });
  }
}
async function submit() {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function schedule(
  kind,
  time,
  mode = "開放選課",
  count = 1,
  failure = false,
) {
  await page.getByRole("button", { name: "＋新增排課", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: kind, exact: true }).click();
  if (kind !== "空間出租") {
    await d
      .getByLabel("教學項目", { exact: true })
      .selectOption({ label: "肌力驗收" });
    if (kind !== "體驗")
      await d
        .getByLabel("適用收費方式", { exact: true })
        .selectOption({ label: "肌力十堂 · 堂數" });
    await d.getByRole("button", { name: mode, exact: true }).click();
    if (mode === "指定學員")
      await d.getByRole("checkbox", { name: /運動驗收學員/ }).check();
  } else {
    await d.getByLabel("租借人", { exact: true }).fill("測試租借人");
    await d.getByLabel("租借電話", { exact: true }).fill("0900000101");
    await d.getByLabel("租借金額（元）", { exact: true }).fill("1000");
  }
  await d.getByLabel("開始時間", { exact: true }).fill(time);
  if (kind === "每週固定" || kind === "隔週固定")
    await d.getByLabel("排課堂數", { exact: true }).fill(String(count));
  await d.getByRole("button", { name: "確認建立排課", exact: true }).click();
  if (failure) {
    await d.getByRole("alert").waitFor();
    const message = await d.getByRole("alert").innerText();
    await close();
    return message;
  }
  await d.waitFor({ state: "hidden" });
}
async function detail(time) {
  await page
    .locator(".sports-staging button.lesson:not([data-faded])")
    .filter({ has: page.locator("strong", { hasText: time }) })
    .click();
  return page.getByRole("dialog");
}
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  page = await context.newPage();
  page.setDefaultTimeout(35000);
  page.on("dialog", (d) => d.accept());
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      r.headers()["next-action"] &&
      r.postData()?.includes("operation")
    )
      lastCommand = {
        url: r.url(),
        headers: {
          "next-action": r.headers()["next-action"],
          "content-type": r.headers()["content-type"],
          origin: "http://localhost:3107",
        },
        data: r.postData(),
      };
  });
  await page.goto("http://localhost:3107/hq/login?store=sports-live-flow");
  await page
    .getByLabel("Email", { exact: true })
    .fill("sports-owner@example.invalid");
  await page
    .getByLabel("密碼", { exact: true })
    .fill("isolated-sports-test-only");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL("**/admin/dashboard");
  await context.storageState({ path: "/tmp/sports-owner-state.json" });
  await page.goto(
    "http://localhost:3107/s/sports-live-flow/admin/dashboard/courses/staging",
  );
  await page.getByRole("heading", { name: "課表", exact: true }).waitFor();
  await page.evaluate(() => (window.__sportsDocument = "retained"));
  await page.getByRole("button", { name: "教學項目", exact: true }).click();
  await page
    .getByRole("button", { name: "＋新增教學項目", exact: true })
    .click();
  await page.getByLabel("運動名稱", { exact: true }).fill("肌力驗收");
  await page.getByLabel("分類", { exact: true }).fill("肌力");
  await submit();
  const subject = await until(() =>
    db.musicSubject.findFirst({ where: { storeId, name: "肌力驗收" } }),
  );
  check("教學項目寫入既有 MusicSubject", { id: subject.id });
  await page.getByRole("button", { name: "收費方式", exact: true }).click();
  await page
    .getByRole("button", { name: "＋新增收費方式", exact: true })
    .click();
  await page.getByLabel("運動", { exact: true }).selectOption(subject.id);
  await page.getByLabel("收費名稱", { exact: true }).fill("肌力十堂");
  await page.getByLabel("計費單位", { exact: true }).selectOption("堂數");
  await page.getByLabel("售價（元）", { exact: true }).fill("6000");
  await page.getByRole("checkbox", { name: "驗收老闆", exact: true }).check();
  await submit();
  const plan = await until(() =>
    db.coursePointPlan.findFirst({ where: { storeId, name: "肌力十堂" } }),
  );
  assert.equal(plan.unit, "SESSION");
  check("堂數收費連接既有方案與授課資格", { id: plan.id });
  await page
    .getByRole("row")
    .filter({ hasText: "肌力十堂" })
    .getByRole("button", { name: "購買", exact: true })
    .click();
  await page
    .getByLabel("購買學員", { exact: true })
    .selectOption("sports-live-customer");
  await submit();
  const card = await until(() =>
    db.coursePointCard.findFirst({ where: { storeId, planId: plan.id } }),
  );
  assert.equal(card.remaining, 10);
  assert.equal(
    await db.coursePurchase.count({ where: { storeId, cardId: card.id } }),
    1,
  );
  check("真實購買建立一張卡及一筆交易", { cardId: card.id });
  await page.getByRole("button", { name: "課表", exact: true }).click();
  await schedule("每週固定", "09:00", "指定學員", 4);
  const weekly = await db.courseSession.findMany({
    where: { storeId, templateId: plan.templateIds[0] },
    orderBy: { startsAt: "asc" },
  });
  assert.equal(weekly.length, 4);
  assert.equal(
    await db.courseBooking.count({
      where: { storeId, cardId: card.id, status: "RESERVED" },
    }),
    4,
  );
  assert.equal(
    (await db.coursePointCard.findUnique({ where: { id: card.id } })).remaining,
    10,
  );
  check("每週固定指定學員四堂原子預約，保留四堂未扣帳");
  const receipt = lastCommand;
  const replay = await context.request.post(receipt.url, {
    headers: receipt.headers,
    data: receipt.data,
  });
  const replayResult=await assertActionSuccess(replay);
  assert.equal(replayResult.data.count,4);
  assert.equal(replayResult.data.sessionId,weekly[0].id);
  assert.equal(
    await db.courseSession.count({
      where: { storeId, requestKey: weekly[0].requestKey },
    }),
    4,
  );
  assert.equal(
    await db.courseBooking.count({ where: { storeId, cardId: card.id } }),
    4,
  );
  check("重送同一排課請求不重複建立課程或預約");
  const observerContext = await browser.newContext({
      storageState: "/tmp/sports-owner-state.json",
      viewport: { width: 1024, height: 1366 },
    }),
    observer = await observerContext.newPage();
  await observer.goto(page.url());
  await observer.evaluate(() => (window.__sportsDocument = "observer"));
  await observer
    .locator("button.lesson:not([data-faded])")
    .filter({ has: observer.locator("strong", { hasText: "09:00" }) })
    .click();
  let d = await detail("09:00");
  await d.getByRole("button", { name: "標記出席", exact: true }).click();
  await until(
    async () =>
      (await db.coursePointCard.findUnique({ where: { id: card.id } }))
        .remaining === 9,
  );
  await observer
    .getByText("運動驗收學員 · ATTENDED", { exact: true })
    .waitFor({ timeout: 25000 });
  check("出席扣一堂，第二裝置開啟名單自動同步");
  await d.getByRole("button", { name: "取消預約", exact: true }).click();
  await until(
    async () =>
      (await db.coursePointCard.findUnique({ where: { id: card.id } }))
        .remaining === 10,
  );
  await observer
    .getByText("運動驗收學員 · CANCELLED", { exact: true })
    .waitFor({ timeout: 25000 });
  assert.equal(
    await observer.evaluate(() => window.__sportsDocument),
    "observer",
  );
  check("出席後取消還一堂，第二裝置不重整同步");
  await d.getByRole("button", { name: "調整本堂時間", exact: true }).click();
  await page.getByLabel("新時間", { exact: true }).fill("11:00");
  await page.getByRole("button", { name: "儲存本堂時間", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.locator('[data-faded="true"]').waitFor();
  assert.equal(await page.locator('[data-faded="true"]').count(), 1);
  const moved = await db.courseSession.findUnique({
    where: { id: weekly[0].id },
  });
  assert.ok(moved.rescheduledFromStartsAt);
  const later = await db.courseSession.findMany({
    where: { id: { in: weekly.slice(1).map((s) => s.id) } },
  });
  assert.ok(
    later.every((s) =>
      weekly.some(
        (w) => w.id === s.id && w.startsAt.getTime() === s.startsAt.getTime(),
      ),
    ),
  );
  check("固定課單堂異動留下淡化原位，後續三堂不變");
  const beforeFixed = await db.courseSession.count({ where: { storeId } });
  const fixedError = await schedule("每週固定", "09:00", "開放選課", 1, true);
  assert.match(fixedError, /不可再排固定課/);
  assert.equal(
    await db.courseSession.count({ where: { storeId } }),
    beforeFixed,
  );
  check("淡化原位拒絕重複固定系列，拒絕時無新增");
  await schedule("單次", "09:00");
  check("固定課釋出原時段可排單次");
  await schedule("隔週固定", "12:00", "開放選課", 2);
  const biweekly = await db.courseSession.findMany({
    where: {
      storeId,
      startsAt: { gte: weekly[0].startsAt },
      templateId: plan.templateIds[0],
    },
    orderBy: { startsAt: "asc" },
  });
  check("隔週固定開放選課建立");
  await schedule("體驗", "14:00", "指定學員");
  check("體驗指定學員走既有試課預約");
  d = await detail("14:00");
  await d.getByRole("button", { name: "登錄體驗收款", exact: true }).click();
  await d.getByRole("button", { name: "作廢體驗收款", exact: true }).waitFor();
  await d.getByRole("button", { name: "作廢體驗收款", exact: true }).click();
  await d.getByRole("button", { name: "登錄體驗收款", exact: true }).waitFor();
  check("體驗收款及作廢沿用帳本");
  await close();
  await schedule("空間出租", "16:00");
  d = await detail("16:00");
  await d.getByRole("button", { name: "登錄租借收款", exact: true }).click();
  await d.getByRole("button", { name: "作廢租借收款", exact: true }).waitFor();
  await d.getByRole("button", { name: "作廢租借收款", exact: true }).click();
  await d.getByRole("button", { name: "登錄租借收款", exact: true }).waitFor();
  check("空間出租、收款及作廢沿用既有核心");
  await close();
  const countBefore = await db.courseSession.count({ where: { storeId } });
  const fundsError = await schedule("每週固定", "17:00", "指定學員", 8, true);
  assert.match(fundsError, /方案|額度/);
  assert.equal(
    await db.courseSession.count({ where: { storeId } }),
    countBefore,
  );
  check("指定學員整批額度不足時回滾全部課次");
  const rentalError = await schedule("單次", "16:00", "開放選課", 1, true);
  assert.match(rentalError, /租借/);
  check("租借時段拒絕重疊排課");
  await schedule("每週固定", "18:00", "開放選課", 2);
  await schedule("隔週固定", "19:00", "指定學員", 2);
  await schedule("單次", "20:00", "指定學員");
  await schedule("體驗", "21:00", "開放選課");
  check("四種教學排課皆驗證指定學員與開放選課，出租獨立");
  const stepCounts =
    await db.$queryRaw`SELECT frequency,enrollment,count(*)::int AS count FROM "SportsStagingSessionRule" WHERE "storeId"=${storeId} GROUP BY frequency,enrollment`;
  assert.ok(stepCounts.length === 6);
  check("資料庫確認單次／每週／隔週兩種參加方式齊全", { rows: stepCounts });
  assert.equal(await page.evaluate(() => window.__sportsDocument), "retained");
  check("所有新增、交易、異動維持同一份頁面文件");
  await page.screenshot({ path: out + "/desktop.png", fullPage: true });
  await observer.screenshot({ path: out + "/ipad-sync.png", fullPage: true });
  writeFileSync(
    out + "/checks.json",
    JSON.stringify(
      {
        scope: "isolated local real Next/PostgreSQL",
        productionDeployed: false,
        checks,
      },
      null,
      2,
    ),
  );
} catch (e) {
  if (page) {
    console.log((await page.locator("body").innerText()).slice(-4000));
    await page
      .screenshot({ path: out + "/failure.png", fullPage: true })
      .catch(() => {});
  }
  writeFileSync(
    out + "/checks.json",
    JSON.stringify({ checks, error: String(e) }, null, 2),
  );
  throw e;
} finally {
  await browser?.close();
  await db.$disconnect();
}
