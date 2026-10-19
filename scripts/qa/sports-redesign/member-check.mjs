import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright"),
  { PrismaClient } = require("../../../generated/course-client");
const url = "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test";
if (process.env.DATABASE_URL !== url) throw Error("Isolated database required");
const db = new PrismaClient({ datasourceUrl: url }),
  storeId = "sports-live-flow-store",
  base = "http://localhost:3107",
  path = base + "/s/sports-live-flow/book",
  checks = [];
let browser;
const pass = (name) => {
  checks.push({ name, passed: true });
  console.log("PASS", name);
};
const manifest = JSON.parse(
  readFileSync(".next/dev/server/server-reference-manifest.json", "utf8"),
);
const action = (name) =>
  Object.entries(manifest.node).find(([, v]) => v.exportedName === name)?.[0];
async function post(ctx, name, payload, route = path) {
  const r = await ctx.request.post(route, {
    maxRedirects: 0,
    headers: {
      "next-action": action(name),
      "content-type": "text/plain;charset=UTF-8",
      origin: base,
    },
    data: JSON.stringify([payload]),
  });
  return r.status() >= 300 ? "Forbidden HTTP " + r.status() : r.text();
}
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on("dialog", (d) => d.accept());
  await page.goto(base + "/hq/login?store=sports-live-flow");
  await page
    .getByLabel("Email", { exact: true })
    .fill("sports-live-customer@example.invalid");
  await page
    .getByLabel("密碼", { exact: true })
    .fill("isolated-sports-test-only");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL(path);
  await page.getByRole("button", { name: "預約", exact: true }).waitFor();
  await page.evaluate(() => (window.__memberDocument = "same"));
  await page.getByRole("button", { name: "預約", exact: true }).click();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
  }).format(
    (
      await db.courseSession.findFirst({
        where: { storeId, rescheduledFromStartsAt: { not: null } },
        orderBy: { startsAt: "asc" },
      })
    ).startsAt,
  );
  await page
    .getByRole("button", { name: new RegExp("^" + date + " ") })
    .click();
  await page.locator(".cp-lesson").first().waitFor();
  const text = await page.locator("main").innerText();
  assert.ok(!text.includes("11:00 · 肌力"));
  pass("會員選課隱藏指定學員課，既有預約保留我的預約");
  const plan = await db.coursePointPlan.findFirst({
      where: { storeId, name: "肌力十堂" },
    }),
    card = await db.coursePointCard.findFirst({
      where: { storeId, planId: plan.id },
    }),
    assigned = await db.courseSession.findFirst({
      where: {
        storeId,
        templateId: plan.templateIds[0],
        rescheduledFromStartsAt: { not: null },
      },
    });
  let result = await post(ctx, "createMemberCourseBooking", {
    sessionId: assigned.id,
    cardId: card.id,
    customerIds: ["sports-live-customer"],
    requestKey: randomUUID(),
  });
  assert.match(result, /僅限店家指定學員/);
  pass("直接呼叫會員預約也拒絕指定學員課");
  const before = await db.courseSession.count({ where: { storeId } });
  result = await post(
    ctx,
    "sportsStagingCommand",
    { operation: "cancel", payload: { id: assigned.id } },
    base + "/s/sports-live-flow/admin/dashboard/courses/staging",
  );
  assert.match(result, /權限|禁止|FORBIDDEN|Forbidden|Unauthorized|無法存取/);
  assert.equal(await db.courseSession.count({ where: { storeId } }), before);
  assert.equal(
    (await db.courseSession.findUnique({ where: { id: assigned.id } }))
      .cancelledAt,
    null,
  );
  pass("會員直接呼叫管理操作遭後端拒絕");
  const open = page
    .locator(".cp-lesson")
    .filter({ has: page.locator("strong", { hasText: "12:00" }) });
  await open.getByRole("button", { name: "預約", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "確認預約", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const session = await db.courseSession.findFirst({
    where: {
      storeId,
      templateId: plan.templateIds[0],
      startsAt: new Date(`${date}T12:00:00+08:00`),
    },
  });
  assert.equal(
    await db.courseBooking.count({
      where: {
        storeId,
        sessionId: session.id,
        customerId: "sports-live-customer",
        status: "RESERVED",
      },
    }),
    1,
  );
  assert.equal(await page.evaluate(() => window.__memberDocument), "same");
  pass("會員透過真實選課介面加入開放課，不重整");
  await page.screenshot({
    path: "artifacts/sports-redesign-live/member-mobile.png",
    fullPage: true,
  });
  const wrong = await post(ctx, "createMemberCourseBooking", {
    sessionId: session.id,
    cardId: "other-store-card",
    customerIds: ["sports-live-customer"],
    requestKey: randomUUID(),
  });
  assert.match(wrong, /有效課程|方案|本店/);
  pass("跨店卡片偽造參數遭拒絕");
  const openTrial = await db.courseSession.findFirst({
    where: { storeId, startsAt: new Date(`${date}T21:00:00+08:00`) },
  });
  const displayedPrice = await page
    .getByRole("button", { name: /體驗預約 NT/ })
    .innerText();
  const expectedPrice = Number(displayedPrice.replace(/[^0-9]/g, ""));
  const reject = await post(ctx, "bookSportsTrial", {
    sessionId: openTrial.id,
    requestKey: randomUUID(),
    expectedPrice: expectedPrice + 1,
  });
  assert.match(reject, /價格已更新/);
  pass("體驗價格不符時拒絕預約，不靜默改價");
  const beforeTrialBalance = (
    await db.coursePointCard.findUnique({ where: { id: card.id } })
  ).remaining;
  await page.getByRole("button", { name: /體驗預約 NT/ }).click();
  await page.getByRole("dialog").count();
  for (let n = 0; n < 50; n++) {
    if (
      await db.courseBooking.findFirst({
        where: {
          storeId,
          bookingKind: "TRIAL",
          customerId: "sports-live-customer",
          session: { startsAt: new Date(`${date}T21:00:00+08:00`) },
        },
      })
    )
      break;
    await page.waitForTimeout(200);
  }
  const trial = await db.courseBooking.findFirst({
    where: {
      storeId,
      bookingKind: "TRIAL",
      customerId: "sports-live-customer",
      session: { startsAt: new Date(`${date}T21:00:00+08:00`) },
    },
  });
  assert.ok(trial);
  assert.equal(trial.cardId, null);
  assert.equal(trial.pointCost, 0);
  const trialRule =
    await db.$queryRaw`SELECT "trialPrice" FROM "SportsStagingSessionRule" WHERE "sessionId"=${trial.sessionId}`;
  assert.equal(trial.trialPrice, trialRule[0].trialPrice);
  assert.equal(
    (await db.coursePointCard.findUnique({ where: { id: card.id } })).remaining,
    beforeTrialBalance,
  );
  pass("開放體驗由會員自行預約，採試課價格、不扣一般卡");
  const noCardDebit = await post(ctx, "createMemberCourseBooking", {
    sessionId: openTrial.id,
    cardId: card.id,
    customerIds: ["sports-live-customer"],
    requestKey: randomUUID(),
  });
  assert.match(noCardDebit, /體驗課請使用體驗預約/);
  pass("體驗課拒絕偽造一般方案扣抵");
  const cancelled = await post(ctx, "updateCourseBookingStatus", {
    bookingId: trial.id,
    status: "CANCELLED",
    member: true,
  });
  assert.match(cancelled, /success/);
  assert.equal(
    (await db.courseBooking.findUnique({ where: { id: trial.id } })).status,
    "CANCELLED",
  );
  assert.equal(
    (await db.coursePointCard.findUnique({ where: { id: card.id } })).remaining,
    beforeTrialBalance,
  );
  pass("會員取消未收款體驗不變動一般卡");
  writeFileSync(
    "artifacts/sports-redesign-live/member-checks.json",
    JSON.stringify({ checks }, null, 2),
  );
} catch (e) {
  writeFileSync(
    "artifacts/sports-redesign-live/member-checks.json",
    JSON.stringify({ checks, error: String(e) }, null, 2),
  );
  throw e;
} finally {
  await browser?.close();
  await db.$disconnect();
}
