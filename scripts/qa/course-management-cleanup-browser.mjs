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
const root = process.cwd(), out = path.resolve(process.env.QA_OUTPUT || "/tmp/course-management-cleanup-browser");
mkdirSync(out, { recursive: true });
let revision = 0;
const prefix = "\0calendar-customer-preload:";
const actionNames = new Set();
for (const name of readdirSync(path.join(root, "src/server/actions"))) {
  if (!name.endsWith(".ts")) continue;
  const source = readFileSync(path.join(root, "src/server/actions", name), "utf8");
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)) actionNames.add(match[1]);
}
const navigation = `
  import {useSyncExternalStore} from 'react';
  const router={refresh(){globalThis.__qaRefreshes=(globalThis.__qaRefreshes||0)+1;
    fetch('/__qa/snapshot',{cache:'no-store'}).then(r=>r.json()).then(detail=>window.dispatchEvent(new CustomEvent('qa:snapshot',{detail})));},
    push(){throw Error('Unexpected navigation');},replace(){throw Error('Unexpected navigation');},prefetch(){}};
  export const useRouter=()=>router;
  export const usePathname=()=>'/s/synthetic/admin/dashboard/courses';
  let savedSearch,savedParams;
  for(const method of ['pushState','replaceState']){const original=window.history[method].bind(window.history);window.history[method]=(...args)=>{const result=original(...args);window.dispatchEvent(new Event('qa:url'));return result;};}
  const subscribe=listener=>{window.addEventListener('qa:url',listener);return()=>window.removeEventListener('qa:url',listener);};
  export const useSearchParams=()=>{const search=useSyncExternalStore(subscribe,()=>window.location.search,()=>window.location.search);if(savedSearch!==search){savedSearch=search;savedParams=new URLSearchParams(search);}return savedParams;};
  export const unstable_rethrow=()=>{};
`;
const server = await createServer({ root, configFile: false, define:{"process.env":"{}"}, cacheDir: "/tmp/course-management-cleanup-vite", optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "sonner", "zod"] }, plugins: [react(), {
  name: "calendar-customer-preload-fixture-boundary",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/__qa/snapshot") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ revision })); return; }
      if (req.url === "/" || req.url?.startsWith("/?") || req.url?.startsWith("/s/synthetic/admin/dashboard/courses?")) {
        res.setHeader("Content-Type", "text/html");
        server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/course-management-cleanup-fixture.tsx"></script></body></html>').then(html => res.end(html)); return;
      }
      next();
    });
  },
  resolveId(id) { if (id.startsWith(prefix)) return id; },
  load(id) {
    if (id === prefix + "navigation") return navigation;
    if (id === prefix + "link") return 'export default "a"; export const useLinkStatus=()=>({pending:false});';
    if (id === prefix + "actions") return [...actionNames].map(name => `export const ${name}=async(...args)=>globalThis.__qaAction('${name}',args);`).join("\n");
  },
}], resolve: { alias: [
  { find: "next/navigation", replacement: prefix + "navigation" },
  { find: "next/link", replacement: prefix + "link" },
  { find: /^@\/server\/actions\/.*$/, replacement: prefix + "actions" },
  { find: "@", replacement: path.join(root, "src") },
] }, css: { postcss: { plugins: [tailwind()] } }, server: { host: "127.0.0.1", port: 0 } });


