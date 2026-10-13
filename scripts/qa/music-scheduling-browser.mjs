// Runs real UI components against synthetic actions, never real accounts or data.
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||"playwright");
const root=process.cwd(),out=process.env.QA_OUTPUT||"/tmp/music-scheduling-visual",stub="\0music-schedule-qa:";
mkdirSync(out,{recursive:true});
const actionSource=`
 const pause=()=>new Promise(resolve=>setTimeout(resolve,75));
 export const getMusicSlotMatches=async({templateId})=>{await pause();return {success:true,data:[{time:'18:00',roomId:'room',coachIds:templateId==='guitar'?['teacher','other']:['teacher']},{time:'19:00',roomId:'room',coachIds:['teacher']}],unavailable:[]};};
 export const inspectCourseSchedule=async()=>({success:true,issues:[]});
 export const createCourseSchedule=async(input)=>{globalThis.__qaSaved=input;return {success:true,data:{sessionId:'synthetic',sessions:[]}};};
 export const loadCourseScheduleEnrollmentOptions=async()=>({success:true,customers:[{id:'a',name:'小安',phone:'0900000001'},{id:'b',name:'小明',phone:'0900000002'}],cards:[],trialSettings:{enabled:true,price:300}});
 export const createScheduleCustomer=async()=>({success:false,error:'此驗收不建立真實顧客'});
 export const createRentalCustomer=createScheduleCustomer;
 export const saveCourseRental=async(input)=>{globalThis.__qaRental=input;return {success:false,error:'虛構資料，不寫入資料庫'};};
 export const getCourseRental=async()=>{throw Error('Disabled');};
 export const cancelCourseRental=getCourseRental;export const saveRentalPayment=getCourseRental;export const listRoomRentals=async()=>({rows:[],hasMore:false});
 `;
const server=await createServer({root,cacheDir:"/tmp/music-schedule-vite",configFile:false,plugins:[react(),{name:"synthetic-actions",configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=="/")return next();res.setHeader("Content-Type","text/html");server.transformIndexHtml("/",'<html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/music-scheduling-fixture.tsx"></script></body></html>').then(html=>res.end(html));});},resolveId(id){if(id.startsWith(stub))return id;},load(id){if(id===stub+"actions")return actionSource;if(id===stub+"navigation")return 'export const useRouter=()=>({refresh(){}});';}}],resolve:{alias:[{find:/^@\/server\/actions\/.*$/,replacement:stub+"actions"},{find:"next/navigation",replacement:stub+"navigation"},{find:"@",replacement:path.join(root,"src")}]},server:{host:"127.0.0.1",port:0}});
await server.listen();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE||"/usr/bin/chromium",args:["--no-sandbox","--disable-gpu"],headless:true});
const results=[];
try{
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844]]){
  const page=await browser.newPage({viewport:{width,height},locale:"zh-TW"}),errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const dialog=page.getByRole('dialog'),boxes=[];
  await page.getByLabel('搜尋排課學員',{exact:true}).fill('小安');await page.getByRole('button',{name:/小安.*＋/}).click();
  await page.getByLabel('課程',{exact:true}).selectOption('piano');
  for(const kind of ['single','fixed','trial','rental','single']){
   await page.getByLabel('安排類型',{exact:true}).filter({visible:true}).selectOption(kind);
   if(kind==='fixed')await page.getByLabel('固定課程頻率',{exact:true}).selectOption('BIWEEKLY');
   if(kind==='rental'){await page.locator('input[name="name"]').fill('租借測試者');await page.locator('input[name="phone"]').fill('0900000003');}
   boxes.push(await dialog.boundingBox());
   await page.screenshot({path:path.join(out,`${width}x${height}-${kind}.png`)});
  }
  const retained=await page.locator('[aria-label="排課學員"]:visible').textContent();
  await page.getByRole('radio',{name:'開放報名',exact:true}).check();await page.getByLabel('名額',{exact:true}).fill('8');
  await page.getByRole('button',{name:'新增',exact:true}).click();
  const payload=await page.evaluate(()=>globalThis.__qaSaved);
  const noLearners=payload?.enrollmentMode==='OPEN'&&payload.capacity===8&&payload.learners.length===0;
  const footer=await page.locator('footer:visible').boundingBox();
  const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  const stable=boxes.every(box=>Math.abs(box.width-boxes[0].width)<1&&Math.abs(box.height-boxes[0].height)<1&&Math.abs(box.y-boxes[0].y)<1);
  const pass=stable&&retained.includes('小安')&&noLearners&&!errors.length&&scrollWidth<=width+1&&footer.y+footer.height<=height;
  results.push({width,height,stable,draftRetained:retained.includes('小安'),openRegistration:noLearners,scrollWidth,footerVisible:footer.y+footer.height<=height,errors,pass});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(row=>!row.pass))process.exitCode=1;
}finally{await browser.close();await server.close();}
