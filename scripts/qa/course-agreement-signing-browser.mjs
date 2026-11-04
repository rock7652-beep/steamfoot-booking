// Actual components, synthetic responses, every outgoing request intercepted.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),out='/workspace/reports/course-agreement-signing';mkdirSync(out,{recursive:true});
await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{PublicCourseAgreementSigning}from'./src/components/course-agreements/public-signing';
import{CourseAgreementReceiptView}from'./src/components/course-agreements/receipt';
import{CourseAgreementWorkspace}from'./src/app/(dashboard)/dashboard/courses/agreements/agreement-workspace';
import{emptyCourseAgreement,buildCourseAgreement}from'./src/lib/course-agreement';
const draft={...emptyCourseAgreement('合成音樂教室','03-0000000','合成路 1 號'),entity:'合成音樂補習班',responsible:'合成負責人',city:'新竹縣',business:'cram',makeup:'雙方協調補課',privacyNotice:'此為隔離操作預覽，所有姓名及電話均為合成資料。'};
const initial={brand:draft.brand,version:1,documentHash:'a'.repeat(64),document:buildCourseAgreement(draft)};
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXcAAAAASUVORK5CYII=';
window.qaSigns=[];window.qaPauses=[];window.qaBegins=[];
function App(){const[receipt,setReceipt]=useState(null);const manager=new URLSearchParams(location.search).has('manager');
window.qaShowReceipt=()=>setReceipt({...initial,id:'synthetic-record',signer:window.qaSigns.at(-1).signer,deliveredAt:'2026-11-03T12:00:00Z',signedAt:'2026-11-03T12:01:00Z',signatureDataUrl:pixel});
if(receipt)return <CourseAgreementReceiptView value={receipt}/>;
if(manager)return <main className="p-4"><CourseAgreementWorkspace initial={{storeId:'a',revision:1,draft,active:{id:'v1',version:1,documentHash:initial.documentHash}}} save={async()=>{throw Error('not used')}} publish={async()=>{throw Error('not used')}} share={async()=>({success:true,data:{url:'https://synthetic.invalid/course-agreements/'+ 'a'.repeat(43),qrDataUrl:pixel}})} pause={async input=>{window.qaPauses.push(input);if(window.qaPauses.length===1)return{success:false,error:'模擬暫停失敗，保留原狀態'};return{success:true,data:{storeId:'a',revision:2,draft,active:null}}}}/></main>;
return <PublicCourseAgreementSigning initial={initial} begin={async fresh=>{window.qaBegins.push(!!fresh);return{success:true,data:{...initial,deliveredAt:'2026-11-03T12:00:00Z',expiresAt:'2026-11-10T12:00:00Z'}}}} sign={async input=>{window.qaSigns.push(input);await new Promise(r=>setTimeout(r,100));if(window.qaSigns.length===1)return{success:false,error:'模擬回應中斷，請重試相同資料',retrySame:true};return{success:true,data:{receiptPath:'/course-agreements/receipt/'+ 'b'.repeat(43)}}}}/>}
createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,jsx:'automatic',format:'iife',outfile:out+'/fixture.js',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.join(root,'src')},plugins:[{name:'next-stub',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'qa'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path==='navigation'?`export const unstable_rethrow=()=>{};export const useRouter=()=>({refresh(){},push(){},replace(){}});export const usePathname=()=>'/s/test/admin/dashboard/courses/agreements';export const useSearchParams=()=>new URLSearchParams();`:`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}`,loader:'js',resolveDir:root}));}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(out+'/fixture.css',css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('https://synthetic.invalid/')?route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):route.abort());
 const open=async query=>{await page.goto('https://synthetic.invalid/'+query);await page.addStyleTag({path:out+'/fixture.css'});await page.addScriptTag({path:out+'/fixture.js'});};
 await open('');await page.getByRole('button',{name:'取得約定書並開始填寫'}).click();
 await page.getByLabel('學員姓名',{exact:true}).fill('合成未成年學員');await page.getByLabel('聯絡電話',{exact:true}).fill('0911000001');
 await page.getByRole('combobox').selectOption('minor');await page.getByLabel('法定代理人姓名',{exact:true}).fill('合成家長');await page.getByLabel('與學員的關係',{exact:true}).fill('母親');await page.getByLabel('法定代理人電話',{exact:true}).fill('0911000002');
 await page.getByRole('checkbox').nth(0).check();await page.getByRole('checkbox').nth(1).check();
 const pad=page.getByRole('application',{name:'手寫簽名區'});await pad.scrollIntoViewIfNeeded();
 const rect=await pad.boundingBox();const cdp=await page.context().newCDPSession(page);
 const touch=(x,y)=>({x:rect.x+x*rect.width,y:rect.y+y*rect.height});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(.1,.3)]});for(const [x,y]of [[.2,.5],[.4,.2],[.5,.6],[.7,.4]])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(x,y)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 if(await pad.locator('polyline').count()!==1)throw Error('Touch signature missing');
 for(const [width,height]of [[360,800],[390,844],[768,1024],[1024,768],[1366,900]]){
  await page.setViewportSize({width,height});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow '+width);
  if(await page.getByLabel('法定代理人姓名',{exact:true}).inputValue()!=='合成家長')throw Error('Resize lost input');if(await pad.locator('polyline').count()!==1)throw Error('Resize lost strokes');
  await page.screenshot({path:out+'/sign-'+width+'.png',fullPage:true});results.push({width,height,overflow:false,touchSignatureRetained:true});
 }
 await page.getByRole('button',{name:'預覽簽署資料'}).click();await page.getByRole('heading',{name:'確認簽署資料'}).waitFor();
 await page.getByRole('button',{name:'確認簽署',exact:true}).click();await page.getByRole('alert').filter({hasText:'模擬回應中斷'}).waitFor();
 if(!await page.getByRole('button',{name:'返回修改',exact:true}).isDisabled())throw Error('Unknown outcome allowed changed payload');
 await page.getByRole('button',{name:'確認簽署',exact:true}).click();await page.getByRole('heading',{name:'已完成簽署'}).waitFor();
 const signs=await page.evaluate(()=>window.qaSigns);if(signs.length!==2||JSON.stringify(signs[0])!==JSON.stringify(signs[1]))throw Error('Retry changed request');if(!signs[0].signer.minor||signs[0].signer.guardian.name!=='合成家長')throw Error('Guardian not submitted');
 await page.getByRole('button',{name:'換下一位學員'}).click();if(await page.getByLabel('學員姓名',{exact:true}).inputValue()!=='')throw Error('Shared device retained prior learner');
 await page.evaluate(()=>window.qaShowReceipt());await page.getByRole('button',{name:'列印／另存 PDF'}).waitFor();await page.emulateMedia({media:'print'});await page.pdf({path:out+'/synthetic-signed-receipt.pdf',format:'A4',printBackground:true});await page.emulateMedia({media:'screen'});
 await open('?manager=1');await page.getByText('共同約定為選用功能', {exact:false}).waitFor();await page.getByRole('button',{name:'讓學員簽署'}).click();await page.getByRole('img',{name:'學員簽署 QR Code'}).waitFor();
 await page.getByRole('button',{name:'暫停新簽署',exact:true}).click();await page.getByRole('button',{name:'確認暫停',exact:true}).click();await page.getByRole('alert').filter({hasText:'模擬暫停失敗'}).waitFor();
 if(!await page.getByRole('button',{name:'讓學員簽署'}).isVisible())throw Error('Failed pause changed active state');
 await page.getByRole('button',{name:'確認暫停',exact:true}).click();await page.getByRole('status').filter({hasText:'已暫停新簽署'}).waitFor();if(await page.getByRole('button',{name:'讓學員簽署'}).count())throw Error('Paused sharing still visible');
 for(const[width,height]of[[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Manager overflow');await page.screenshot({path:out+'/paused-'+width+'.png',fullPage:true});}
 if(errors.length)throw Error(errors.join('\n'));writeFileSync(out+'/results.json',JSON.stringify({synthetic:true,realBackend:false,results,stableRetry:true,guardian:true,nextLearnerCleared:true,optionalAndPaused:true,printPdf:true,errors},null,2));console.log(JSON.stringify({results,errors}));
}catch(error){console.error(errors);const page=browser.contexts()[0]?.pages()[0];if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:out+'/failure.png',fullPage:true});}throw error;}finally{await browser.close();}
