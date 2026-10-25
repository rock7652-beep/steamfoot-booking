// Synthetic UI only. No sessions, customer data, database or LINE requests.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url), { chromium } = require("playwright");
const root = process.cwd(), output = "/tmp/course-line-setup-qa", origin = "http://localhost:3131";
mkdirSync(output, { recursive: true });
const rows = [
  ["myguitar", "買吉他"], ["silverlily", "銀百合音樂/舞蹈"], ["youngsky", "YoungSky體重管理俱樂部"],
  ["ido-xinzhuang", "IDO新莊館"], ["ido-banqiao", "IDO板橋館"],
].map(([storeSlug, storeName]) => ({ storeSlug, storeName, status: "NOT_CONFIGURED" }));
const fixture = "import React from 'react';import {createRoot} from 'react-dom/client';import {LineOfficialAccountsCard} from './src/app/(dashboard)/dashboard/settings/line-official-accounts/line-official-accounts-card';import {buildStoreLineWelcome} from './src/lib/store-line-welcome';const rows=" + JSON.stringify(rows) +
 ";const music=buildStoreLineWelcome([{name:'範例音樂教室',slug:'example-music',shopConfig:{shopPhone:'02-00000000',address:'範例地址',mapUrl:null}}],'https://example.invalid');const shared=buildStoreLineWelcome([{name:'範例新莊館',slug:'example-a'},{name:'範例板橋館',slug:'example-b'}],'https://example.invalid');createRoot(document.getElementById('root')).render(<main className=\"mx-auto max-w-3xl space-y-5 p-4\"><p>隔離預覽：範例狀態，不代表正式連線或訊息已送達。</p><h1 className=\"text-xl font-semibold\">音樂／運動官方 LINE</h1><LineOfficialAccountsCard initialStatuses={rows}/><section><h2>單店歡迎訊息範例</h2><pre className=\"whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-sm leading-7\">{music[0].text}</pre></section><section><h2>共用官方帳號範例</h2><pre className=\"whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-sm leading-7\">{shared[0].text}</pre></section></main>);";
await build({ stdin: { contents: fixture, resolveDir: root, loader: "tsx" },
  bundle: true, format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"), alias: { "@": path.join(root, "src") },
  define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "no-server", setup(builder) {
    builder.onResolve({ filter: /^@\/server\// }, () => ({ path: "action", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function checkAllLineOfficialAccounts(){return {success:true,data:" + JSON.stringify(rows.map(r => ({ ...r, status: "NEEDS_ATTENTION" }))) + "}}", loader: "js" }));
  } }],
});
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css);
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors = [], sizes = [];
try {
  const page = await browser.newPage(); page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", route => route.request().url() === origin + "/" ? route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' }) : route.abort());
  await page.goto(origin + "/"); await page.addStyleTag({ path: path.join(output, "fixture.css") }); await page.addScriptTag({ path: path.join(output, "fixture.js") });
  await page.getByRole("button", { name: "重新驗證", exact: true }).waitFor();
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1366, 900]]) {
    await page.setViewportSize({ width, height });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error("Overflow at " + width);
    for (const row of rows) await page.getByText(row.storeName, { exact: true }).waitFor();
    const button = page.getByRole("button", { name: "重新驗證", exact: true });
    if ((await button.boundingBox()).height < 44) throw Error("Recheck target too small");
    await page.screenshot({ path: path.join(output, "preview-" + width + ".png"), fullPage: true }); sizes.push({ width, height, overflow: false, allStores: true });
  }
  await page.getByRole("button", { name: "重新驗證", exact: true }).click();
  await page.getByText("⚠️ 需檢查", { exact: true }).first().waitFor();
  if (await page.getByText("⚠️ 需檢查", { exact: true }).count() !== 5) throw Error("Mock recheck did not update all rows");
  if (errors.length) throw Error(errors.join("; "));
  const result = { synthetic: true, actualDatabase: false, actualLINE: false, errors, sizes, mockRecheck: "passed" };
  writeFileSync(path.join(output, "results.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
