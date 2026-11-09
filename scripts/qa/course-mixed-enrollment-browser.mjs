// Actual form components, synthetic records and stubbed actions; no app DB or notifications.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),out=process.env.QA_OUTPUT||'/tmp/course-mixed-enrollment-visual';mkdirSync(out,{recursive:true});
const prefix='\0mixed-stub:';
const customers=Array.from({length:30},(_,i)=>({id:`student-${i}`,name:i===0?'固定學員甲':'測試學員長名稱'+i,phone:`090000${String(i).padStart(4,'0')}`}));
const server=await createServer({root,configFile:false,define:{"process.env.NEXT_PUBLIC_BUILD_ENV":JSON.stringify("qa")},cacheDir:'/tmp/mixed-vite-cache',optimizeDeps:{include:['react','react-dom','react-dom/client']},plugins:[react(),{
 name:'isolated-mixed-enrollment',
 configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');s.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/course-mixed-enrollment-fixture.tsx"></script></body></html>').then(v=>res.end(v));}else next();});},
 resolveId(id){if(id.startsWith(prefix))return id;if(id.startsWith('@/server/actions/'))return prefix+'actions';if(id==='next/navigation')return prefix+'navigation';if(id==='@/components/dashboard-link')return prefix+'link';if(id==='@/components/admin/service-schedule-fields'||id==='@/components/admin/service-reservation-form')return prefix+'service';},
 load(id){
  if(id===prefix+'navigation')return `export const usePathname=()=>'/dashboard/courses',useRouter=()=>({refresh(){}}),useSearchParams=()=>new URLSearchParams();`;
  if(id===prefix+'link')return `export const DashboardLink=()=>null;`;
  if(id===prefix+'service')return `export const ServiceScheduleFields=()=>null,ServiceReservationForm=()=>null;`;
  if(id===prefix+'actions')return `
   export async function loadCourseScheduleEnrollmentOptions(){return {success:true,cards:[],customers:${JSON.stringify(customers)},trialSettings:{enabled:false,price:0}};}
   export async function getMusicSlotMatches(){return {success:true,data:[{time:'09:00',roomId:'room',coachIds:['coach']}],unavailable:[]};}
   export async function inspectCourseSchedule(){return {success:true,issues:[]};}
   export async function getMusicScheduleRooms(){return {success:true,roomIds:['room']};}
   export async function loadCourseChargeOptions(){return {success:true,rows:[],enabled:false};}
   export async function createCourseSchedule(input){(globalThis.__mixedRequests??=[]).push(input);if(globalThis.__mixedFail)return {success:false,error:'測試儲存失敗，輸入已保留'};return {success:true,data:{sessionId:'saved',sessions:[],count:1}};}
   export async function sportsStagingCommand(input){(globalThis.__mixedRequests??=[]).push(input);if(globalThis.__mixedFail)return {success:false,error:'測試儲存失敗，輸入已保留'};return {success:true};}
   export async function createScheduleCustomer(){throw Error('Not part of this fixture');}
   export async function createRentalCustomer(){throw Error('Not part of this fixture');}
  `;
 }
}],resolve:{alias:[{find:/^@\/server\/actions\/.*/,replacement:prefix+'actions'},{find:/^@\/components\/admin\/service-(schedule-fields|reservation-form)$/,replacement:prefix+'service'},{find:'@/components/dashboard-link',replacement:prefix+'link'},{find:'@',replacement:path.join(root,'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
await server.listen();let browser,currentPage;const results=[];
try{
 browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const kind of ['音樂','運動'])for(const [width,height]of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,800],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];currentPage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);await page.getByRole('button',{name:kind,exact:true}).click();
  await page.getByText('開放選課',{exact:true}).click();await page.getByLabel('同時安排固定學員',{exact:true}).check();
  await page.getByLabel(kind==='音樂'?'名額':'排課人數',{exact:true}).fill('4');await page.getByText('總名額 4 人 · 固定學員 1 人 · 剩餘 3 人可自由選課',{exact:true}).waitFor();
  // Resize while editing; the original fixed learner and capacity must survive.
  await page.setViewportSize({width:width===560?768:560,height});await page.setViewportSize({width,height});
  if(!await page.getByLabel('同時安排固定學員',{exact:true}).isChecked())throw Error('Mixed draft lost after resize');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error(`Page overflow ${kind} ${width}`);
  await page.evaluate(()=>globalThis.__mixedFail=true);await page.getByRole('button',{name:'新增',exact:true}).click();await page.getByRole('alert').filter({hasText:'測試儲存失敗'}).waitFor();
  await page.screenshot({path:path.join(out,`${kind==='音樂'?'music':'sports'}-${width}x${height}-failure.png`)});
  await page.evaluate(()=>globalThis.__mixedFail=false);await page.getByRole('button',{name:'新增',exact:true}).click();await page.getByLabel('預覽結果').filter({hasText:'已確認新增'}).waitFor();
  await page.screenshot({path:path.join(out,`${kind==='音樂'?'music':'sports'}-${width}x${height}.png`)});
  const requests=await page.evaluate(()=>globalThis.__mixedRequests);const a=JSON.stringify(requests.at(-1)),b=JSON.stringify(requests.at(-2));if(a!==b)throw Error('Retry changed the original request');
  const input=kind==='音樂'?requests.at(-1):requests.at(-1).payload;
  if(input.capacity!==4||(kind==='音樂'?input.learners[0]?.customerId:input.students[0])!=='student-0')throw Error('Wrong fixed roster or total capacity');
  if(errors.length)throw Error(errors.join(';'));results.push({module:kind,width,height,overflow:false,fixedLearners:1,capacity:4,openSeats:3,resizePreserved:true,failurePreserved:true,retrySameIntent:true});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}catch(error){if(currentPage){await currentPage.screenshot({path:path.join(out,'failure.png')});console.error(await currentPage.locator('body').innerText());}throw error;}finally{await browser?.close();await server.close();}
