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
const root = process.cwd(), out = path.resolve(process.env.QA_OUTPUT || "/tmp/calendar-customer-preload-browser");
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
const server = await createServer({ root, configFile: false, define:{"process.env":"{}"}, cacheDir: "/tmp/calendar-customer-preload-vite", optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "sonner", "zod"] }, plugins: [react(), {
  name: "calendar-customer-preload-fixture-boundary",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/__qa/snapshot") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ revision })); return; }
      if (req.url === "/" || req.url?.startsWith("/?") || req.url?.startsWith("/s/synthetic/admin/dashboard/courses?")) {
        res.setHeader("Content-Type", "text/html");
        server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/calendar-customer-preload-fixture.tsx"></script></body></html>').then(html => res.end(html)); return;
      }
      next();
    });
  },
  resolveId(id) { if (id.startsWith(prefix)) return id; },
  load(id) {
    if (id === prefix + "navigation") return navigation;
    if (id === prefix + "link") return 'export default "a"; export const useLinkStatus=()=>({pending:false});';
    if (id === prefix + "actions") return [...actionNames].map(name => `export const ${name}=async(...args)=>{const map={browseCourseCards:'__qaReadCards',loadMusicStudentWorkspace:'__qaOverview',loadCourseCustomerPurchases:'__qaOrders'};if(map['${name}'])return globalThis[map['${name}']](...args);throw Error('Business action disabled in synthetic fixture: ${name}')};`).join("\n");
  },
}], resolve: { alias: [
  { find: "next/navigation", replacement: prefix + "navigation" },
  { find: "next/link", replacement: prefix + "link" },
  { find: /^@\/server\/actions\/.*$/, replacement: prefix + "actions" },
  { find: "@", replacement: path.join(root, "src") },
] }, css: { postcss: { plugins: [tailwind()] } }, server: { host: "127.0.0.1", port: 0 } });

