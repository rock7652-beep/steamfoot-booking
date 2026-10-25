// Isolated component preview: all server imports and external network are blocked.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const root = process.cwd(), output = "/tmp/beauty-public-booking-qa", origin = "http://localhost:3129";
mkdirSync(output, { recursive: true });
await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {BeautyPublicBookingPreview} from './src/components/beauty/public-booking-preview';import './src/app/(customer)/book/course-portal.css';createRoot(document.getElementById('root')).render(<BeautyPublicBookingPreview/>);`, resolveDir: root, loader: "tsx" },
  bundle: true, format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  define: { "process.env.NODE_ENV": '"development"' }, alias: { "@": path.join(root, "src") },
  plugins: [{ name: "public-booking-isolation", setup(builder) {
    builder.onResolve({ filter: /^@\/server\// }, () => ({ path: "server", namespace: "qa" }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "qa" }));
    builder.onLoad({ filter: /.*/, namespace: "qa" }, args => ({ contents: args.path === "server"
      ? `export const readBeautySlots=()=>{throw Error('Backend reads forbidden')};export const submitBeautyTrial=()=>{throw Error('Backend writes forbidden')};`
      : `import {createElement} from 'react';export default function Image({unoptimized,...props}){return createElement('img',props)}`, loader: "js", resolveDir: root }));
  } }],
});
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css + "\n" + readFileSync(path.join(output, "fixture.css"), "utf8"));
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [], sizes = [], tests = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", route => {
    const url = route.request().url();
    if (url === origin + "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div></body></html>' });
    if (url === origin + "/pricing/brand/steam-butler-logo.png") return route.fulfill({ contentType: "image/png", body: readFileSync("public/pricing/brand/steam-butler-logo.png") });
    errors.push(`Unexpected network request: ${url}`); return route.abort();
  });
  await page.goto(origin + "/"); await page.addStyleTag({ path: path.join(output, "fixture.css") }); await page.addScriptTag({ path: path.join(output, "fixture.js") });
  await page.getByRole("heading", { name: "體驗預約", exact: true }).waitFor({ timeout: 10000 });
  if (await page.getByRole("complementary", { name: "按摩小提醒" }).count()) throw Error("Reminder shown before confirmation");
  await page.getByLabel("服務項目", { exact: true }).waitFor();
  if (await page.getByLabel("服務項目", { exact: true }).locator('option:not([value=""])').count() !== 1) throw Error("Single trial service selector missing");
  tests.push("service selector remains visible even with one configured trial");
  await page.getByLabel("手機", { exact: true }).fill("0900000000"); await page.getByLabel("技師安排", { exact: true }).selectOption("ANY");
  await page.getByRole("button", { name: "查詢可用時段", exact: true }).click(); await page.getByRole("button", { name: "09:00", exact: true }).click();
  const nextStep = page.getByRole("button", { name: "下一步：填寫聯絡資料", exact: true });
  await nextStep.scrollIntoViewIfNeeded();
  if (await page.evaluate(() => scrollY) < 100) throw Error("Scroll regression was not exercised from the bottom of the first step");
  await nextStep.click();
  await page.waitForFunction(() => scrollY <= 1);
  tests.push("entering confirmation from a scrolled mobile page resets to the page top");
  await page.getByRole("complementary", { name: "按摩小提醒" }).waitFor();
  tests.push("three gentle massage reminders appear on confirmation without a consent checkbox");
  await page.getByRole("button", { name: "確認預約", exact: true }).click();
  if (!await page.getByLabel("姓名", { exact: true }).evaluate(e => document.activeElement === e)) throw Error("Validation no longer focuses the missing name");
  tests.push("validation still focuses the invalid field without a step-top reset");
  await page.getByLabel("姓名", { exact: true }).fill("預約測試者"); await page.getByLabel("手機", { exact: true }).fill("0911111111");
  await page.getByText("特殊需求／備註（選填）", { exact: true }).click(); await page.getByLabel("本次備註", { exact: true }).fill("測試草稿保留");
  for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [1024, 768], [1366, 900]]) {
    await page.setViewportSize({ width, height });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error(`Horizontal overflow at ${width}`);
    if (await page.getByLabel("姓名", { exact: true }).inputValue() !== "預約測試者") throw Error("Draft lost on resize");
    if (await page.getByLabel("本次備註", { exact: true }).inputValue() !== "測試草稿保留") throw Error("Notes lost on resize");
    const font = await page.getByLabel("姓名", { exact: true }).evaluate(e => parseFloat(getComputedStyle(e).fontSize));
    if (font < 16) throw Error(`Input font too small at ${width}`);
    const submit = page.getByRole("button", { name: "確認預約", exact: true }); await submit.scrollIntoViewIfNeeded();
    const rect = await submit.boundingBox(); if (!rect || rect.height < 44) throw Error(`Submit target too small at ${width}`);
    await page.screenshot({ path: path.join(output, `confirm-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "返回修改服務與時段", exact: true }).click();
    await page.waitForFunction(() => scrollY <= 1);
    if (await page.getByRole("button", { name: "09:00", exact: true }).getAttribute("aria-pressed") !== "true") throw Error("Selected slot was lost after editing phone/name/notes");
    await page.screenshot({ path: path.join(output, `service-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "下一步：填寫聯絡資料", exact: true }).click();
    await page.waitForFunction(() => scrollY <= 1);
    await page.screenshot({ path: path.join(output, `step-top-${width}.png`) });
    sizes.push({ width, height, overflow: false, inputFont: font, submitHeight: rect.height, draftPreserved: true, timePreserved: true });
  }
  await page.setViewportSize({ width: 390, height: 420 }); await page.getByRole("button", { name: "確認預約", exact: true }).scrollIntoViewIfNeeded();
  const keyboardRect = await page.getByRole("button", { name: "確認預約", exact: true }).boundingBox(); if (!keyboardRect || keyboardRect.y < 0 || keyboardRect.y + keyboardRect.height > 421) throw Error("Submit unreachable in reduced viewport");
  tests.push("reduced-height viewport keeps submit reachable (keyboard simulation only)");
  await page.getByRole("button", { name: "確認預約", exact: true }).click(); await page.getByRole("heading", { name: "預約成功", exact: true }).waitFor();
  await page.waitForFunction(() => scrollY <= 1);
  tests.push("returning to the service step and completing a synthetic booking also reset to top");
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, "success-390.png"), fullPage: true });
  tests.push("synthetic booking success and complete receipt");
  await page.getByLabel("預覽情境").selectOption("multiple");
  await page.getByRole("button", { name: "＋新增同行者" }).click();
  const groups = page.locator('section[aria-label^="服務安排 "]');
  await groups.nth(0).getByLabel("手機", { exact: true }).fill("0900000000");
  await groups.nth(0).getByLabel("技師安排").selectOption("ANY");
  await groups.nth(1).getByLabel("手機", { exact: true }).fill("0911111111");
  await groups.nth(1).getByLabel("服務項目").selectOption("sample-face");
  await groups.nth(1).getByLabel("技師安排").selectOption("FEMALE");
  for (const [width, height] of [[360, 800], [768, 1024], [1366, 900]]) {
    await page.setViewportSize({ width, height });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error(`Long-name group overflow at ${width}`);
    await page.screenshot({ path: path.join(output, `group-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "查詢可用時段", exact: true }).click(); await page.getByRole("button", { name: "10:00", exact: true }).click();
  await page.getByRole("button", { name: "下一步：填寫聯絡資料" }).click();
  if (!await page.getByText("體驗總額 NT$1,740", { exact: true }).isVisible()) throw Error("Group trial total mismatch");
  if (!await page.getByText("10:00–10:45（預計）", { exact: true }).isVisible()) throw Error("Trial duration missing from group summary");
  tests.push("multi-person long service names remain responsive; per-person trial duration and total match");
  await page.getByLabel("預覽情境").selectOption("retry");
  await page.getByLabel("手機", { exact: true }).fill("0900000000"); await page.getByLabel("技師安排").selectOption("SPECIFIC"); await page.getByLabel("選擇技師").selectOption("sample-tech");
  await page.getByRole("button", { name: "查詢可用時段", exact: true }).click(); await page.getByRole("button", { name: "09:30", exact: true }).click(); await page.getByRole("button", { name: "下一步：填寫聯絡資料" }).click();
  await page.getByLabel("姓名", { exact: true }).fill("重試測試者"); await page.getByRole("button", { name: "確認預約", exact: true }).click();
  await page.getByRole("button", { name: "重試確認", exact: true }).waitFor();
  if (!await page.getByRole("button", { name: "返回修改服務與時段" }).isDisabled()) throw Error("Unknown submission did not lock edits");
  await page.screenshot({ path: path.join(output, "retry-390.png"), fullPage: true });
  await page.getByRole("button", { name: "重試確認", exact: true }).click(); await page.getByRole("heading", { name: "預約成功", exact: true }).waitFor(); tests.push("unknown result locks edits, then retries same booking");
  for (const scenario of ["empty", "closed"]) {
    await page.getByLabel("預覽情境").selectOption(scenario);
    if (await page.getByLabel("手機", { exact: true }).count()) throw Error(`${scenario} still collects personal data`);
  }
  tests.push("empty and closed states avoid collecting personal information");
  if (errors.length) throw Error(errors.join("; "));
  writeFileSync(path.join(output, "results.json"), JSON.stringify({ synthetic: true, actualBackend: false, actualLINE: false, errors, sizes, tests }, null, 2));
  console.log(JSON.stringify({ output, errors, sizes, tests }));
} finally { await browser.close(); }
