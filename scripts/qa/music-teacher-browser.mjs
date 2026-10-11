// Run from repository root. No credentials, app routes, or database access.
// QA_PLAYWRIGHT_MODULE / QA_CHROMIUM_EXECUTABLE select external installed tooling; no dependency is added to the production application.
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import path from "node:path";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||"playwright");

const root=process.cwd(),out=path.resolve(process.env.QA_OUTPUT||"/tmp/music-teacher-visual");
mkdirSync(out,{recursive:true});
const fontCss=process.env.QA_FONT_CSS?readFileSync(process.env.QA_FONT_CSS,"utf8").replace(/url\(([^)]+)\)/g,(_match,file)=>`url(data:font/woff2;base64,${readFileSync(path.resolve(path.dirname(process.env.QA_FONT_CSS),file)).toString("base64")})`)+"body{font-family:\"Noto Sans TC\",sans-serif!important}":null;
const stub="\0pr1283-stub:";
const server=await createServer({root,cacheDir:"/tmp/music-teacher-simplify-vite",optimizeDeps:{include:["react","react-dom","react-dom/client","sonner","zod"]},configFile:false,plugins:[react(),{
 name:"synthetic-only-actions",
 configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url==="/"||req.url?.startsWith("/?")){
  res.setHeader("Content-Type","text/html");
  server.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/music-teacher-fixture.tsx"></script></body></html>').then(html=>res.end(html));
 }else next();
});},
 resolveId(id){
  if(id.startsWith(stub))return id;
  if(id==="next/navigation")return stub+"navigation";
  if(id==="next/link")return stub+"nextlink";
  if(id==="@/components/dashboard-link")return stub+"link";
  if(id.startsWith("@/server/actions/"))return stub+"actions";
 },
 load(id){
  if(id===stub+"navigation")return 'export const useSearchParams=()=>new URLSearchParams();export const usePathname=()=>"/dashboard/staff";export const useRouter=()=>({refresh(){throw Error("No route refresh in fixture")},push(){}});';
  if(id===stub+"nextlink")return 'export default "a";';
  if(id===stub+"link")return 'export const DashboardLink="a";';
  if(id===stub+"actions")return 'export const readCourseStaffTeaching=async()=>({success:true,version:"2026-10-10T00:00:00.000Z",qualificationIds:["g"],fees:[],musicSettings:{defaultRatio:0.6,subjectRules:{}}});export const loadCourseCustomerSearchIndex=async()=>({success:true,rows:[]});export const searchCourseCustomers=loadCourseCustomerSearchIndex;export const applyCourseBatchStatus=async()=>{throw Error("disabled")};export const courseStatusImpact=applyCourseBatchStatus;export const deleteCourseItems=applyCourseBatchStatus;export const saveCourseDisplayOrder=applyCourseBatchStatus;export const getCourseStaffAvailability=async()=>globalThis.__qaAvailability;export const activateStaff=async()=>{throw Error("Disabled")};export const deactivateStaff=activateStaff;export const resetStaffPasswordAction=activateStaff;';
 }
}],resolve:{alias:[{find:"next/link",replacement:stub+"nextlink"},{find:/^@\/server\/actions\/.*$/,replacement:stub+"actions"},{find:"@/components/dashboard-link",replacement:stub+"link"},{find:"next/navigation",replacement:stub+"navigation"},{find:"@",replacement:path.join(root,"src")}]},server:{host:"127.0.0.1",port:0}});
await server.listen();
const port=server.httpServer.address().port;
let browser;
const results=[];
try{
 browser=await chromium.launch(process.env.QA_CHROMIUM_EXECUTABLE?{executablePath:process.env.QA_CHROMIUM_EXECUTABLE,args:["--no-sandbox","--disable-gpu"],headless:true}:{headless:true});
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/`);
 await page.getByRole("button",{name:"編輯",exact:true}).click();
 if(fontCss)await page.addStyleTag({content:fontCss});
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('input[name="phone"]').fill("0912345678");
 const boxes=[];
 for(const tab of ["基本資料","授課與拆帳","LINE 與權限","基本資料"]){
 await page.getByRole("button",{name:tab,exact:true}).click();
 await page.screenshot({path:path.join(out,`${width}x${height}-${tab}.png`)});
 boxes.push(await page.locator('[role="dialog"]').boundingBox());
 }
 await page.getByRole("button",{name:"授課與拆帳",exact:true}).click();
 await page.getByLabel("老師全科預設比例",{exact:true}).fill("40");
 await page.getByRole("button",{name:"選擇課程",exact:true}).click();
 await page.getByLabel("搜尋課程",{exact:true}).fill("30");
 await page.getByRole("button",{name:"勾選這 1 項",exact:true}).click();
 const courseSelected=await page.getByRole("checkbox",{name:"吉他個別課程 30",exact:true}).isChecked();
 await page.getByRole("button",{name:"LINE 與權限",exact:true}).click();
 await page.getByRole("button",{name:"授課與拆帳",exact:true}).click();
 const feeRetained=await page.getByLabel("老師全科預設比例",{exact:true}).inputValue()==="40";
 await page.getByRole("button",{name:"關閉",exact:true}).click();
 await page.getByRole("button",{name:"繼續編輯",exact:true}).click();
 await page.getByRole("button",{name:"基本資料",exact:true}).click();
 const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));
 const draftRetained=await page.locator('input[name="phone"]').inputValue()==="0912345678";
 const stable=boxes.every(b=>Math.abs(b.height-boxes[0].height)<1&&Math.abs(b.y-boxes[0].y)<1&&Math.abs(b.width-boxes[0].width)<1);
 const submit=await page.locator('button[type="submit"]').boundingBox();
 results.push({width,height,stable,draftRetained,feeRetained,courseSelected,errors,...metrics,pass:stable&&draftRetained&&feeRetained&&courseSelected&&!errors.length&&metrics.scrollWidth<=width+1&&submit.y+submit.height<=height});
 await page.screenshot({path:path.join(out,`${width}x${height}.png`)});await page.close();
 }
 writeFileSync(path.join(out,"results.json"),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
 if(results.some(result=>!result.pass))process.exitCode=1;
}finally{await browser?.close();await server.close();}
