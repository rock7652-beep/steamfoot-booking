// No DB, real customer, LINE request or deployment. Uses the actual UI components.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url), { chromium } = require('playwright');
const root = process.cwd(), out = process.env.QA_OUTPUT || '/tmp/store-member-workorder-ui';
mkdirSync(out, { recursive: true });
const prefix = '\0member-fixture:';
const server = await createServer({ root, configFile: false, cacheDir: '/tmp/member-workorder-vite-cache',
  plugins: [react(), { name: 'synthetic-member-actions', configureServer(s) {
    s.middlewares.use((req,res,next) => {
      if (req.url === '/') { res.setHeader('Content-Type','text/html'); s.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/store-member-workorder-fixture.tsx"></script></body></html>').then(v => res.end(v)); } else next();
    });
  }, resolveId(id) { if(id.startsWith(prefix))return id; }, load(id) {
    if(id===prefix+'member') return `let confirmed=false; globalThis.__confirmCount=0;
      export async function loadMemberConnectionAction(){return {success:true,canConfirm:true,data:{membership:confirmed?'已連結':'尚未連結',notification:confirmed?'本店已確認，發送前再檢查通道':'本店通知尚未確認',pending:confirmed?[]:[{id:'synthetic-request',verificationCode:'ABC123'}],conflict:false}};}
      export async function approveMemberConnectionAction(){globalThis.__confirmCount++;await new Promise(r=>setTimeout(r,150));confirmed=true;return {success:true};}`;
    if(id===prefix+'notification') return `export async function setWorkOrderNotificationEnabled(){if(globalThis.__failSetting)return {success:false,error:'合成設定失敗'};return {success:true};}
      export async function loadWorkOrderNotification(){return {success:true,data:{status:'FAILED',sentAt:null,lastAttemptAt:'2026-10-12T02:00:00Z',errorMessage:'LINE API 429：合成額度測試，未實際外發'}};}`;
  } }], resolve: { alias: [
    {find:'@/server/actions/store-member-connection',replacement:prefix+'member'},
    {find:'@/server/actions/work-order-notification',replacement:prefix+'notification'},
    {find:'@',replacement:path.join(root,'src')},
  ] }, css: { postcss: { plugins: [tailwind()] } }, server: { host:'127.0.0.1',port:0 },
});
await server.listen();
let browser;
try {
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
  const origin=server.resolvedUrls.local[0], results=[];
  for(const [width,height] of [[1366,900],[1024,768],[768,1024],[560,768],[390,844],[360,800]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin).origin?route.continue():route.abort());
    await page.goto(origin);await page.getByText('ABC123',{exact:false}).waitFor();
    const phone=page.getByRole('textbox',{name:'手機號碼'});await phone.fill('0912345678');
    await page.setViewportSize({width:width===390?360:width,height:height+20});
    if(await phone.inputValue()!=='0912345678')throw Error('draft lost on resize');
    await page.setViewportSize({width,height});
    const button=page.getByRole('button',{name:'已核對本人，確認綁定'});const box=await button.boundingBox();
    if(!box||box.height<44)throw Error('confirmation touch target below 44px');
    await button.evaluate(el=>{el.click();el.click();el.click();});
    await page.getByText('會員：已連結',{exact:false}).waitFor();
    if(await page.evaluate(()=>globalThis.__confirmCount)!==1)throw Error('duplicate confirmation');
    const toggle=page.getByRole('switch');await toggle.check();
    await page.getByText('工單待取件 LINE 通知・開啟',{exact:false}).waitFor();
    await page.evaluate(()=>{globalThis.__failSetting=true;});await toggle.click();
    await page.getByRole('alert').filter({hasText:'合成設定失敗'}).waitFor();
    if(!await toggle.isChecked())throw Error('failed save changed setting');
    const dimensions=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    if(dimensions.scroll>dimensions.client)throw Error('page horizontal overflow');
    await page.screenshot({path:path.join(out,`${width}x${height}.png`),fullPage:true});
    if(errors.length)throw Error(errors.join(';'));
    results.push({width,height,actualViewport:page.viewportSize(),switchChecked:await toggle.isChecked(),synthetic:true,overflow:false,draftPreserved:true,confirmationCalls:1,settingFailurePreservesValue:true});await page.close();
  }
  writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser?.close();await server.close();}
