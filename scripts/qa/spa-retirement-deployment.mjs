// Browser and HTTP checks of the exact read-only deployment. Authentication, if
// needed, is supplied over stdin and stays in memory; never print cookie/token values.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const origin = new URL(process.env.QA_PREVIEW_URL).origin;
let shareUrl;
if (process.env.QA_AUTH_STDIN === "1") {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.includes("\n")) break;
  }
  shareUrl = input.trim();
  if (new URL(shareUrl).origin !== origin) throw new Error("Authentication origin mismatch");
}
const out = process.env.QA_OUTPUT || "/tmp/steamfoot-spa-deployment";
mkdirSync(out, { recursive: true });
const proxyUrl = ["127.0.0.1", "localhost"].includes(new URL(origin).hostname) ? undefined : process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu"], headless: true,
  ...(proxyUrl ? { proxy: { server: proxyUrl } } : {}),
});
const context = await browser.newContext();
const results = [];
try {
  if (shareUrl) {
    const page = await context.newPage();
    await page.goto(shareUrl);
    await page.close();
  }
  for (const [path, expected] of [
    ["/pricing/features/slots", 200], ["/pricing/features/music", 200], ["/pricing/features/fitness", 200],
    ["/spa-preview", 410], ["/s/demo/admin/dashboard/spa-schedule", 410], ["/api/spa/settings/service", 410],
    ["/pricing/features/services", 410], ["/hq/dashboard", 404], ["/api/auth/session", 404],
  ]) {
    const response = await context.request.get(origin + path);
    const status = response.status();
    results.push({ path, expected, status, pass: status === expected });
  }
  for (const path of ["/spa-retirement-preview", "/pricing/submit", "/api/line/webhook"]) {
    const response = await context.request.post(origin + path, { data: {} });
    results.push({ path, method: "POST", expected: 405, status: response.status(), pass: response.status() === 405 });
  }
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1366, 900], [1920, 1080]]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(origin + "/spa-retirement-preview");
    await page.getByRole("heading", { name: "模組調整預覽", exact: true }).waitFor();
    for (const label of ["音樂教室", "運動教室", "時段模組（蒸足）"]) {
      const option = page.getByRole("radio", { name: new RegExp(label.replace(/[（）]/g, "\\$&")) });
      await option.click();
      if (await option.getAttribute("aria-checked") !== "true") throw new Error("Module selection failed");
    }
    const disabled = await page.getByRole("button", { name: "預覽中不會建立店舖", exact: true }).isDisabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const text = await page.locator("body").innerText();
    const pass = response.status() === 200 && disabled && !overflow && !text.includes("SPA") && !errors.length;
    results.push({ path: "/spa-retirement-preview", width, height, disabled, overflow, errors, pass });
    await page.screenshot({ path: `${out}/review-${width}x${height}.png`, fullPage: true });
    await page.close();
  }
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/apply");
  const options = await page.locator("#field-industry option").allTextContents();
  await page.locator("#field-industry").selectOption({ label: "音樂／才藝／教育服務" });
  const classroom = await page.locator("#courseFormat").isEnabled();
  await page.locator("#field-industry").selectOption({ label: "時段預約／蒸足" });
  const slots = await page.locator("#courseFormat").isDisabled();
  results.push({ path: "/apply", options, classroom, slots, pass: options.length === 4 && !options.some(v => v.includes("SPA")) && classroom && slots });
  await page.screenshot({ path: `${out}/apply-390.png`, fullPage: true });
  await page.close();
  writeFileSync(`${out}/results.json`, JSON.stringify({ origin, results }, null, 2));
  console.log(JSON.stringify({ origin, results }));
  if (results.some(result => !result.pass)) process.exitCode = 1;
} finally {
  await context.close(); await browser.close();
}
