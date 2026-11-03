// Local synthetic preview: no application credentials, databases, or notifications.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),out='/tmp/closed-day-slot-preview';mkdirSync(out,{recursive:true});
const stub='\0closed-day-actions';
const server=await createServer({root,configFile:false,cacheDir:'/tmp/closed-day-vite',optimizeDeps:{include:['react','react-dom/client','sonner']},plugins:[react(),{
 name:'closed-day-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');s.transformIndexHtml('/',`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/closed-day-slot-fixture.tsx"></script></body></html>`).then(v=>res.end(v));}else next();});},
 resolveId(id){if(id===stub)return id;},load(id){if(id===stub)return `let slots=[];export async function getDaySlotDetails(){return {status:'closed',canAddSlotsOnClosedDay:true,defaultCapacity:6,slots:slots.map(s=>({...s}))}};export async function applyDaySlotOverrides(input){if(globalThis.__failSave)return {success:false,error:'測試儲存失敗，草稿已保留'};globalThis.__saved=input;for(const c of input.changes){const slot=slots.find(s=>s.startTime===c.startTime);if(slot){slot.isEnabled=c.action==='enable';slot.capacity=c.capacity??slot.capacity;}else slots.push({startTime:c.startTime,capacity:c.capacity??6,isEnabled:true,inRange:false,override:'enabled'});}return {success:true,data:{changed:input.changes.length,bookedPeopleKept:0}}}`;}
}],resolve:{alias:[{find:'@/server/actions/business-hours',replacement:stub},{find:'@',replacement:path.join(root,'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
await server.listen();const port=server.httpServer.address().port;let browser;const results=[];
try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,800],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button',{name:'管理時段',exact:true}).click();await page.getByText('此日原為公休',{exact:false}).waitFor();
  await page.getByLabel('新增時段時間',{exact:true}).fill('19:30');await page.getByRole('button',{name:'加入草稿'}).click();await page.getByLabel('19:30 名額',{exact:true}).fill('4');
  await page.setViewportSize({width:width>768?768:1024,height:height});if(await page.getByLabel('19:30 名額',{exact:true}).inputValue()!=='4')throw Error('Resize lost draft');await page.setViewportSize({width,height});
  await page.evaluate(()=>globalThis.__failSave=true);await page.getByRole('button',{name:'確認並儲存'}).click();await page.getByText('測試儲存失敗，草稿已保留').waitFor();if(await page.getByLabel('19:30 名額',{exact:true}).inputValue()!=='4')throw Error('Failure lost draft');
  await page.evaluate(()=>globalThis.__failSave=false);await page.getByRole('button',{name:'確認並儲存'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  if(await page.evaluate(()=>globalThis.__savedRefreshCount)!==1)throw Error('Saved schedule summary not refreshed');
  const saved=await page.evaluate(()=>globalThis.__saved);if(saved.changes.length!==1||saved.changes[0].capacity!==4||saved.changes[0].action!=='enable')throw Error('Wrong saved payload');
  await page.getByRole('button',{name:'管理時段',exact:true}).click();await page.getByLabel('19:30 名額',{exact:true}).waitFor();if(await page.getByLabel('19:30 名額',{exact:true}).inputValue()!=='4')throw Error('Reopen lost saved capacity');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Page overflow');await page.getByRole('button',{name:'確認並儲存'}).scrollIntoViewIfNeeded();const box=await page.getByRole('button',{name:'確認並儲存'}).boundingBox();if(!box||box.x<0||box.x+box.width>width||box.y<0||box.y+box.height>height)throw Error('Save unreachable');
  await page.screenshot({path:path.join(out,`${width}x${height}.png`)});if(errors.length)throw Error(errors.join('\n'));results.push({width,height,result:'passed',cases:['closed-day add','capacity','resize preserves draft','save failure preserves draft','save and reopen','no page overflow','save reachable']});await page.close();
 }writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();await server.close();}
