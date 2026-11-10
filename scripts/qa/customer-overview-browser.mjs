// Customer profile controller checks with an isolated synthetic HTTP boundary.
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
const root = process.cwd(), out = path.resolve(process.env.QA_OUTPUT || "/tmp/customer-overview-browser");
mkdirSync(out, { recursive: true });
let revision = 0;
const prefix = "\0customer-overview:";
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
    push(href){history.pushState(null,'',href);},replace(href){history.replaceState(null,'',href);},prefetch(){}};
  export const useRouter=()=>router;
  export const usePathname=()=>location.pathname;
  let savedSearch,savedParams;
  for(const method of ['pushState','replaceState']){const original=window.history[method].bind(window.history);window.history[method]=(...args)=>{const result=original(...args);window.dispatchEvent(new Event('qa:url'));return result;};}
  const subscribe=listener=>{window.addEventListener('qa:url',listener);return()=>window.removeEventListener('qa:url',listener);};
  export const useSearchParams=()=>{const search=useSyncExternalStore(subscribe,()=>window.location.search,()=>window.location.search);if(savedSearch!==search){savedSearch=search;savedParams=new URLSearchParams(search);}return savedParams;};
  export const unstable_rethrow=()=>{};
`;
const server = await createServer({ root, configFile: false, define:{"process.env":"{}"}, cacheDir: "/tmp/customer-overview-vite", optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "sonner", "zod", "next/dynamic"] }, plugins: [react(), {
  name: "customer-overview-fixture-boundary",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if(process.argv.includes('--serve')&&(req.url?.startsWith('/__qa/')||req.url?.includes('/card-read')||req.url?.endsWith('/notes'))){
        let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{
          const url=new URL(req.url,'http://127.0.0.1'),input=body?JSON.parse(body):JSON.parse(url.searchParams.get('args')||'{}');
          let value={success:false,error:'合成預覽未提供此業務操作'};
          if(url.pathname.endsWith('/cards')||url.pathname.includes('/card-read'))value={success:true,rows:[card('preview',input.history)],hasMore:false};
          if(url.pathname.endsWith('/bookings'))value={success:true,hasMore:false,data:[{id:'preview',date:'2026-11-11T09:30:00Z',name:'合成課程／服務',coachName:'合成人員'}]};
          if(url.pathname.endsWith('/overview'))value={success:true,data:{balance:{remaining:10,held:2,available:8,makeupRemaining:0,issues:0},next:{id:'preview',date:'2026-11-11T09:30:00Z',name:'合成課程'},canReadBookings:true}};
          if(url.pathname.endsWith('/note')||url.pathname.endsWith('/notes'))value={success:true};
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
        });return;
      }
      if (req.url === "/__qa/snapshot") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ revision })); return; }
      if (req.url === "/" || req.url?.startsWith("/?") || req.url?.startsWith("/s/synthetic/admin/dashboard/courses?")) {
        res.setHeader("Content-Type", "text/html");
        server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/customer-overview-fixture.tsx"></script></body></html>').then(html => res.end(html)); return;
      }
      next();
    });
  },
  resolveId(id) { if (id.startsWith(prefix)) return id; },
  load(id) {
    if (id === prefix + "navigation") return navigation;
    if (id === prefix + "link") return 'export default "a"; export const useLinkStatus=()=>({pending:false});';
    if (id === prefix + "actions") return [...actionNames].map(name => `export const ${name}=async(...args)=>{const map={browseCourseCards:'__qaReadCards',loadMusicStudentWorkspace:'__qaOverview',loadCourseCustomerPurchases:'__qaOrders',loadCourseCustomerBookings:'__qaBookings',saveCourseCustomerNote:'__qaNote'};if(map['${name}'])return globalThis[map['${name}']](...args);throw Error('Business action disabled in synthetic fixture: ${name}')};`).join("\n");
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
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const card=(id,history=false)=>({id,name:(history?'歷史':'有效')+'方案 · '+id,planId:'plan',unit:'SESSION',musicValidityDays:null,musicActivatedAt:null,templateIds:[],termSessionIds:[],allowShared:false,remaining:history?0:10,held:2,available:history?0:8,closed:history,expired:false,expiresAt:'2027-04-08T00:00:00Z',members:[{id:'customer-a',name:'合成顧客甲',phone:'0900000000'}],entries:[]});
if(process.argv.includes('--serve')){console.log('Synthetic preview '+origin+'/s/synthetic/admin/dashboard/courses?view=customers&customerId=customer-a&studentTab=info&profile=sports');await new Promise(()=>{});}
try{
 browser=await chromium.launch({executablePath:process.env.QA_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
 for(const profile of (process.argv.includes('--quick')?['sports']:['sports','music','beauty']))for(const [width,height] of (process.argv.includes('--quick')?[[390,844]]:[[390,844],[360,780],[768,1024],[1024,768],[1366,900],[1920,1080]])){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();page.setDefaultTimeout(15000);
  let empty=false,failCards=false,failNext=false,failNote=false,many=false,delay=50;
  page.on('pageerror',error=>errors.push({profile,error:error.message}));page.on('console',message=>{if(message.type()==='error')errors.push({profile,error:message.text()});});
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin)throw Error('External request blocked: '+url.origin);
   if(url.pathname.startsWith('/__qa/')||url.pathname.includes('/card-read')||url.pathname.endsWith('/notes')){
    const input=req.postData()?JSON.parse(req.postData()):JSON.parse(url.searchParams.get('args')||'{}');
    await new Promise(resolve=>setTimeout(resolve,delay));
    if(url.pathname.endsWith('/cards')||url.pathname.includes('/card-read')){
     if(failCards)return route.fulfill({json:{success:false,error:'合成方案讀取失敗'}});
     return route.fulfill({json:{success:true,rows:empty?[]:Array.from({length:many?20:1},(_,i)=>card(input.cardId??'card-'+i,input.history)),hasMore:many&&!input.page,totals:[{unit:'SESSION',count:1,remaining:10,held:2,available:8}]}});
    }
    if(url.pathname.endsWith('/bookings'))return route.fulfill({json:failNext?{success:false,error:'合成預約讀取失敗'}:{success:true,hasMore:false,data:empty?[]:[{id:'booking',sessionId:'session',date:'2026-11-11T09:30:00Z',name:'合成課程／服務',coachName:'合成人員',status:'RESERVED',unit:'SESSION',points:1,plan:'合成方案'}]}});
    if(url.pathname.endsWith('/overview'))return route.fulfill({json:failNext?{success:false,error:'合成預約讀取失敗'}:{success:true,data:{balance:{remaining:10,held:2,available:8,makeupRemaining:0,issues:0},next:empty?null:{id:'session',date:'2026-11-11T09:30:00Z',name:'合成課程'},canReadBookings:true}}});
    if(url.pathname.endsWith('/note')||url.pathname.endsWith('/notes'))return route.fulfill({json:failNote?{success:false,error:'合成儲存失敗，輸入已保留'}:{success:true}});
    return route.fulfill({json:{success:false,error:'合成預覽禁止業務操作'}});
   }
   return route.continue();
  });
  await page.goto(origin+'/s/synthetic/admin/dashboard/courses?view=customers&profile='+profile+'&customerId=customer-a&studentTab=info&kind=customers');
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByText('有效方案 · card-0',{exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'編輯顧客資料',exact:true}).count(),1);
  assert.equal(await dialog.getByLabel('方案效期',{exact:true}).count(),0);
  assert.equal(await dialog.getByRole('button',{name:profile==='music'?'購課／續購':'新增方案',exact:true}).count(),1);
    const nextText=profile==='music'?'下次上課：':'下次預約';
  const next=dialog.getByText(new RegExp(nextText)).last();await next.waitFor();
  const nextY=(await next.boundingBox()).y,cardY=(await dialog.getByText('有效方案 · card-0',{exact:true}).boundingBox()).y;assert.ok(nextY<cardY,'Next booking must precede cards');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow');
  assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'Dialog overflow');
  await page.screenshot({path:path.join(out,profile+'-'+width+'.png'),fullPage:true});
  await dialog.getByRole('button',{name:'歷史方案',exact:true}).click();await dialog.getByText('歷史方案 · card-0',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'返回有效方案',exact:true}).click();await dialog.getByText('有效方案 · card-0',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'編輯顧客資料',exact:true}).click();await dialog.getByRole('button',{name:'返回總覽',exact:true}).click();await dialog.getByText('有效方案 · card-0',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:profile==='music'?'購課／續購':'新增方案',exact:true}).click();
  await dialog.getByRole('button',{name:'‹ 返回 合成顧客甲 詳情',exact:true}).click();await dialog.getByRole('button',{name:'總覽',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('studentTab'),'info');
  if(width===390){
   await dialog.getByRole('button',{name:'＋備註',exact:true}).click();await dialog.getByRole('textbox',{name:'店內備註',exact:true}).fill('合成服務提醒');
   failNote=true;await dialog.getByRole('button',{name:'儲存',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'合成儲存失敗'}).waitFor();
   assert.equal(await dialog.getByRole('textbox',{name:'店內備註',exact:true}).inputValue(),'合成服務提醒');
   failNote=false;await dialog.getByRole('button',{name:'儲存',exact:true}).click();await dialog.getByText('合成服務提醒',{exact:true}).waitFor();

   failCards=true;await page.evaluate(()=>window.dispatchEvent(new Event('customer-search-invalidated')));await dialog.getByRole('button',{name:'歷史方案',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'合成方案讀取失敗'}).waitFor();
   assert.equal(await dialog.getByText('尚無有效方案',{exact:true}).count(),0,'Failure rendered as empty');
   failCards=false;await dialog.getByRole('button',{name:'重試',exact:true}).click();await dialog.getByText('歷史方案 · card-0',{exact:true}).waitFor();
   empty=true;await page.evaluate(()=>window.dispatchEvent(new Event('customer-search-invalidated')));await dialog.getByRole('button',{name:'返回有效方案',exact:true}).click();await dialog.getByText('尚無有效方案',{exact:true}).waitFor();
   assert.equal(await dialog.getByLabel('方案效期').count(),0);
   empty=false;many=true;await page.evaluate(()=>window.dispatchEvent(new Event('customer-search-invalidated')));await dialog.getByRole('button',{name:'歷史方案',exact:true}).click();await dialog.getByText('歷史方案 · card-19',{exact:true}).waitFor();
   assert.equal(await dialog.getByRole('button',{name:'下一頁',exact:true}).isEnabled(),true);
   await dialog.getByLabel('搜尋持有方案或共卡成員',{exact:true}).fill('長名稱');await dialog.getByText('歷史方案 · card-19',{exact:true}).waitFor();
   await page.setViewportSize({width:1024,height:768});assert.equal(await dialog.getByLabel('搜尋持有方案或共卡成員',{exact:true}).inputValue(),'長名稱');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const scroller=page.locator('[data-course-person-scroll]');
   await dialog.getByRole('button').filter({hasText:'歷史方案 · card-10'}).click();
   await dialog.getByRole('button',{name:'‹ 返回 合成顧客甲 詳情',exact:true}).waitFor();
   await dialog.getByRole('button',{name:'‹ 返回 合成顧客甲 詳情',exact:true}).click();await dialog.getByText('歷史方案 · card-19',{exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('[data-course-person-scroll]').scrollTop>200);assert.ok(await scroller.evaluate(element=>element.scrollTop)>200,'Detail return lost scroll position');

   failNext=true;await page.reload();await page.getByRole('alert').filter({hasText:'合成預約讀取失敗'}).waitFor();
   assert.equal(await page.getByText('尚未安排下次課程',{exact:true}).count(),0,'Failed upcoming read became empty');
   failNext=false;await page.getByRole('button',{name:profile==='music'?'重新讀取':'重試',exact:true}).click();await page.getByText(new RegExp(nextText)).last().waitFor();
   results.push({profile,case:'note failure retains draft and retries; card/next failures retry; empty; 20 cards; resize preserves search; detail return restores scroll',passed:true});
  }
  results.push({profile,width,height,layout:true,history:true,editReturn:true,purchaseReturn:true});console.log(JSON.stringify(results.at(-1))); 
  await context.close();
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 writeFileSync(path.join(out,'results.json'),JSON.stringify({synthetic:true,results,errors},null,2));console.log(JSON.stringify({out,cases:results.length,errors}));
}finally{await browser?.close();await server.close();}
