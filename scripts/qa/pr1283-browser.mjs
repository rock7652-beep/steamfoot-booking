// Run from repository root. No credentials, app routes, or database access.
// QA_PLAYWRIGHT_MODULE / QA_CHROMIUM_EXECUTABLE select external installed tooling; no dependency is added to the production application.
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import path from "node:path";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||"playwright");

const root=process.cwd(),out=path.resolve(process.env.QA_OUTPUT||"/tmp/pr1283-visual");
mkdirSync(out,{recursive:true});
const fontCss=process.env.QA_FONT_CSS?readFileSync(process.env.QA_FONT_CSS,"utf8").replace(/url\(([^)]+)\)/g,(_match,file)=>`url(data:font/woff2;base64,${readFileSync(path.resolve(path.dirname(process.env.QA_FONT_CSS),file)).toString("base64")})`)+"body{font-family:\"Noto Sans TC\",sans-serif!important}":null;
const stub="\0pr1283-stub:";
const server=await createServer({root,configFile:false,plugins:[react(),{
 name:"synthetic-only-actions",
 configureServer(server){server.middlewares.use((req,res,next)=>{
 if(req.url==="/"||req.url?.startsWith("/?")){
  res.setHeader("Content-Type","text/html");
  server.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/pr1283-fixture.tsx"></script></body></html>').then(html=>res.end(html));
 }else next();
});},
 resolveId(id){
  if(id.startsWith(stub))return id;
  if(id==="next/navigation")return stub+"navigation";
  if(id==="@/components/dashboard-link")return stub+"link";
  if(id.startsWith("@/server/actions/"))return stub+"actions";
 },
 load(id){
  if(id===stub+"navigation")return 'export const usePathname=()=>"/dashboard/staff";export const useRouter=()=>({refresh(){throw Error("No route refresh in fixture")},push(){}});';
  if(id===stub+"link")return 'export const DashboardLink="a";';
  if(id===stub+"actions")return 'export const getCourseStaffAvailability=async()=>globalThis.__qaAvailability;export const activateStaff=async()=>{throw Error("Disabled")};export const deactivateStaff=activateStaff;export const resetStaffPasswordAction=activateStaff;';
 }
}],resolve:{alias:[{find:/^@\/server\/actions\/.*$/,replacement:stub+"actions"},{find:"@/components/dashboard-link",replacement:stub+"link"},{find:"next/navigation",replacement:stub+"navigation"},{find:"@",replacement:path.join(root,"src")}]},server:{host:"127.0.0.1",port:0}});
await server.listen();
const port=server.httpServer.address().port;
let browser;
const results=[];
try{
 browser=await chromium.launch(process.env.QA_CHROMIUM_EXECUTABLE?{executablePath:process.env.QA_CHROMIUM_EXECUTABLE,args:["--no-sandbox","--disable-gpu"],headless:true}:{headless:true});
 for(const view of ["availability","staff"]){
  for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844],[360,800]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];
   page.on("pageerror",error=>{errors.push(error.message);console.error(error.message)});page.on("console",msg=>{if(msg.type()==="error")console.error(msg.text())});
   await page.goto(`http://127.0.0.1:${port}/?view=${view}`);
   await page.getByText("#1283 虛構元件畫面測試",{exact:false}).waitFor({timeout:15000});
   if(view==="staff")await page.getByRole("button",{name:"＋ 新增人員",exact:true}).click();
   else await page.getByRole("button",{name:"儲存時間",exact:true}).waitFor();
   if(fontCss)await page.addStyleTag({content:fontCss});
   await page.evaluate(()=>document.fonts.ready);
   const metrics=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,invalidFields:[...document.querySelectorAll('input,select')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1)}).map(el=>el.getAttribute("name")||el.getAttribute("aria-label"))}));
   const draft=page.locator(view==="staff"?'input[name="displayName"]':'input[type="date"]');
   if(view==="availability")await page.locator("details summary").click();
   const draftValue=view==="staff"?"旋轉保留測試":"2030-10-10";
   await draft.fill(draftValue);await page.setViewportSize({width:height,height:width});await page.setViewportSize({width,height});
   const draftRetained=await draft.inputValue()===draftValue;
   const result={view,width,height,...metrics,draftRetained,errors,pass:draftRetained&&metrics.scrollWidth<=width+1&&metrics.bodyWidth<=width+1&&!metrics.invalidFields.length&&!errors.length};
   results.push(result);
   await page.screenshot({path:path.join(out,`${view}-${width}x${height}.png`),fullPage:true});
   await page.close();
  }
 }
 writeFileSync(path.join(out,"results.json"),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
 if(results.some(result=>!result.pass))process.exitCode=1;
}finally{await browser?.close();await server.close();}
