import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { assertActionSuccess, readActionResult } from "./action-result.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.QA_PLAYWRIGHT_MODULE ||
      "/opt/codex/cua_node/lib/node_modules/playwright",
  ),
  { PrismaClient } = require("../../../generated/course-client");
const url = "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test";
if (process.env.DATABASE_URL !== url)
  throw Error("Dedicated disposable database only");
const db = new PrismaClient({ datasourceUrl: url }),
  storeId = "sports-live-flow-store",
  out = "artifacts/sports-redesign-live",
  checks = [];
mkdirSync(out, { recursive: true });
let browser, page, lastCommand;
const pass = (name, details = {}) => {
  checks.push({ name, passed: true, ...details });
  console.log("PASS", name);
};
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Database assertion timed out");
}
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  page = await ctx.newPage();
  page.setDefaultTimeout(35000);
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      r.headers()["next-action"] &&
      r.postData()?.includes('"operation":"schedule"')
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
  await page.goto(
    "http://localhost:3107/s/sports-live-flow/admin/dashboard/courses/staging",
  );
  await page.getByRole("heading", { name: "課表", exact: true }).waitFor();
  await page.evaluate(() => (window.__replayDocument = "same"));
  const plan = await db.coursePointPlan.findFirstOrThrow({
      where: { storeId, name: "肌力十堂" },
    }),
    oldCards = await db.coursePointCard.findMany({
      where: { storeId, planId: plan.id },
      select: { id: true },
    });
  await page.getByRole("button", { name: "收費方式", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: "肌力十堂" })
    .getByRole("button", { name: "購買", exact: true })
    .click();
  await page
    .getByLabel("購買學員", { exact: true })
    .selectOption("sports-live-customer");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const card = await until(() =>
    db.coursePointCard.findFirst({
      where: {
        storeId,
        planId: plan.id,
        id: { notIn: oldCards.map((c) => c.id) },
      },
    }),
  );
  assert.equal(card.remaining, 10);
  await page.getByRole("button", { name: "課表", exact: true }).click();
  await page.getByRole("button", { name: "＋新增排課", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "每週固定", exact: true }).click();
  await dialog
    .getByLabel("教學項目", { exact: true })
    .selectOption({ label: "肌力驗收" });
  await dialog
    .getByLabel("適用收費方式", { exact: true })
    .selectOption(plan.id);
  await dialog.getByRole("button", { name: "指定學員", exact: true }).click();
  await dialog.getByRole("checkbox", { name: /運動驗收學員/ }).check();
  await dialog.getByLabel("開始時間", { exact: true }).fill("22:00");
  await dialog.getByLabel("排課堂數", { exact: true }).fill("8");
  await dialog
    .getByRole("button", { name: "確認建立排課", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const command = lastCommand;
  assert.ok(command);
  const requestKey = JSON.parse(command.data)[0].payload.requestKey;
  const snapshot = async () => ({
    sessions: await db.courseSession.findMany({
      where: { storeId, requestKey },
      select: { id: true, requestIndex: true },
      orderBy: { requestIndex: "asc" },
    }),
    bookings: await db.courseBooking.findMany({
      where: { storeId, session: { requestKey } },
      select: { id: true, cardId: true, status: true },
      orderBy: { id: "asc" },
    }),
    card: await db.coursePointCard.findUnique({
      where: { id: card.id },
      select: { remaining: true },
    }),
  });
  const original = await until(async () => {
    const r = await snapshot();
    return r.bookings.length === 8 ? r : null;
  });
  assert.equal(original.sessions.length, 8);
  assert.ok(
    original.bookings.every(
      (b) => b.cardId === card.id && b.status === "RESERVED",
    ),
  );
  assert.equal(original.card.remaining, 10);
  pass("真實購買十堂後指定八堂，保留八堂、可用只剩二堂", {
    requestKey,
    cardId: card.id,
  });
  const replay = await assertActionSuccess(
    await ctx.request.post(command.url, {
      headers: command.headers,
      data: command.data,
    }),
  );
  assert.equal(replay.data.count, 8);
  assert.equal(replay.data.sessionId, original.sessions[0].id);
  assert.deepEqual(await snapshot(), original);
  pass("同請求重送回傳原成功收據、原課次與原卡，不受剩餘二堂影響");
  const parallel = await Promise.all(
    [1, 2].map(() =>
      ctx.request
        .post(command.url, { headers: command.headers, data: command.data })
        .then(assertActionSuccess),
    ),
  );
  assert.ok(
    parallel.every((r) => r.data.sessionId === original.sessions[0].id),
  );
  assert.deepEqual(await snapshot(), original);
  pass("兩次並行重送均業務成功，課次、預約與餘額不重複");
  for (const patch of [
    { capacity: 7 },
    { students: ["sports-live-trial-customer"] },
  ]) {
    const changed = JSON.parse(command.data);
    Object.assign(changed[0].payload, patch);
    const response = await ctx.request.post(command.url, {
      headers: command.headers,
      data: JSON.stringify(changed),
    });
    assert.ok(response.ok());
    const result = readActionResult(await response.text());
    assert.equal(result.success, false);
    assert.match(result.error, /請求|排課|不同/);
    assert.deepEqual(await snapshot(), original);
  }
  pass("同請求變更人數或學員仍拒絕，HTTP 200 不視為業務成功");
  const [stored] =
    await db.$queryRaw`SELECT payload FROM "SportsStagingSessionRule" WHERE "sessionId"=${original.sessions[0].id}`;
  assert.equal(stored.payload.students[0].cardId, null);
  assert.equal(await page.evaluate(() => window.__replayDocument), "same");
  pass("保存原始自動配卡意圖，驗收全程不重整");
  await page.screenshot({ path: out + "/replay-confirmed.png" });
  writeFileSync(
    out + "/replay-checks.json",
    JSON.stringify(
      {
        scope: "local Next Server Actions and real PostgreSQL",
        productionDeployed: false,
        checks,
      },
      null,
      2,
    ),
  );
} catch (e) {
  if (page) {
    console.log((await page.locator("body").innerText()).slice(-2500));
    await page
      .screenshot({ path: out + "/replay-failure.png" })
      .catch(() => {});
  }
  writeFileSync(
    out + "/replay-checks.json",
    JSON.stringify({ checks, error: String(e) }, null, 2),
  );
  throw e;
} finally {
  await browser?.close();
  await db.$disconnect();
}
