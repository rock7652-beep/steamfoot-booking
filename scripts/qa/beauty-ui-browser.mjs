// Actual React components, synthetic props and blocked business-action imports.
// This checks UI only: no auth, DB, live LINE or production request is exercised.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd(),
  out = process.env.QA_OUTPUT || "/tmp/beauty-ui";
mkdirSync(out, { recursive: true });
const actionSource = readFileSync("src/server/actions/beauty.ts", "utf8");
const names = [...actionSource.matchAll(/export async function (\w+)/g)].map(
  (x) => x[1],
);
const prefix = "\0beauty-review:";
const server = await createServer({
  root,
  configFile: false,
  cacheDir: "/tmp/beauty-vite",
  plugins: [
    react(),
    {
      name: "beauty-isolated-review",
      configureServer(s) {
        s.middlewares.use((req, res, next) => {
          if (req.url === "/" || req.url?.startsWith("/?")) {
            res.setHeader("Content-Type", "text/html");
            s.transformIndexHtml(
              req.url,
              '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/beauty-ui-fixture.tsx"></script></body></html>',
            ).then((h) => res.end(h));
            return;
          }
          next();
        });
      },
      resolveId(id) {
        if (id.startsWith(prefix)) return id;
      },
      load(id) {
        if (id === prefix + "actions")
          return names
            .map(
              (n) =>
                `export async function ${n}(){throw Error('Business writes disabled in UI fixture');}`,
            )
            .join("\n");
        if (id === prefix + "navigation")
          return `export const unstable_rethrow=()=>{};export const useRouter=()=>({refresh(){},push(){},replace(){},prefetch(){}});export const usePathname=()=>'/dashboard/beauty';export const useSearchParams=()=>new URLSearchParams();`;
        if (id === prefix + "link")
          return `export default 'a';export const useLinkStatus=()=>({pending:false});`;
      },
    },
  ],
  optimizeDeps: {
    include: ["react", "react-dom/client", "react-dom", "sonner"],
  },
  resolve: {
    alias: [
      { find: "next/navigation", replacement: prefix + "navigation" },
      { find: "next/link", replacement: prefix + "link" },
      { find: /^@\/server\/actions\/.*/, replacement: prefix + "actions" },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
  css: { postcss: { plugins: [tailwind()] } },
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
let browser;
const results = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.QA_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [360, 740],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole("button", { name: "新增預約", exact: true }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: path.join(out, `dashboard-${width}.png`) });
    await page.getByRole("button", { name: "技師管理", exact: true }).click();
    await page
      .getByRole("button", { name: "新增技師管理", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await page.getByLabel("性別（必填）").inputValue(), "");
    await page.getByLabel("名稱", { exact: true }).fill("保留的技師草稿");
    await page.setViewportSize({ width: height, height: width });
    assert.equal(
      await page.getByLabel("名稱", { exact: true }).inputValue(),
      "保留的技師草稿",
    );
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: path.join(out, `technician-${width}.png`) });
    await page.goto(url + "?front=1");
    await page.getByLabel("預約人數").selectOption("2");
    assert.equal(
      await page.getByLabel("技師性別（必選）").first().inputValue(),
      "",
    );
    assert.equal(
      await page.getByLabel("技師性別（必選）").nth(1).inputValue(),
      "",
    );
    await page.getByLabel("服務項目").nth(1).selectOption("massage");
    await page.getByLabel("技師性別（必選）").first().selectOption("FEMALE");
    await page.getByLabel("技師性別（必選）").nth(1).selectOption("MALE");
    assert.equal(
      await page.getByLabel("指定技師（選填）").first().inputValue(),
      "",
    );
    assert.equal(
      await page
        .getByLabel("指定技師（選填）")
        .nth(1)
        .locator("option")
        .count(),
      2,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: path.join(out, `party-${width}.png`) });
    await page.goto(url + "?front=portal");
    await page.getByRole("button", { name: "改期", exact: true }).click();
    await page
      .getByRole("heading", { name: "改期｜合成顧客・保濕做臉", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: path.join(out, `reschedule-${width}.png`) });
    await page.goto(url + "?front=work");
    await page.getByRole("button", { name: "服務完成", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "立即預約", exact: true }).count(),
      0,
    );
    await page.screenshot({ path: path.join(out, `work-${width}.png`) });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      result: "passed",
      scope: "synthetic UI only",
    });
    await page.close();
  }
  writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  await server.close();
}
