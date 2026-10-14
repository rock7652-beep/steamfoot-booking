// Run from repository root. Use QA_PLAYWRIGHT_MODULE for external QA tooling.
// No real database, authentication, or submission is exercised.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
const root=process.cwd();
const stub='\0retirement:';
const server=await createServer({root,configFile:false,plugins:[react(),{
 name:'retirement-read-only-fixture',
 configureServer(server){server.middlewares.use((req,res,next)=>{
  if(req.url==='/'||req.url.startsWith('/?')){
   res.setHeader('Content-Type','text/html');
   server.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/spa-retirement-fixture.tsx"></script></body></html>').then(html=>res.end(html));
  }else next();
 });},
 resolveId(id){
  if(id.startsWith(stub))return id;
  if(id==='next/link'||id==='@/components/dashboard-link')return stub+'link';
  if(id==='@/server/actions/store-onboarding')return stub+'actions';
 },
 load(id){
  if(id===stub+'link')return 'export const DashboardLink="a";export default "a";';
  if(id===stub+'actions')return 'export async function createStoreAction(){throw Error("Fixture writes disabled")}';
 }
}],resolve:{alias:[{find:'next/link',replacement:stub+'link'},{find:'@/components/dashboard-link',replacement:stub+'link'},{find:'@/server/actions/store-onboarding',replacement:stub+'actions'},{find:'@',replacement:root+'/src'}]},server:{host:'127.0.0.1',port:0}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',args:['--no-sandbox','--disable-gpu'],headless:true});
const out=process.env.QA_OUTPUT || '/tmp/steamfoot-retirement-preview';mkdirSync(out,{recursive:true});
const results=[];
try {
 for(const view of ['public','hq'])for(const [width,height] of [[390,844],[768,1024],[1024,768],[1366,900],[1920,1080]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?view=${view}`);await page.waitForSelector(view==='hq'?'fieldset':'article');
  const text=await page.locator('body').innerText();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const supported=view==='hq'?['時段模組（蒸足）','音樂教室','運動教室']:['時段預約','音樂課程','運動課程'];
  const pass=supported.every(t=>text.includes(t))&&!text.includes('SPA')&&!overflow&&!errors.length;
  if(view==='hq'){
   await page.getByText('音樂教室',{exact:true}).click();
   await page.getByText('運動教室',{exact:true}).click();
   await page.getByText('時段模組（蒸足）',{exact:true}).click();
  }
  await page.screenshot({path:`${out}/${view}-${width}x${height}.png`,fullPage:true});results.push({view,width,height,pass,overflow,errors});await page.close();
 }
 writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(r=>!r.pass))process.exitCode=1;
}finally{await browser.close();await server.close();}
