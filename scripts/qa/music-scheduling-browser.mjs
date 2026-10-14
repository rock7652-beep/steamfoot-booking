// Runs real UI components against synthetic actions, never real accounts or data.
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync,readdirSync,readFileSync} from "node:fs";
import path from "node:path";
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.QA_PLAYWRIGHT_MODULE||"playwright");
const root=process.cwd(),out=process.env.QA_OUTPUT||"/tmp/music-scheduling-visual",stub="\0music-schedule-qa:";
mkdirSync(out,{recursive:true});
let actionSource=`
 const pause=()=>new Promise(resolve=>setTimeout(resolve,75));
 export const getMusicScheduleRooms=async()=>({success:true,roomIds:["room"]});
 export const getMusicSlotMatches=async({templateId})=>{await pause();return {success:true,data:[{time:'18:00',roomId:'room',coachIds:templateId.endsWith('guitar')?['teacher','other']:['teacher']},{time:'19:00',roomId:'room',coachIds:['teacher']}],unavailable:[]};};
 export const inspectCourseSchedule=async()=>({success:true,issues:[]});
 export const createCourseSchedule=async(input)=>{globalThis.__qaSaved=input;return {success:true,data:{sessionId:'synthetic',sessions:[]}};};
 export const loadCourseScheduleEnrollmentOptions=async()=>({success:true,customers:[{id:'a',name:'小安',phone:'0900000001'},{id:'b',name:'小明',phone:'0900000002'}],cards:[],trialSettings:{enabled:true,price:300}});
 export const createScheduleCustomer=async()=>({success:false,error:'此驗收不建立真實顧客'});
 export const createRentalCustomer=createScheduleCustomer;
 export const saveCourseRental=async(input)=>{globalThis.__qaRental=input;return {success:false,error:'虛構資料，不寫入資料庫'};};
 export const getCourseRental=async()=>{throw Error('Disabled');};
 export const cancelCourseRental=getCourseRental;export const saveRentalPayment=getCourseRental;export const listRoomRentals=async()=>({rows:[],hasMore:false});
 `;
