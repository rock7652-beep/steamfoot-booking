// Local, synthetic component preview. Does not import auth, a database or any server action.
// npm ci --ignore-scripts && node scripts/customer-consumption-preview.mjs
// For automated checks, install playwright-core separately and pass --check.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "artifacts/customer-consumption");
await mkdir(output, { recursive: true });
const navigation = `
  import {useSyncExternalStore} from 'react';
  const subscribe=cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)};
  export const usePathname=()=>window.location.pathname;
  export const useRouter=()=>({push:(url)=>{history.pushState({},'',url);window.dispatchEvent(new Event('popstate'))}});
  export const useFixtureQuery=()=>useSyncExternalStore(subscribe,()=>window.location.search,()=> '');
`;
const link = `
  import {createElement} from 'react';
  export const useLinkStatus=()=>({pending:false});
  export default function Link({prefetch,children,onClick,...props}){return createElement('a',{...props,onClick:e=>{onClick?.(e);if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey&&props.href?.includes('/growth/consumption')){e.preventDefault();history.pushState({},'',props.href);window.dispatchEvent(new Event('popstate'))}}},children)};
`;
const entry = `
  import React from 'react'; import {createRoot} from 'react-dom/client';
  import {useFixtureQuery} from 'next/navigation';
  import {ConsumptionFiltersForm} from './src/app/(dashboard)/dashboard/growth/consumption/consumption-filters';
  import {ConsumptionResults} from './src/app/(dashboard)/dashboard/growth/consumption/consumption-results';
  import {PageShell,PageHeader} from './src/components/desktop';
  import {CustomerGrowthTabLink} from './src/components/customer-growth-tab-link';
  import {parseConsumptionFilters,consumptionMetrics} from './src/lib/customer-consumption';
  const options=[{id:'session',name:'團體課程十堂卡・含贈課與延長效期的長名稱收費方式',unit:'SESSION'},{id:'point',name:'自由選課點數',unit:'POINT'},{id:'grid',name:'格數方案',unit:'GRID'}];
  const base=Array.from({length:50},(_,i)=>({id:'fixture-'+i,name:i===0?'王小姐・長名稱測試・共享方案顧客':('測試顧客 '+String(i).padStart(2,'0')),phone:'090000'+String(i).padStart(4,'0'),count:i%7,sessions:i%7,grids:i%3,points:i%12,amount:i*100,paid:i*500,balances:'團體課程十堂卡（共卡）：剩餘 8 堂／到期 2027-01-01；自由選課點數：剩餘 15 點／到期 2027-03-01'}));
  function App(){
    const search=useFixtureQuery(),params=Object.fromEntries(new URLSearchParams(search));
    let filters,error;try{filters=parseConsumptionFilters(params,'2026-10-20')}catch(e){filters=parseConsumptionFilters({},'2026-10-20');error=e.message}
    let rows=base.filter(row=>(!filters.q||row.name.includes(filters.q)||row.phone.includes(filters.q))&&Object.entries(filters.ranges).every(([key,range])=>(range.min===undefined||row[key]>=range.min)&&(range.max===undefined||row[key]<=range.max)));
    rows.sort((a,b)=>(a[filters.sort]-b[filters.sort])*(filters.direction==='asc'?1:-1)||a.name.localeCompare(b.name));
    const matched=rows.length;if(filters.top)rows=rows.slice(0,filters.top);
    const metrics=consumptionMetrics(options);
    return <div className="flex min-h-screen bg-earth-50 text-earth-900"><aside className="hidden w-60 shrink-0 border-r border-earth-200 bg-white p-4 lg:block"><strong>蒸管家</strong><p className="mt-8 rounded-lg bg-primary-100 p-3 text-sm">顧客經營</p></aside><main className="min-w-0 flex-1 p-3 sm:p-6"><p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">元件預覽・合成資料・未連接登入與資料庫</p><nav className="flex flex-wrap gap-1 border-b border-earth-200" aria-label="顧客經營分類">{[['care','顧客關懷','/dashboard/growth'],['consumption','期間消耗統計','/dashboard/growth/consumption'],['leads','數位管家名單','/dashboard/digital-butler/leads']].map(([id,label,href])=><CustomerGrowthTabLink key={id} id={id} href={href} label={label} active="care" />)}</nav><PageShell compact><PageHeader compact title="期間消耗統計"/><ConsumptionFiltersForm key={search} filters={filters} params={params} options={options} metrics={metrics} error={error}/>{!error&&<ConsumptionResults rows={rows} total={rows.length} matched={matched} page={1} filters={filters} metrics={metrics} canExport={!params.noExport} courseMode/>}</PageShell></main></div>
  }createRoot(document.getElementById('root')).render(<App/>);
`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, write: false,
  outfile: path.join(output, "preview.js"), format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "synthetic-next-navigation", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "next/link" ? link : navigation, loader: "js", resolveDir: root }));
  } }],
});
const css = await postcss([tailwind({ base: root })]).process(await readFile(path.join(root, "src/app/globals.css"), "utf8"), { from: path.join(root, "src/app/globals.css") });
const jsContent = bundle.outputFiles.find(file => file.path.endsWith(".js")).contents;
const cssContent = css.css + "\n" + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "");
const html = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>期間消耗統計・合成資料預覽</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>';
await Promise.all([writeFile(path.join(output, "preview.html"), html), writeFile(path.join(output, "preview.css"), cssContent), writeFile(path.join(output, "preview.js"), jsContent)]);
const server = createServer((request, response) => {
  const file = request.url?.split("?")[0];
  if (file === "/preview.css") { response.setHeader("Content-Type", "text/css"); response.end(cssContent); }
  else if (file === "/preview.js") { response.setHeader("Content-Type", "application/javascript"); response.end(jsContent); }
  else { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(html); }
});
await new Promise(resolve => server.listen(4305, "127.0.0.1", resolve));
console.log("Synthetic component preview: http://127.0.0.1:4305/s/fixture/admin/dashboard/growth/consumption");
if (process.argv.includes("--check")) {
  let playwright;
  try { playwright = await import("playwright-core"); }
  catch { playwright = createRequire("/tmp/customer-consumption-preview/package.json")("playwright-core"); }
  const browser = await playwright.chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const evidence = [];
    const url = "http://127.0.0.1:4305/s/fixture/admin/dashboard/growth/consumption";
    for (const [width, height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[600,900],[390,844]]) {
      await page.setViewportSize({ width, height }); await page.goto(url);
      await page.getByRole("button", { name: "查詢", exact: true }).waitFor();
      await page.getByRole("button", { name: /^篩選/ }).click();
      await page.getByRole("spinbutton", { name: "消耗次數最低值", exact: true }).fill("2");
      await page.getByRole("button", { name: "套用篩選", exact: true }).click();
      await page.waitForURL(/count_min=2/);
      await page.getByRole("combobox", { name: "排序方式", exact: true }).selectOption("count:asc");
      await page.getByRole("button", { name: "查詢", exact: true }).click();
      await page.waitForURL(/direction=asc/);
      const layout = await page.evaluate(() => {const top=document.querySelector("[data-page-shell]").getBoundingClientRect().top;const tableTop=document.querySelector("table").getBoundingClientRect().top;return {tableTop, listFraction:(innerHeight-tableTop)/(innerHeight-top)};});
      if (width>=768 && layout.listFraction<2/3) throw new Error(`List occupies only ${layout.listFraction} at ${width}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error(`Page overflow at ${width}`);
      const exportUrl = await page.getByRole("link", { name: "匯出名單 CSV" }).getAttribute("href");
      if (!exportUrl.includes("count_min=2") || !exportUrl.includes("direction=asc")) throw new Error("Export lost filters");
      const selected = await page.locator('nav[aria-label="顧客經營分類"] [aria-current="page"]').textContent();
      if (selected !== "期間消耗統計") throw new Error("Wrong active navigation");
      await page.locator('table').evaluate(table => { table.parentElement.scrollLeft = 0; });
      await page.screenshot({ path: path.join(output, `${width}x${height}.png`), fullPage: false });
      evidence.push({ width, height, ...layout, pageOverflow: overflow, exportPreservesFilters: true, activeNavigation: selected });
    }
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.getByRole("textbox", { name: "搜尋顧客", exact: true }).fill("未送出的草稿");
    await page.setViewportSize({ width: 1024, height: 768 });
    if (await page.getByRole("textbox", { name: "搜尋顧客", exact: true }).inputValue() !== "未送出的草稿") throw new Error("Resize lost draft");
    await page.goto(url + "?preset=custom&startDate=2026-10-21&endDate=2026-10-20");
    await page.getByRole("alert").waitFor();
    await page.goto(url + "?q=沒有這位顧客&noExport=1");
    await page.getByText("沒有符合條件的資料，請調整期間或篩選條件。").waitFor();
    if (await page.getByRole("link", { name: "匯出名單 CSV" }).count()) throw new Error("Unauthorized export shown");
    await page.goto(url);
    await page.getByRole("combobox", { name: "統計期間", exact: true }).selectOption("custom");
    await page.getByLabel("開始日期", { exact: true }).fill("2026-10-01");
    await page.getByLabel("結束日期", { exact: true }).fill("2026-10-20");
    await page.getByRole("combobox", { name: "曠課／請假扣除", exact: true }).selectOption("0");
    await page.getByRole("spinbutton", { name: "取前 N 名", exact: true }).fill("5");
    await page.getByRole("button", { name: "套用篩選", exact: true }).focus(); await page.keyboard.press("Enter");
    await page.waitForURL(/top=5/);
    if (await page.locator('tbody tr').count() !== 5) throw new Error("Top N did not apply");
    if (!page.url().includes("/s/fixture/admin/dashboard/growth/consumption")) throw new Error("Store route prefix lost");
    await page.goto(url);
    await page.getByRole("button", { name: /^篩選/ }).click();
    await page.getByRole("combobox", { name: "篩選項目 1", exact: true }).selectOption("points");
    await page.getByRole("spinbutton", { name: "消耗點數最低值", exact: true }).fill("2");
    await page.getByRole("button", { name: "＋新增條件", exact: true }).click();
    await page.getByRole("spinbutton", { name: "消耗次數最高值", exact: true }).fill("4");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, "filters-390x844.png"), fullPage: false });
    await page.setViewportSize({ width: 1024, height: 768 });
    if (await page.getByRole("spinbutton", { name: "消耗點數最低值", exact: true }).inputValue() !== "2") throw new Error("Modal resize lost draft");
    await page.screenshot({ path: path.join(output, "filters-1024x768.png"), fullPage: false });
    await page.keyboard.press("Escape");
    if (await page.getByRole("dialog").count()) throw new Error("Escape did not close filters");
    await page.getByRole("button", { name: /^篩選/ }).click();
    if (await page.getByRole("spinbutton", { name: "消耗點數最低值", exact: true }).inputValue() !== "2") throw new Error("Closing filters lost draft");
    await page.getByRole("button", { name: "套用篩選", exact: true }).click();
    await page.waitForURL(/points_min=2/);
    if (!page.url().includes("count_max=4")) throw new Error("Dropdown conditions lost AND range");
    if (await page.getByRole("dialog").count()) throw new Error("Applied filters still obscure list");
    if (errors.length) throw new Error(errors.join("\n"));
    await writeFile(path.join(output, "checks.json"), JSON.stringify({ scope: "Synthetic component preview; Next navigation shim; no auth/database", evidence, resizePreservesDraft: true, inlineError: true, emptyState: true, exportHiddenWithoutPermission: true, keyboardSubmit: true, storePrefix: true, topN: true, modalDraftPreserved: true, metricDropdownAndRanges: true, applyReturnsToList: true, consoleErrors: errors }, null, 2));
    console.log("Component checks passed; evidence in artifacts/customer-consumption/checks.json");
  } finally { await browser.close(); server.close(); }
}