await server.listen();
let browser;const results=[],errors=[];
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024]]){
  const page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();if(!url.startsWith(origin))return route.abort();
   if(url.includes('/dashboard/customers/panel-read?')){
    const wallet={id:'wallet',storeId:'synthetic',status:'ACTIVE',plan:{id:'plan',name:'蒸足合成十堂方案',sessionCount:10},purchasedPrice:8000,totalSessions:10,remainingSessions:9,expiryDate:'2027-02-01T00:00:00Z',startDate:'2026-11-01T00:00:00Z',createdAt:'2026-11-01T00:00:00Z',sessions:[],usageProgress:{available:true,total:10,completed:[{id:'lesson',date:'2026-11-12T08:00:00Z'}],voided:[]}};
    return route.fulfill({json:{success:true,data:{customer:{id:'student',storeId:'synthetic',name:'蒸足合成學員',phone:'0900000000',lineUserId:null,lineLinkStatus:'UNLINKED',authSource:'MANUAL',customerStage:'ACTIVE',canReadWallets:true,canReadBookings:true,canAssignPlan:false,canBook:false,canAdjustWallet:false,planWallets:[wallet],_count:{planWallets:1,sponsoredCustomers:0,bookings:1},createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',recentConsumption:null,recentBookings:[],sponsor:null},initialSummary:{next:null,pending:[],healthEnabled:false,health:null,canConfirm:false},plans:[],staffOptions:[],canDiscount:false,canAssign:false,canEditNote:false,readOnly:true}}});
   }
   if(url.includes('/dashboard/courses/roster-customer-read?')){
    const card={id:'card',name:'完整合成十堂方案',unit:'SESSION',remaining:9,available:9,held:0,closed:false,expired:false,expiresAt:'2027-02-01T00:00:00Z',members:[{id:'student',name:'合成學員'}],templateIds:[],entries:[],sessionAdjustments:[]};
    const props={previewStoreId:'synthetic',view:'customers',initialCustomerId:'student',music:true,sportsNative:true,templates:[],people:[{id:'student',name:'合成學員',phone:'0900000000',email:null,birthday:'',notes:null}],customerRows:[],plans:[],cards:[],canEdit:false,canCreate:false,canManageStaff:false,canAssign:false,canReadBookings:true,canReadTransactions:false,healthEnabled:false,canReadCards:true,assignmentStaff:[],canAssignManager:false,initialCardRead:{card,progress:{success:true,data:{available:true,total:10,completed:[{id:'lesson',date:'2026-11-12T08:00:00Z',customerName:'合成學員'}],voided:[],shared:false,canReadPrice:false,purchasePrice:null,purchasedAt:null}}}};
    return route.fulfill({json:{success:true,data:{storeId:'synthetic',recoveryEnabled:false,labelSnapshot:{available:true,enabled:false,canEdit:false,canManage:false,categories:[],labels:[],assignments:{}},workspaceProps:props}}});
   }
   if(url.includes('/dashboard/courses/staff-teaching-read?'))return route.fulfill({json:{success:true,version:'2026-11-12T00:00:00Z',qualificationIds:['template'],fees:[],defaults:[],musicSettings:{defaultRatio:null,subjectRules:{},revision:0}}});
   return route.continue();
  });
  await page.goto(origin+'/s/synthetic/admin/dashboard/courses?kind=management');
  await page.getByRole('button',{name:'蒸足方案預覽',exact:true}).click();
  let steamReads=0;page.on('request',request=>{if(request.url().includes('/customers/panel-read?'))steamReads++;});
  await page.getByRole('button',{name:'預讀蒸足顧客',exact:true}).click();await page.getByRole('button',{name:'蒸足資料已備齊',exact:true}).waitFor();
  await page.getByRole('button',{name:'點開蒸足方案',exact:true}).click();await page.locator('[data-lesson-slot]').first().waitFor();
  assert.equal(steamReads,1);assert.equal(await page.locator('[data-lesson-slot]').count(),10);assert.equal(await page.getByText('讀取顧客資料中…').count(),0);
  await page.screenshot({path:path.join(out,`steam-detail-${width}x${height}.png`)});
  await page.getByRole('button',{name:'← 返回預約',exact:true}).click();
  await page.getByRole('button',{name:'名單方案預覽',exact:true}).click();
  let rosterReads=0;page.on('request',request=>{if(request.url().includes('/roster-customer-read?'))rosterReads++;});
  await page.getByRole('button',{name:'預讀名單方案',exact:true}).click();await page.getByRole('button',{name:'名單方案已備齊',exact:true}).waitFor();
  await page.getByRole('button',{name:'點開名單方案',exact:true}).click();
  await page.locator('[data-lesson-slot]').first().waitFor();
  assert.equal(rosterReads,1);assert.equal(await page.locator('[data-lesson-slot]').count(),10);
  assert.equal(await page.getByText(/讀取學員資料中|讀取方案詳細資料中|讀取上課進度中/).count(),0);
  await page.screenshot({path:path.join(out,`roster-detail-${width}x${height}.png`)});
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'收費方式預覽',exact:true}).click();
  await page.locator('[data-course-order="plan"]').first().waitFor();
  assert.equal(await page.locator('[data-course-order="plan"]').count(),20);
  assert.equal(await page.getByText('下架方案',{exact:false}).count(),0);
  const create=page.getByRole('button',{name:'新增收費方式',exact:true});
  assert.equal(await create.evaluate(node=>getComputedStyle(node).color),'rgb(255, 255, 255)');
  const search=page.getByRole('textbox',{name:'搜尋',exact:true});
  const searchBox=await search.boundingBox(),createBox=await create.boundingBox();assert(searchBox.x<createBox.x);
  await page.screenshot({path:path.join(out,`plans-${width}x${height}.png`)});
  await page.getByRole('button',{name:'調整順序',exact:true}).click();assert.equal(await page.locator('[data-course-order="plan"]').count(),23);
  await page.getByRole('button',{name:'拖曳排序 吉他方案22',exact:true}).press('ArrowUp');
  await page.waitForFunction(()=>window.__qaOrder);assert.equal(await page.evaluate(()=>window.__qaOrder.ids.length),23);
  // Test real pointer dragging as well as keyboard ordering.
  const from=page.getByRole('button',{name:'拖曳排序 吉他方案02',exact:true}),to=page.getByRole('button',{name:'拖曳排序 吉他方案01',exact:true});
  await from.scrollIntoViewIfNeeded();await to.scrollIntoViewIfNeeded();
  const a=await from.boundingBox(),b=await to.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10});await page.mouse.up();
  await page.waitForFunction(()=>window.__qaOrder.ids.indexOf('plan-1')<window.__qaOrder.ids.indexOf('plan-0'));
  await page.getByRole('button',{name:'完成排序',exact:true}).click();await page.getByRole('button',{name:'下一頁',exact:true}).click();assert.equal(await page.locator('[data-course-order="plan"]').count(),3);assert(await page.getByText('下架方案',{exact:false}).count()>0);
  await page.getByRole('button',{name:'教師管理預覽',exact:true}).click();
  const add=page.getByRole('button',{name:'新增教師',exact:true});assert.equal(await add.evaluate(node=>getComputedStyle(node).color),'rgb(255, 255, 255)');
  await page.screenshot({path:path.join(out,`teachers-${width}x${height}.png`)});
  await page.getByRole('button',{name:'合成老師',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.deepEqual(await dialog.locator('nav[aria-label="人員編輯分類"] button').allTextContents(),['基本資料','授課與拆帳','授課時間與課表','工作權限與 LINE']);
  await dialog.getByRole('button',{name:'授課時間與課表',exact:true}).click();await dialog.getByText('沿用店家授課時間',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,`teacher-time-${width}x${height}.png`)});
  await dialog.getByRole('button',{name:'工作權限與 LINE',exact:true}).click();assert.equal(await dialog.getByText('沿用店家授課時間',{exact:true}).count(),0);
  await dialog.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'空間管理預覽',exact:true}).click();await page.getByRole('button',{name:'新增空間',exact:true}).waitFor();
  const roomSearch=page.getByRole('textbox',{name:'搜尋名稱',exact:true}),roomCreate=page.getByRole('button',{name:'新增空間',exact:true});
  const c=await roomSearch.boundingBox(),d=await roomCreate.boundingBox();assert(c.x<d.x);assert.equal(await roomCreate.evaluate(node=>getComputedStyle(node).color),'rgb(255, 255, 255)');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,`rooms-${width}x${height}.png`)});
  results.push({width,height,planRows:23,pagination:true,keyboardSort:true,pointerSort:true,teacherTabs:4,toolbar:true});await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({out,results}));
}finally{await browser?.close();await server.close();}
