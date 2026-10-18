import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { readActionResult } from "./action-result.mjs";
const require = createRequire(import.meta.url),
  { chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright");
const { base } = JSON.parse(
  readFileSync("/tmp/sports-preview-access.json", "utf8"),
);
assert.equal(
  base,
  "https://steamfoot-booking-git-codex-spor-4df06f-rock7652-2111s-projects.vercel.app",
);
const out = "artifacts/sports-redesign-remote",
  resume = process.env.SPORTS_VARIANTS_RESUME === "1",
  previous = resume
    ? JSON.parse(readFileSync(out + "/variants-checks.json", "utf8"))
    : { checks: [], actions: [] },
  checks = previous.checks,
  actions = previous.actions;
mkdirSync(out, { recursive: true });
const pass = (name) => {
  checks.push({ name, passed: true });
  console.log("PASS", name);
};
let browser, p, lastAttendance;
async function close() {
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "關閉", exact: true })
    .click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
}
async function save() {
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "儲存", exact: true })
    .click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
}
async function schedule(
  kind,
  time,
  mode = "開放選課",
  fee = "遠端肌力十堂 · 堂數",
) {
  await p.getByRole("button", { name: "＋新增排課", exact: true }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("button", { name: kind, exact: true }).click();
  if (kind === "空間出租") {
    await d.getByLabel("租借人", { exact: true }).fill("遠端出租驗收");
    await d.getByLabel("租借電話", { exact: true }).fill("0900000103");
    await d.getByLabel("租借金額（元）", { exact: true }).fill("1000");
  } else {
    await d
      .getByLabel("教學項目", { exact: true })
      .selectOption({ label: "遠端肌力驗收" });
    if (kind !== "體驗")
      await d
        .getByLabel("適用收費方式", { exact: true })
        .selectOption({ label: fee });
    await d.getByRole("button", { name: mode, exact: true }).click();
    if (mode === "指定學員")
      await d.getByRole("checkbox", { name: /運動驗收學員/ }).check();
  }
  await d.getByLabel("開始時間", { exact: true }).fill(time);
  if (kind === "每週固定" || kind === "隔週固定")
    await d.getByLabel("排課堂數", { exact: true }).fill("2");
  await d.getByRole("button", { name: "確認建立排課", exact: true }).click();
  await d.waitFor({ state: "hidden" });
  pass(kind + " " + (kind === "空間出租" ? "" : mode));
}
async function detail(time) {
  const future = p.locator(".future button").filter({ hasText: time });
  await future
    .or(
      p
        .locator("button.lesson")
        .filter({ has: p.locator("strong", { hasText: time }) }),
    )
    .first()
    .click();
  return p.getByRole("dialog");
}
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    proxy: { server: process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY },
    storageState: "/tmp/sports-remote-owner-state.json",
    viewport: { width: 1440, height: 1000 },
  });
  await ctx.route("**/*", async (route) => {
    try {
      const q = route.request();
      if (
        q.url().startsWith(base + "/") &&
        q.method() === "POST" &&
        q.postData()?.includes('"operation":"attendance"')
      ) {
        const response = await route.fetch();
        const body = await response.body();
        const payload = JSON.parse(q.postData())[0].payload;
        lastAttendance = readActionResult(body.toString("utf8"));
        actions.push({
          operation: "attendance",
          payload,
          result: lastAttendance,
        });
        const headers = { ...response.headers() };
        delete headers["content-encoding"];
        delete headers["content-length"];
        delete headers["transfer-encoding"];
        await route.fulfill({ status: response.status(), headers, body });
      } else await route.continue();
    } catch (e) {
      console.error("ACTION_TRANSPORT_ERROR", String(e).split("Call log:")[0]);
      await route.abort();
    }
  });
  p = await ctx.newPage();
  p.setDefaultTimeout(45000);
  p.on("dialog", (d) => d.accept());
  p.on("response", async (r) => {
    const q = r.request();
    if (
      q.method() === "POST" &&
      q.headers()["next-action"] &&
      q.postData()?.includes("operation") &&
      !q.postData()?.includes('\"operation\":\"attendance\"')
    ) {
      try {
        const a = JSON.parse(q.postData())[0];
        actions.push({
          operation: a.operation,
          payload: a.payload,
          result: readActionResult(await r.text()),
        });
      } catch {}
    }
  });
  await p.goto(base + "/s/sports-live-flow/admin/dashboard/courses/staging");
  await p.getByRole("heading", { name: "課表", exact: true }).waitFor();
  await p.evaluate(() => (window.__variantsDocument = "same"));
  if (!resume) {
    await schedule("每週固定", "10:00", "開放選課");
    await schedule("隔週固定", "13:00", "開放選課");
    await schedule("隔週固定", "14:00", "指定學員");
    await schedule("體驗", "17:00", "指定學員");
    await schedule("體驗", "19:00", "開放選課");
    await schedule("空間出租", "21:00");
    await p.getByRole("button", { name: "收費方式", exact: true }).click();
    await p
      .getByRole("button", { name: "＋新增收費方式", exact: true })
      .click();
    await p
      .getByLabel("運動", { exact: true })
      .selectOption({ label: "遠端肌力驗收" });
    await p.getByLabel("收費名稱", { exact: true }).fill("遠端十點每堂兩點");
    await p.getByLabel("計費單位", { exact: true }).selectOption("點數");
    await p.getByLabel("點數方案每堂扣抵（點）", { exact: true }).fill("2");
    await p.getByRole("checkbox", { name: "驗收老闆", exact: true }).check();
    await save();
    await p
      .getByRole("row")
      .filter({ hasText: "遠端十點每堂兩點" })
      .getByRole("button", { name: "購買", exact: true })
      .click();
    await p
      .getByLabel("購買學員", { exact: true })
      .selectOption("sports-live-customer");
    await save();
    await p.getByRole("button", { name: "課表", exact: true }).click();
    await schedule("單次", "15:00", "指定學員", "遠端十點每堂兩點 · 點數");
  }
  let d = await detail("15:00");
  if (!resume) {
    let response = p.waitForResponse((r) =>
      r.request().postData()?.includes('\"operation\":\"attendance\"'),
    );
    await d.getByRole("button", { name: "標記出席", exact: true }).click();
    await p.getByText("運動驗收學員 · ATTENDED", { exact: true }).waitFor();
    assert.equal(lastAttendance.success, true);
    pass("點數方案出席，實際交易成功");
    if (process.env.SPORTS_PAUSE_POINT_CHECK === "1") {
      writeFileSync("/tmp/sports-point-attended.ready", "ready");
      for (
        let i = 0;
        i < 120 && !existsSync("/tmp/sports-point-attended.checked");
        i++
      )
        await new Promise((r) => setTimeout(r, 500));
      assert.ok(
        existsSync("/tmp/sports-point-attended.checked"),
        "Point database checkpoint required",
      );
    }
  } else {
    const checkpoint = JSON.parse(
      readFileSync(out + "/point-attendance-db.json", "utf8"),
    );
    assert.equal(checkpoint.remaining, 8);
    assert.equal(checkpoint.pointCost, 2);
    await p.getByText("運動驗收學員 · ATTENDED", { exact: true }).waitFor();
    pass("點數方案出席扣兩點，資料庫確認餘額八點");
  }
  await d.getByRole("button", { name: "取消預約", exact: true }).click();
  await p.getByText("運動驗收學員 · CANCELLED", { exact: true }).waitFor();
  assert.equal(lastAttendance.success, true);
  pass("點數方案出席後取消，業務回應成功");
  assert.equal(await p.evaluate(() => window.__variantsDocument), "same");
  for (const op of ["schedule", "purchase", "attendance"])
    assert.ok(actions.some((a) => a.operation === op));
  assert.ok(actions.every((a) => a.result.success));
  await p.screenshot({ path: out + "/point-cancelled.png" });
  pass("五種排課類型與兩種參加方式補驗完成");
} catch (e) {
  console.error(String(e).split("Call log:")[0]);
  if (p) {
    console.log((await p.locator("body").innerText()).slice(-1800));
    await p.screenshot({ path: out + "/variants-failure.png" }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  writeFileSync(
    out + "/variants-checks.json",
    JSON.stringify({ checks, actions }, null, 2),
  );
  await browser?.close();
}
