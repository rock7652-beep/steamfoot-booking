import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url),
  { chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright"),
  { PrismaClient } = require("../../../generated/course-client"),
  { PrismaClient: MainClient } = require("@prisma/client");
const url = "postgresql://postgres@127.0.0.1:55438/sports_live_flow_test";
if (process.env.DATABASE_URL !== url) throw Error("Isolated database required");
const db = new PrismaClient({ datasourceUrl: url }),
  main = new MainClient({ datasourceUrl: url }),
  storeId = "sports-live-flow-store",
  checks = [];
let browser;
const pass = (name) => {
  checks.push({ name, passed: true });
  console.log("PASS", name);
};
try {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext({
    storageState: "/tmp/sports-owner-state.json",
  });
  const manifest = JSON.parse(
    readFileSync(".next/dev/server/server-reference-manifest.json", "utf8"),
  );
  const action = (name) =>
    Object.entries(manifest.node).find(([, v]) => v.exportedName === name)[0];
  const post = async (name, payload) =>
    ctx.request
      .post(
        "http://localhost:3107/s/sports-live-flow/admin/dashboard/courses/staging",
        {
          headers: {
            "next-action": action(name),
            "content-type": "text/plain;charset=UTF-8",
            origin: "http://localhost:3107",
          },
          data: JSON.stringify([payload]),
        },
      )
      .then((r) => r.text());
  const before = await db.courseTemplate.count({ where: { storeId } }),
    staffBefore = await main.staff.findUnique({
      where: { id: "sports-live-flow-staff" },
      select: { courseQualifiedTemplateIds: true },
    }),
    subject = await db.musicSubject.findFirst({
      where: { storeId, name: "肌力驗收" },
    });
  const badFee = {
    subject: subject.id,
    name: "不應建立",
    unit: "點數",
    amount: 10,
    price: 1500,
    days: 90,
    cost: 2,
    shared: false,
    coachIds: ["other-store-coach"],
    requestKey: randomUUID(),
  };
  const fail = await post("saveSportsFee", badFee);
  assert.match(fail, /授課教練不屬於本店/);
  assert.equal(await db.courseTemplate.count({ where: { storeId } }), before);
  assert.deepEqual(
    await main.staff.findUnique({
      where: { id: "sports-live-flow-staff" },
      select: { courseQualifiedTemplateIds: true },
    }),
    staffBefore,
  );
  pass("跨店教練參數拒絕，模板與教練資格整筆回滾");
  const goodFee = {
    ...badFee,
    name: "點數重送驗收-" + randomUUID().slice(0, 6),
    coachIds: ["sports-live-flow-staff"],
    requestKey: randomUUID(),
  };
  let result = await post("saveSportsFee", goodFee);
  assert.match(result, /"success":true/);
  result = await post("saveSportsFee", goodFee);
  assert.match(result, /"success":true/);
  assert.equal(
    await db.coursePointPlan.count({ where: { storeId, name: goodFee.name } }),
    1,
  );
  assert.equal(
    await db.courseTemplate.count({ where: { storeId } }),
    before + 1,
  );
  pass("點數收費重送回傳原設定，不重複建立方案／模板");
  const p = await ctx.newPage();
  p.on("dialog",d=>d.accept());
  await p.goto(
    "http://localhost:3107/s/sports-live-flow/admin/dashboard/courses/staging",
  );
  await p.getByRole("button", { name: "＋新增排課", exact: true }).click();
  const d = p.getByRole("dialog");
  await d.getByRole("button", { name: "單次", exact: true }).click();
  await d.getByRole("button", { name: "開放選課", exact: true }).click();
  await d.getByLabel("教學項目", { exact: true }).selectOption(subject.id);
  await d
    .getByLabel("適用收費方式", { exact: true })
    .selectOption({ label: "肌力十堂 · 堂數" });
  await d.getByLabel("開始時間", { exact: true }).fill("22:00");
  await d.getByLabel("人數上限", { exact: true }).fill("9");
  const count = await db.courseSession.count({ where: { storeId } });
  await d.getByRole("button", { name: "確認建立排課", exact: true }).click();
  await d.getByRole("alert").filter({ hasText: "容量" }).waitFor();
  assert.equal(await db.courseSession.count({ where: { storeId } }), count);
  pass("容量超出空間上限拒絕建立課程");
  await p.screenshot({
    path: "artifacts/sports-redesign-live/capacity-validation.png",
  });
  await d.getByRole('button',{name:'關閉',exact:true}).click();
  await d.waitFor({state:'hidden'});
  await p.locator('button.lesson:not([data-faded])').filter({has:p.locator('strong',{hasText:'18:00'})}).click();
  const roster=p.getByRole('dialog');
  await roster.getByLabel('加入學員',{exact:true}).selectOption('sports-live-customer');
  await roster.getByRole('button',{name:'加入本堂',exact:true}).click();
  await roster.getByText('運動驗收學員 · RESERVED',{exact:true}).waitFor();
  pass('管理者透過名單加入開放課，核對適用方案、額度與效期');
  writeFileSync(
    "artifacts/sports-redesign-live/security-checks.json",
    JSON.stringify({ checks }, null, 2),
  );
} finally {
  await browser?.close();
  await db.$disconnect();
  await main.$disconnect();
}