await server.listen();
let browser;
const results=[],errors=[];
const edges=process.argv.includes("--edge");
const modules=["sports","music","beauty"].filter(m=>!process.argv.some(arg=>arg.startsWith("--profile="))||process.argv.includes("--profile="+m));
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 if(!process.argv.includes("--customers"))for(const profile of modules)for(const [width,height] of (edges?[[1366,900]]:[[1366,900],[1920,1080],[1024,768],[768,1024]])){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),requests=[];
  let failMonth='',delay=650;const monthDelays={};
  const dayWithData=month=>page.getByRole('button',{name:new RegExp('^'+month+'-04，1')}).first();
  page.on('pageerror',e=>errors.push({profile,error:e.message}));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)throw Error('Unexpected external request '+url.origin);
   if(url.pathname.includes('calendar-read')||url.pathname.includes('calendar-sync')||url.pathname==='/__qa/beauty-month'){
    const date=req.postDataJSON().date,month=date.slice(0,7);requests.push({month,sync:url.pathname.includes('calendar-sync')});
    await new Promise(r=>setTimeout(r,monthDelays[month]??delay));
    if(month===failMonth){await route.fulfill({status:503,body:'failed'});return;}
    await route.fulfill({json:{success:true,data:{...{month,storeId:'synthetic',calendarDays:{},cancelledBookings:[],staffAvailabilityExceptions:[]},sessions:[{id:month,templateId:'template',nameSnapshot:'合成 '+month+' 課程',startsAt:month+'-04T01:00:00Z',endsAt:month+'-04T02:00:00Z',roomId:'room',coachId:'coach',capacity:1,pointCost:1,bookings:[],...(profile==='beauty'?{service:{groupId:'group',status:'PENDING',personName:'合成顧客',endsAt:month+'-04T02:00:00Z',occupiedEndsAt:month+'-04T02:00:00Z',buffer:0}}:{})}]}}});return;
   }
   return route.continue();
  });
  await page.goto(origin+'/s/synthetic/admin/dashboard/courses?scheduleView=month&profile='+profile);await page.getByRole('button',{name:'下個月',exact:true}).waitFor();
  await dayWithData('2026-11').waitFor();
  await page.waitForTimeout(3600);assert.equal(requests.filter(r=>r.sync).length,0,'speculative writes');
  assert.ok(requests.some(r=>r.month==='2026-10')&&requests.some(r=>r.month==='2026-12'),'neighbors not preloaded');
  const start=performance.now();await page.getByRole('button',{name:'下個月',exact:true}).click();await dayWithData('2026-12').waitFor();const warmMs=Math.round(performance.now()-start);
  assert.ok(warmMs<delay,'warm navigation waited for transport');assert.equal(await page.getByLabel('課表載入',{exact:true}).count(),0);
  await page.waitForTimeout(900);if(profile==='sports')assert.ok(requests.some(r=>r.month==='2026-12'&&r.sync),'sports sync missing');
  const sample={profile,width,height,warmMs,preloadReadOnly:true,completeMonth:true};
  await page.getByRole('button',{name:'下個月',exact:true}).click();await dayWithData('2027-01').waitFor();
  await page.waitForTimeout(900);await page.getByRole('button',{name:'上個月',exact:true}).click();await dayWithData('2026-12').waitFor();await page.waitForTimeout(900);
  if(edges){
   failMonth='2027-01';await page.getByRole('button',{name:'下個月',exact:true}).click();await dayWithData('2027-01').waitFor();
   await page.getByRole('alert').filter({hasText:'課表更新失敗'}).waitFor();assert.equal(await page.getByLabel('課表載入',{exact:true}).count(),0,'failed refresh replaced cached data');
   failMonth='';await page.getByRole('button',{name:'重新讀取',exact:true}).click();await page.getByRole('alert').filter({hasText:'課表更新失敗'}).waitFor({state:'hidden'});await dayWithData('2027-01').waitFor();
   monthDelays['2027-02']=1200;monthDelays['2027-03']=100;
   await page.getByRole('button',{name:'下個月',exact:true}).click();await page.getByRole('button',{name:'下個月',exact:true}).click();await dayWithData('2027-03').waitFor();await page.waitForTimeout(1350);assert.equal(await dayWithData('2027-02').count(),0,'late response overwrote selected month');
   failMonth='2027-04';await page.getByRole('button',{name:'下個月',exact:true}).click();await page.getByRole('alert').filter({hasText:'課表讀取失敗'}).waitFor();
   failMonth='';await page.getByRole('button',{name:'重新讀取',exact:true}).click();await dayWithData('2027-04').waitFor();Object.assign(sample,{cachedRefreshFailure:true,retry:true,lateResponseIsolated:true,coldFailureRetry:true});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'page overflow');
  await page.screenshot({path:path.join(out,profile+'-'+width+'.png'),fullPage:true});results.push(sample);console.log(JSON.stringify(sample));await context.close();
 }

 if(!edges)for(const profile of modules)for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),requests=[];
  page.on('pageerror',e=>errors.push({profile,kind:'customers',error:e.message}));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin){await route.abort();return;}
   let op='',input={};
   if(url.pathname.startsWith('/__qa/')){op=url.pathname.slice(6);input=req.postDataJSON();}
   else if(url.pathname.endsWith('/card-read')){op='cards';input=JSON.parse(url.searchParams.get('args'));}
   else if(url.pathname.endsWith('/music-period-read')){op='periods';input={customerId:url.searchParams.get('customerId')};}
   if(op){
    requests.push({op,customerId:input.customerId});await new Promise(r=>setTimeout(r,650));
    const id=input.customerId;
    const card={id:'card-'+id,name:'合成方案 '+id,planId:'plan',unit:'SESSION',members:[{id,name:id==='customer-a'?'合成顧客甲':'合成顧客乙',phone:'0900000001'}],remaining:8,held:1,available:7,expiresAt:'2027-01-01T00:00:00Z',closed:false,expired:false,entries:[],templateIds:['template'],termSessionIds:[],allowShared:false,openingImported:false,openingIssue:null,musicValidityDays:null,musicActivatedAt:null};
    await route.fulfill({json:op==='cards'?{success:true,rows:[card],hasMore:false,totals:[{unit:'SESSION',count:1,remaining:8,held:1,available:7}]}:op==='overview'?{success:true,data:{balance:{remaining:8,held:1,available:7,makeupRemaining:0,issues:0},next:null,canReadBookings:true}}:{success:true,data:[],hasMore:false,purchaseRevision:'r1'}});return;
   }
   return route.continue();
  });
  await page.goto(origin+'/s/synthetic/admin/dashboard/courses?kind=customers&profile='+profile);
  await page.getByRole('button',{name:'合成顧客甲',exact:true}).waitFor();await page.waitForTimeout(4500);
  const before=requests.filter(r=>r.op==='cards'&&r.customerId==='customer-a').length;assert.equal(before,1,'customer was not preloaded');
  const start=performance.now();await page.getByRole('button',{name:'合成顧客甲',exact:true}).click();
  if(profile==='music'){
   await page.getByLabel('學員概況',{exact:true}).waitFor();await page.getByRole('button',{name:'課程與學費',exact:true}).click();await page.getByText('尚無已購課程。',{exact:true}).waitFor();
   assert.equal(requests.filter(r=>r.op==='periods'&&r.customerId==='customer-a').length,1,'opening music periods discarded preload');
   assert.equal(requests.filter(r=>r.op==='orders'&&r.customerId==='customer-a').length,1,'opening music purchases discarded preload');
  }else await page.getByText('合成方案 customer-a',{exact:true}).first().waitFor();const warmMs=Math.round(performance.now()-start);
  assert.ok(warmMs<650,'customer open waited for transport');assert.equal(requests.filter(r=>r.op==='cards'&&r.customerId==='customer-a').length,before,'opening discarded preload');
  const dialog=page.getByRole('dialog').first();const box=await dialog.boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,'customer panel outside viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,profile+'-customer-'+width+'.png'),fullPage:true});results.push({profile,kind:'customers',width,height,warmMs,readCount:before,correctCustomer:true,panelContained:true});console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 writeFileSync(path.join(out,edges?'edges.json':'results.json'),JSON.stringify({fixtureOnly:true,results,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results}));
}finally{await browser?.close();await server.close();}