const roster=[{id:'booking',cardId:'card',customerId:'a',customerName:'小安',customerPhone:'0900000001',bookingSource:'店長建立',status:'RESERVED',bookingKind:'CARD',planName:'個別課 $800 4堂',pointCost:1,unit:'SESSION',cardRemaining:4,available:3,termIndex:1,termCount:4,termLessons:[],termPrivateLeaves:[],termLeaveCount:0,termNoShowCount:0,absenceCount:0,absenceHistory:[],trialPayments:[],notes:'',serviceNote:'',sharedCard:false}];
const detail={session:{startsAt:'2099-10-01T03:00:00Z',pointCost:1,teacherAttendance:'SCHEDULED',teacherNote:'',waitlistEnabled:false},roster,cards:[],trial:null,canPurchase:false};
actionSource+=`export const loadCourseRosterQuick=async()=>({success:true,data:${JSON.stringify(detail)}});export const loadCourseSessionDetail=loadCourseRosterQuick;`;
const exported=new Set([...actionSource.matchAll(/export const (\w+)/g)].map(match=>match[1]));
for(const file of readdirSync(path.join(root,'src/server/actions'),{recursive:true}).filter(file=>file.endsWith('.ts'))){
 const source=readFileSync(path.join(root,'src/server/actions',file),'utf8');
 for(const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g))if(!exported.has(match[1])){exported.add(match[1]);actionSource+=`export const ${match[1]}=async()=>({success:false,error:'虛構驗收不執行此操作'});`;}
}
const server=await createServer({root,cacheDir:"/tmp/music-schedule-vite",configFile:false,plugins:[react(),{name:"synthetic-actions",configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==="/favicon.ico"){res.statusCode=204;res.end();return;}if(req.url!=="/"&&req.url!=="/board")return next();res.setHeader("Content-Type","text/html");server.transformIndexHtml("/",'<html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/music-scheduling-fixture.tsx"></script></body></html>').then(html=>res.end(html));});},resolveId(id){if(id.startsWith(stub))return id;},load(id){if(id===stub+"actions")return actionSource;if(id===stub+"link")return 'import React from "react";export const useLinkStatus=()=>({pending:false});export default function Link({children,href,...props}){return React.createElement("a",{...props,href},children);}';if(id===stub+"navigation")return 'export const useRouter=()=>({refresh(){},push(){},replace(){}});export const usePathname=()=>"/dashboard/courses";export const useSearchParams=()=>new URLSearchParams();export const useParams=()=>({});export const useSelectedLayoutSegments=()=>[];export const useSelectedLayoutSegment=()=>null;export const unstable_rethrow=()=>{};export const redirect=()=>{};export const notFound=()=>{};';}}],resolve:{alias:[{find:/^@\/server\/actions\/.*$/,replacement:stub+"actions"},{find:"next/link",replacement:stub+"link"},{find:"next/navigation",replacement:stub+"navigation"},{find:"@",replacement:path.join(root,"src")}]},server:{host:"127.0.0.1",port:0}});
await server.listen();
const browser=process.env.QA_BROWSER==="webkit"?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE||"/usr/bin/chromium",args:["--no-sandbox","--disable-gpu"],headless:true});
const results=[];let currentErrors=[];
try{
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844],[360,740],[588,1000]]){
  const page=await browser.newPage({viewport:{width,height},locale:"zh-TW"}),errors=[];
  currentErrors=errors;page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const dialog=page.getByRole('dialog'),boxes=[];
  await page.getByLabel('搜尋排課學員',{exact:true}).fill('小安');await page.getByRole('button',{name:/小安.*＋/}).click();
  await page.getByLabel('課程',{exact:true}).selectOption('teaching:piano');
  for(const kind of ['single','fixed','trial','rental','single']){
   await page.getByLabel('安排類型',{exact:true}).filter({visible:true}).selectOption(kind);
   if(kind==='fixed')await page.getByLabel('固定課程頻率',{exact:true}).selectOption('BIWEEKLY');
   if(kind==='rental'){await page.locator('input[name="name"]').fill('租借測試者');await page.locator('input[name="phone"]').fill('0900000003');}
   boxes.push(await dialog.boundingBox());
   const overflow=await dialog.evaluate(root=>Array.from(root.querySelectorAll('*')).filter(el=>el.getClientRects().length&&el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>({tag:el.tagName,label:el.getAttribute('aria-label'),width:el.clientWidth,scrollWidth:el.scrollWidth})).filter(el=>el.tag!=='SELECT'));
   if(overflow.length)errors.push(`${kind} local overflow: ${JSON.stringify(overflow)}`);
   const controlsFit=await dialog.evaluate(root=>Array.from(root.querySelectorAll('input,select')).filter(el=>el.getClientRects().length).every(el=>el.getBoundingClientRect().right<=root.getBoundingClientRect().right&&el.getBoundingClientRect().left>=root.getBoundingClientRect().left));
   if(!controlsFit)errors.push(`${kind}: controls outside dialog`);
   await page.screenshot({path:path.join(out,`${width}x${height}-${kind}.png`)});
  }
  await page.locator('[aria-label="排課學員"]:visible').evaluate(el=>el.parentElement.scrollTop=300);
  await page.getByLabel('安排類型',{exact:true}).filter({visible:true}).selectOption('fixed');
  const resetScroll=await page.locator('[aria-label="時間與教室"]:visible').evaluate(el=>el.parentElement.scrollTop===0);
  if(!resetScroll)errors.push('type change retained the old scroll position');
  await page.getByLabel('安排類型',{exact:true}).filter({visible:true}).selectOption('single');
  const retained=await page.locator('[aria-label="排課學員"]:visible').textContent();
  await page.getByRole('radio',{name:'開放報名',exact:true}).check();await page.getByLabel('名額',{exact:true}).fill('8');
  await page.getByRole('button',{name:'新增',exact:true}).click();
  const payload=await page.evaluate(()=>globalThis.__qaSaved);
  const noLearners=payload?.enrollmentMode==='OPEN'&&payload.capacity===8&&payload.learners.length===0;
  const footer=await page.locator('footer:visible').boundingBox();
  const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  const stable=boxes.every(box=>Math.abs(box.width-boxes[0].width)<1&&Math.abs(box.height-boxes[0].height)<1&&Math.abs(box.y-boxes[0].y)<1);
  const pass=stable&&retained.includes('小安')&&noLearners&&!errors.length&&scrollWidth<=width+1&&footer.y+footer.height<=height;
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/board`);
  const shadow=page.locator('button[title*="已調課（原時段保留）"]');
  await shadow.waitFor();
  await page.getByRole('button',{name:/^10:00 排課/}).first().click();
  const releasedClickable=!!await page.evaluate(()=>globalThis.__qaEmpty);
  await page.screenshot({path:path.join(out,`${width}x${height}-board.png`)});
  await page.getByRole('button',{name:'在原位排半堂',exact:true}).click();const covered=await shadow.count()===0;
  await page.getByRole('button',{name:'取消新課',exact:true}).click();const staysHidden=await shadow.count()===0;
  const movedCard=page.locator('button[title*="11:00"][title*="小安"]').filter({visible:true}).first();
  const colored=await movedCard.evaluate(el=>{const color=getComputedStyle(el).backgroundColor;return color!=='rgb(255, 255, 255)'&&color!=='rgba(0, 0, 0, 0)';});
  await movedCard.click();await page.getByRole('heading',{name:'預約清單',exact:true}).waitFor();await page.getByLabel('學員名單捲動區').waitFor();
  await page.screenshot({path:path.join(out,`${width}x${height}-roster.png`)});
  const sharedList=await page.getByLabel('學員名單捲動區').textContent();
  const boardPass=releasedClickable&&covered&&staysHidden&&colored&&sharedList.includes('課後剩餘')&&!errors.length;
  results.push({width,height,releasedClickable,covered,staysHidden,colored,sharedList:sharedList.includes('課後剩餘'),stable,draftRetained:retained.includes('小安'),openRegistration:noLearners,scrollWidth,footerVisible:footer.y+footer.height<=height,errors,pass:pass&&boardPass});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(row=>!row.pass))process.exitCode=1;
}catch(error){console.error(JSON.stringify(currentErrors));throw error;}finally{await browser.close();await server.close();}
