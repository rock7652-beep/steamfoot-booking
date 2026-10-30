// Synthetic browser checks only; actions are stubbed before the application imports them.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(),out=process.env.QA_OUTPUT||'/tmp/course-store-notices-visual';mkdirSync(out,{recursive:true});
const prefix='\0notice-stub:';
const server=await createServer({root,configFile:false,cacheDir:'/tmp/notice-vite-cache',define:{'process.env.NEXT_PUBLIC_BUILD_ENV':JSON.stringify('test')},optimizeDeps:{include:['react','react-dom','react-dom/client']},plugins:[react(),{
 name:'synthetic-notice-actions',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');s.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/digital-manager-notices-fixture.tsx"></script></body></html>').then(v=>res.end(v));}else next();});},
 resolveId(id){if(id.startsWith(prefix))return id;if(id==='@/server/actions/course-store-notices')return prefix+'actions';if(id==='@/server/actions/course-digital-manager-notices')return prefix+'digital';if(id==='next/navigation')return prefix+'navigation';},
 load(id){if(id===prefix+'cache')return `import {useMemo} from 'react';export function usePanelReader(_n,fn){return useMemo(()=>({read:(...args)=>fn(...args),clear:()=>{}}),[fn])}`;if(id===prefix+'dynamic')return `export default function dynamic(){return function Placeholder(){return null}}`;if(id===prefix+'navigation')return `export const useRouter=()=>({push:(href)=>{globalThis.__target=href}});export const usePathname=()=>'/s/synthetic/admin/dashboard/courses';export const useSearchParams=()=>new URLSearchParams();`;if(id===prefix+'digital')return `export {loadCourseStoreNotices as loadCombinedCourseStoreNotices,markCourseStoreNotice as markCourseDigitalManagerNotice} from '${prefix}actions';`;if(id===prefix+'actions')return `
  const row=(id,kind,name)=>({id,kind,customerName:name,courseName:'吉他個別課',coachName:'鈺君',previousCoachName:null,startsAt:'2099-10-15T10:00:00+08:00',previousStartsAt:kind==='MOVE'?'2099-10-14T10:00:00+08:00':null,affectedCount:1,details:{},handledAt:null,handledByName:null,revision:0,createdAt:'2026-10-11T10:00:00+08:00',updatedAt:'2026-10-11T10:00:00+08:00'});
  const rows=[row('a','LEAVE','王小明'),row('b','MOVE','李小美・長名稱測試'),row('c','STOP','團體吉他課'),{...row('digital:p','PAYMENT','方案付款'),courseName:'',coachName:'',canViewCourse:true},{...row('digital:l','LEAD','顧客詢問'),coachName:'',canViewCourse:true},{...row('digital:s','SUPPORT','真人客服'),coachName:'',canViewCourse:true},{...row('digital:r','REMINDER','課程出席'),coachName:'',canViewCourse:true},{...row('digital:d','DIGEST','門市'),coachName:'',canViewCourse:true}];rows[2].affectedCount=10;rows[2].details={students:['學員甲','學員乙']};
  export async function loadCourseStoreNotices({handled,storeId}){globalThis.__noticeReads=(globalThis.__noticeReads||0)+1;return {success:true,storeId,enabled:true,count:rows.filter(r=>!r.handledAt).length,canHandle:true,more:false,items:rows.filter(r=>!!r.handledAt===handled).map(r=>({...r}))};}
  export async function loadCourseStoreNoticeTarget(){return {success:false,error:'合成畫面不提供課程資料'};}
  export async function markCourseStoreNotice({id,handled,storeId,revision}){if(globalThis.__failNotice)return {success:false,error:'儲存失敗，已恢復'};const r=rows.find(r=>r.id===id||r.id==='digital:'+id);if(r.revision!==revision)return {success:false,error:'通知已更新'};r.handledAt=handled?new Date().toISOString():null;r.handledByName=handled?'芊芊':null;r.revision++;return {success:true,storeId,data:{id,revision:r.revision,handledAt:r.handledAt,handledByName:r.handledByName}};}
 `;}
}],resolve:{alias:[{find:'@/server/actions/course-store-notices',replacement:prefix+'actions'},{find:'@/server/actions/course-digital-manager-notices',replacement:prefix+'digital'},{find:'next/navigation',replacement:prefix+'navigation'},{find:'next/dynamic',replacement:prefix+'dynamic'},{find:'@',replacement:path.join(root,'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
await server.listen();const port=server.httpServer.address().port;let browser;const results=[];
try{
 browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE||'/tmp/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,800],[390,844],[360,800]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);try{await page.getByRole('button',{name:'門市通知，8 筆待處理'}).click({timeout:10000});}catch(e){await page.getByRole('button',{name:'門市通知',exact:true}).click().catch(()=>{});console.error('fixture diagnostics',await page.locator('body').innerText(),await page.evaluate(()=>globalThis.__noticeReads),errors);throw e;}
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error(`Page overflow ${width}`);
  const box=await dialog.boundingBox();if(box.x<0||box.x+box.width>width+1)throw Error('Panel outside viewport');
  const status=page.getByRole('button',{name:'標記已處理：王小明'}),touchBox=await status.boundingBox(),circleBox=await status.locator('svg').boundingBox();
  if(touchBox.width<44||touchBox.height<44||circleBox.width!==20||circleBox.height!==20)throw Error('Status circle or touch area incorrect');
  await page.getByRole('button',{name:'方案付款 待核帳',exact:false}).click();
  await page.screenshot({path:path.join(out,`payment-${width}x${height}.png`)});
  await page.getByRole('button',{name:'查看待核帳'}).click();if(await page.evaluate(()=>globalThis.__target)!=='/s/synthetic/admin/dashboard/revenue?status=PENDING')throw Error('Incorrect payment target');
  await page.getByRole('button',{name:'門市通知，8 筆待處理'}).click();await page.getByRole('dialog').waitFor();
  await page.getByRole('button',{name:'標記已處理：王小明'}).click();await page.getByRole('tab',{name:'待處理 7'}).waitFor();
  await page.getByRole('button',{name:'復原',exact:true}).click();await page.getByRole('tab',{name:'待處理 8'}).waitFor();
  await page.evaluate(()=>globalThis.__failNotice=true);await page.getByRole('button',{name:'標記已處理：王小明'}).click();await page.getByRole('alert').filter({hasText:'儲存失敗'}).waitFor();
  await page.getByRole('button',{name:'標記已處理：王小明'}).waitFor();
  await page.evaluate(()=>globalThis.__failNotice=false);await page.getByRole('button',{name:'標記已處理：王小明'}).click();await page.getByRole('tab',{name:'已處理',exact:true}).click();
  await page.getByRole('button',{name:'王小明 預約',exact:false}).count();
  await page.getByRole('button',{name:'王小明 請假',exact:false}).click();await page.getByText(/芊芊.*已處理/).waitFor();
  await page.screenshot({path:path.join(out,`${width}x${height}.png`)});
  await page.getByRole('button',{name:'關閉通知'}).click();if(await page.getByLabel('保留中的輸入').inputValue()!=='交班備註')throw Error('Underlying draft changed');
  if(errors.length)throw Error(errors.join(';'));results.push({width,height,overflow:false,mark:true,undo:true,failureRestored:true,handledBy:true,draftPreserved:true});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();await server.close();}
