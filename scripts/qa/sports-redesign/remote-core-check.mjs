import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { readActionResult } from "./action-result.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright");
const { base, bypass } = JSON.parse(
  readFileSync("/tmp/sports-preview-access.json", "utf8"),
);
assert.equal(
  base,
  "https://steamfoot-booking-git-codex-spor-4df06f-rock7652-2111s-projects.vercel.app",
);
const out = "artifacts/sports-redesign-remote",
  resume = !!process.env.SPORTS_REMOTE_RESUME,
  previous = resume
    ? JSON.parse(readFileSync(out + "/browser-checks.json", "utf8"))
    : { checks: [], actions: [] },
  checks = previous.checks,
  actions = previous.actions.filter((a) => a.result.success);
mkdirSync(out, { recursive: true });
const pass = (name, details = {}) => {
  checks.push({ name, passed: true, ...details });
  console.log("PASS", name);
};
let browser, owner, observer, member, scheduledDate;
async function login(email, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.setDefaultTimeout(45000);
  p.on("dialog", (d) => d.accept());
  await p.goto(
    base +
      "/hq/login?store=sports-live-flow&_vercel_share=" +
      encodeURIComponent(bypass),
  );
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByLabel("密碼", { exact: true }).fill("isolated-sports-test-only");
  await p.getByRole("button", { name: "登入", exact: true }).click();
  await p.waitForURL(
    email.includes("owner")
      ? "**/admin/dashboard"
      : "**/s/sports-live-flow/book",
  );
  return p;
}
async function admin(p) {
  await p.goto(base + "/s/sports-live-flow/admin/dashboard/courses/staging");
  await p.getByRole("heading", { name: "課表", exact: true }).waitFor();
  await p.evaluate(() => (window.__sportsRemoteDocument = crypto.randomUUID()));
  return p.evaluate(() => window.__sportsRemoteDocument);
}
async function submit(p) {
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
}
async function close(p) {
  const d = p.getByRole("dialog");
  if (await d.count()) {
    await d.getByRole("button", { name: "關閉", exact: true }).click();
    await d.waitFor({ state: "hidden" });
  }
}
async function detail(p, time) {
  const future = p.locator(".future button").filter({ hasText: time });
  await future
    .or(
      p
        .locator("button.lesson:not([data-faded])")
        .filter({ has: p.locator("strong", { hasText: time }) }),
    )
    .first()
    .click();
  return p.getByRole("dialog");
}
async function schedule(kind, time, mode = "開放選課", count = 1) {
  await owner.getByRole("button", { name: "＋新增排課", exact: true }).click();
  const d = owner.getByRole("dialog");
  await d.getByRole("button", { name: kind, exact: true }).click();
  await d
    .getByLabel("教學項目", { exact: true })
    .selectOption({ label: "遠端肌力驗收" });
  await d
    .getByLabel("適用收費方式", { exact: true })
    .selectOption({ label: "遠端肌力十堂 · 堂數" });
  await d.getByRole("button", { name: mode, exact: true }).click();
  if (mode === "指定學員")
    await d.getByRole("checkbox", { name: /運動驗收學員/ }).check();
  scheduledDate = await d.getByLabel("首次日期", { exact: true }).inputValue();
  await d.getByLabel("開始時間", { exact: true }).fill(time);
  if (kind === "每週固定" || kind === "隔週固定")
    await d.getByLabel("排課堂數", { exact: true }).fill(String(count));
  await d.getByRole("button", { name: "確認建立排課", exact: true }).click();
  await d.waitFor({ state: "hidden" });
}
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  owner = await login("sports-owner@example.invalid");
  const ownerDoc = await admin(owner);
  owner.on("response", async (r) => {
    const q = r.request();
    if (
      q.method() === "POST" &&
      q.headers()["next-action"] &&
      q.postData()?.includes("operation")
    ) {
      try {
        const args = JSON.parse(q.postData())[0];
        actions.push({
          operation: args.operation,
          payload: args.payload,
          result: readActionResult(await r.text()),
        });
      } catch {}
    }
  });
  if (!resume) {
    await owner.getByRole("button", { name: "教學項目", exact: true }).click();
    await owner
      .getByRole("button", { name: "＋新增教學項目", exact: true })
      .click();
    await owner.getByLabel("運動名稱", { exact: true }).fill("遠端肌力驗收");
    await owner.getByLabel("分類", { exact: true }).fill("遠端驗收");
    await submit(owner);
    pass("真實介面建立教學項目");
    await owner.getByRole("button", { name: "收費方式", exact: true }).click();
    await owner
      .getByRole("button", { name: "＋新增收費方式", exact: true })
      .click();
    await owner
      .getByLabel("運動", { exact: true })
      .selectOption({ label: "遠端肌力驗收" });
    await owner.getByLabel("收費名稱", { exact: true }).fill("遠端肌力十堂");
    await owner.getByLabel("計費單位", { exact: true }).selectOption("堂數");
    await owner.getByLabel("售價（元）", { exact: true }).fill("6000");
    await owner
      .getByRole("checkbox", { name: "驗收老闆", exact: true })
      .check();
    await submit(owner);
    await owner
      .getByRole("row")
      .filter({ hasText: "遠端肌力十堂" })
      .getByRole("button", { name: "購買", exact: true })
      .click();
    await owner
      .getByLabel("購買學員", { exact: true })
      .selectOption("sports-live-customer");
    await submit(owner);
    pass("建立收費並實際購買十堂方案");
    await owner.getByRole("button", { name: "課表", exact: true }).click();
    await schedule("每週固定", "09:00", "指定學員", 2);
    pass("每週固定指定學員排課與預約");
  }
  observer = await login("sports-owner@example.invalid", {
    width: 1024,
    height: 1366,
  });
  const observerDoc = await admin(observer);
  let at;
  if (!["3", "4"].includes(process.env.SPORTS_REMOTE_RESUME)) {
    await detail(observer, "09:00");
    await observer
      .getByText(
        "運動驗收學員 · " +
          (process.env.SPORTS_REMOTE_RESUME === "2" ? "ATTENDED" : "RESERVED"),
        { exact: true },
      )
      .waitFor();
    let d = await detail(owner, "09:00");
    if (process.env.SPORTS_REMOTE_RESUME !== "2") {
      await d.getByRole("button", { name: "標記出席", exact: true }).click();
      await owner
        .getByText("運動驗收學員 · ATTENDED", { exact: true })
        .waitFor();
      at = Date.now();
      await observer
        .getByText("運動驗收學員 · ATTENDED", { exact: true })
        .waitFor({ timeout: 35000 });
      pass("出席後另一獨立工作階段不重整同步", { latencyMs: Date.now() - at });
      await observer.screenshot({ path: out + "/observer-attended.png" });
    }
    await d.getByRole("button", { name: "取消預約", exact: true }).click();
    await owner
      .getByText("運動驗收學員 · CANCELLED", { exact: true })
      .waitFor();
    at = Date.now();
    await observer
      .getByText("運動驗收學員 · CANCELLED", { exact: true })
      .waitFor({ timeout: 35000 });
    pass("出席後取消，另一獨立工作階段不重整同步", {
      latencyMs: Date.now() - at,
    });
    await observer.screenshot({ path: out + "/observer-cancelled.png" });
    assert.equal(
      await observer.evaluate(() => window.__sportsRemoteDocument),
      observerDoc,
    );
    await close(observer);
    await close(owner);
  }
  if (["3", "4"].includes(process.env.SPORTS_REMOTE_RESUME))
    scheduledDate = previous.actions.findLast(
      (a) => a.operation === "schedule" && a.payload.kind === "單次",
    ).payload.date;
  else await schedule("單次", "12:00");
  await detail(observer, "12:00");
  await observer
    .getByText(
      process.env.SPORTS_REMOTE_RESUME === "4"
        ? "運動驗收學員 · RESERVED"
        : "尚無學員報名",
      { exact: true },
    )
    .waitFor();
  member = await login("sports-live-customer@example.invalid", {
    width: 390,
    height: 844,
  });
  await member.evaluate(() => (window.__sportsRemoteDocument = "member"));
  if (process.env.SPORTS_REMOTE_RESUME !== "4") {
    await member.getByRole("button", { name: "預約", exact: true }).click();

    await member
      .getByRole("button", { name: new RegExp("^" + scheduledDate + " ") })
      .click();
    const lesson = member
      .locator(".cp-lesson")
      .filter({ has: member.locator("strong", { hasText: "12:00" }) });
    await lesson.getByRole("button", { name: "預約", exact: true }).click();
    await member
      .getByRole("dialog")
      .getByRole("button", { name: "確認預約", exact: true })
      .click();
    await member.getByRole("dialog").waitFor({ state: "hidden" });
    at = Date.now();
    await observer
      .getByText("運動驗收學員 · RESERVED", { exact: true })
      .waitFor({ timeout: 35000 });
    pass("會員真實選課後，店家另一端名單不重整同步", {
      latencyMs: Date.now() - at,
    });
  }

  await member.getByRole("button", { name: "我的預約", exact: true }).click();
  const bookingCard = member
    .locator(".cp-booking-card")
    .filter({ hasText: "12:00" });
  await bookingCard
    .getByRole("button", { name: "查看明細 ⌄", exact: true })
    .click();
  await bookingCard.getByRole("button", { name: "取消", exact: true }).click();
  await member.getByRole("button", { name: "確認取消", exact: true }).click();
  at = Date.now();
  await observer
    .getByText("運動驗收學員 · CANCELLED", { exact: true })
    .waitFor({ timeout: 35000 });
  pass("會員取消後，店家另一端名單不重整同步", { latencyMs: Date.now() - at });
  assert.equal(
    await owner.evaluate(() => window.__sportsRemoteDocument),
    ownerDoc,
  );
  assert.equal(
    await observer.evaluate(() => window.__sportsRemoteDocument),
    observerDoc,
  );
  assert.equal(
    await member.evaluate(() => window.__sportsRemoteDocument),
    "member",
  );
  pass("三個頁面文件均保留，未手動重整");
  await observer.screenshot({ path: out + "/observer-member-cancelled.png" });
  await member.screenshot({ path: out + "/member-cancelled-mobile.png" });
  for (const op of ["purchase", "schedule", "attendance"])
    assert.ok(actions.some((a) => a.operation === op));
  assert.ok(actions.every((a) => a.result.success === true));
  pass("已擷取管理回應業務成功，扣還點另以資料庫核對");
} catch (e) {
  if (owner)
    await owner.screenshot({ path: out + "/failure.png" }).catch(() => {});
  console.error(String(e).replace(/_vercel_share=[^& ]+/g, "access=REDACTED"));
  if (member)
    console.log(
      "MEMBER_BODY",
      (await member.locator("body").innerText()).slice(-1600),
    );
  console.log(
    "OWNER_BODY",
    owner ? (await owner.locator("body").innerText()).slice(-1700) : "",
  );
  process.exitCode = 1;
} finally {
  writeFileSync(
    out + "/browser-checks.json",
    JSON.stringify(
      {
        scope: "Vercel Preview + steamfoot-preview PostgreSQL",
        base,
        productionDeployed: false,
        checks,
        actions,
      },
      null,
      2,
    ),
  );
  await browser?.close();
}
