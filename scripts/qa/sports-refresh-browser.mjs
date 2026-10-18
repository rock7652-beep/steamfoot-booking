// Real calendar browser checks with an explicit synthetic HTTP refresh boundary.
// No authentication, production routes, or business writes are exercised here.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd(), out = path.resolve(process.env.QA_OUTPUT || "/tmp/sports-refresh-browser");
mkdirSync(out, { recursive: true });
let revision = 0;
const prefix = "\0sports-refresh:";
const actionNames = new Set();
for (const name of readdirSync(path.join(root, "src/server/actions"))) {
  if (!name.endsWith(".ts")) continue;
  const source = readFileSync(path.join(root, "src/server/actions", name), "utf8");
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)) actionNames.add(match[1]);
}
const navigation = `
  const router={refresh(){globalThis.__qaRefreshes=(globalThis.__qaRefreshes||0)+1;
    fetch('/__qa/snapshot',{cache:'no-store'}).then(r=>r.json()).then(detail=>window.dispatchEvent(new CustomEvent('qa:snapshot',{detail})));},
    push(){throw Error('Unexpected navigation');},replace(){throw Error('Unexpected navigation');},prefetch(){}};
  export const useRouter=()=>router;
  export const usePathname=()=>'/s/synthetic/admin/dashboard/courses';
  export const useSearchParams=()=>new URLSearchParams(window.location.search);
  export const unstable_rethrow=()=>{};
`;
const server = await createServer({ root, configFile: false, cacheDir: "/tmp/sports-refresh-vite", optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "sonner", "zod"] }, plugins: [react(), {
  name: "sports-refresh-fixture-boundary",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/__qa/snapshot") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ revision })); return; }
      if (req.url === "/" || req.url?.startsWith("/?")) {
        res.setHeader("Content-Type", "text/html");
        server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/sports-refresh-fixture.tsx"></script></body></html>').then(html => res.end(html)); return;
      }
      next();
    });
  },
  resolveId(id) { if (id.startsWith(prefix)) return id; },
  load(id) {
    if (id === prefix + "navigation") return navigation;
    if (id === prefix + "link") return 'export default "a"; export const useLinkStatus=()=>({pending:false});';
    if (id === prefix + "actions") return [...actionNames].map(name => `export const ${name}=async()=>{throw Error('Business action disabled in synthetic fixture: ${name}')};`).join("\n");
  },
}], resolve: { alias: [
  { find: "next/navigation", replacement: prefix + "navigation" },
  { find: "next/link", replacement: prefix + "link" },
  { find: /^@\/server\/actions\/.*$/, replacement: prefix + "actions" },
  { find: "@", replacement: path.join(root, "src") },
] }, css: { postcss: { plugins: [tailwind()] } }, server: { host: "127.0.0.1", port: 0 } });
await server.listen();
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_EXECUTABLE || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  for (const [width, height] of [[1366, 900], [1920, 1080], [1024, 768], [768, 1024]]) {
    revision = 0;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-10-17T01:00:00Z") });
    await page.goto(url);
    await page.getByRole("button", { name: "＋ 排課", exact: true }).waitFor();
    const originalUrl = page.url();
    await page.getByLabel("教室篩選").selectOption("room");
    revision = 1;
    await page.clock.runFor(60_000);
    await page.waitForFunction(() => document.querySelector('[data-testid="revision"]')?.textContent === "1");
    await page.getByText(/跨視窗課程 1/).first().waitFor();
    assert.equal(page.url(), originalUrl);
    assert.equal(await page.getByLabel("教室篩選").inputValue(), "room");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow at ${width}`);
    await page.getByRole("button", { name: "＋ 排課", exact: true }).click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    const duration = dialog.locator('input[name="duration"]');
    await duration.fill("75");
    await page.setViewportSize({ width: height, height: width });
    assert.equal(await duration.inputValue(), "75", "draft lost on resize");
    await page.setViewportSize({ width, height });
    const before = await page.evaluate(() => globalThis.__qaRefreshes);
    revision = 2; await page.clock.runFor(60_000);
    assert.equal(await page.evaluate(() => globalThis.__qaRefreshes), before, "parent refresh during scheduling");
    assert.equal(await duration.inputValue(), "75", "draft lost during polling");
    const box = await dialog.boundingBox(); assert.ok(box.x >= -1 && box.x + box.width <= width + 1);
    await page.screenshot({ path: path.join(out, `${width}x${height}-schedule.png`) });
    page.once("dialog", prompt => prompt.accept());
    await page.getByRole("button", { name: "關閉", exact: true }).click();
    await page.clock.runFor(60_000);
    await page.waitForFunction(() => document.querySelector('[data-testid="revision"]')?.textContent === "2");
    await page.getByText(/跨視窗課程 2/).first().waitFor();
    await page.screenshot({ path: path.join(out, `${width}x${height}-calendar.png`) });
    assert.deepEqual(errors, []);
    results.push({ width, height, polling: true, filterPreserved: true, noNavigation: true, noPageOverflow: true, schedulingPaused: true, draftPreserved: true, resizePreserved: true, resumedAfterClose: true });
    await context.close();
  }
  revision = 10;
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const documents = new Map();
  for (const page of pages) {
    await page.addInitScript(() => { globalThis.__qaDocumentToken = crypto.randomUUID(); });
    await page.clock.install({ time: new Date("2026-10-17T01:00:00Z") });
    await page.goto(url); await page.getByRole("button", { name: "＋ 排課", exact: true }).waitFor();
    documents.set(page, await page.evaluate(() => globalThis.__qaDocumentToken));
  }
  revision = 11;
  for (const page of pages) {
    await page.clock.runFor(60_000);
    await page.waitForFunction(() => document.querySelector('[data-testid="revision"]')?.textContent === "11");
    await page.getByText(/跨視窗課程 11/).first().waitFor();
    assert.equal(await page.evaluate(() => globalThis.__qaDocumentToken), documents.get(page));
  }
  results.push({ twoContexts: true, syntheticHttpSnapshotShared: true, bothRefreshed: true, documentReload: false });
  await Promise.all(contexts.map(c => c.close()));
  writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser?.close(); await server.close(); }
