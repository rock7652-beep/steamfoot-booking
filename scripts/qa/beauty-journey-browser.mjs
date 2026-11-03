import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),out=process.env.QA_OUTPUT||'/tmp/beauty-journey-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/beauty-journey-fixture.tsx'],bundle:true,define:{'process.env.NEXT_PUBLIC_BUILD_ENV':'"fixture"'},format:'iife',jsx:'automatic',outfile:out+'/app.js',alias:{'@':root+'/src'},loader:{'.css':'css'},plugins:[{name:'isolated-fixture',setup(b){
 b.onResolve({filter:/^@\/server\//},args=>({path:args.path,namespace:'mock-server'}));
 b.onLoad({filter:/.*/,namespace:'mock-server'},args=>{
  const file=path.join(root,'src',args.path.slice(2)+'.ts');const source=readFileSync(file,'utf8');const names=[...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(m=>m[1]);
  return {contents:names.map(name=>`export const ${name}=async(...args)=>{${name==='readBeautySlots'?"return {success:true,data:{slots:['14:00','14:30']}}":name==='bookBeautyParty'?"window.qaIntent=args[1];return {success:true,data:{groupId:'qa-group',ids:['a','b']}}":name==='collectBeautyPayment'?"window.qaIntent=args[0];return {success:true,data:{ids:['charge']}}":"throw new Error('Unexpected server operation in isolated preview')"}};`).join('\n'),loader:'js'};
 });
 b.onResolve({filter:/^@\/lib\/beauty\/collection-reader$/},()=>({path:'reader',namespace:'mock'}));
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'nav',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='nav'?"export const useRouter=()=>({refresh(){}});export const usePathname=()=>'/qa';export const useSearchParams=()=>new URLSearchParams();":"export const readBeautyCollectionQuote=async()=>({success:true,data:window.qaCharge});export const readBeautyCollectionStatus=async()=>({success:true,data:null});",loader:'js'}));
}}]});
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:root+'/src/app/globals.css'});writeFileSync(out+'/style.css',css.css+'\n'+readFileSync(out+'/app.css','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[];
for(const [width,height] of [[390,844],[360,800],[1366,900],[1920,1080],[1024,768],[768,1024]].filter(([w])=>!process.env.QA_WIDTH||w===Number(process.env.QA_WIDTH))){
 for(const kind of ['member','desk','payment']){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='fixture.local')throw Error('External requests forbidden');const p=u.pathname;return r.fulfill({contentType:p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html',body:p==='/app.js'?readFileSync(out+'/app.js'):p==='/style.css'?readFileSync(out+'/style.css'):'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>'});});
  await page.goto(`https://fixture.local/?kind=${kind}`);
  await page.waitForTimeout(100);if(errors.length)throw Error(JSON.stringify({kind,errors}));
  if(kind==='member'||kind==='desk'){
   await page.getByText('合併其他服務',{exact:true}).click();await page.getByRole('checkbox',{name:/B 臉部保養/}).check();
   await page.getByRole('checkbox',{name:/分別安排技師/}).check();await page.getByRole('combobox',{name:/此段技師/}).selectOption('two');
   await page.getByRole('checkbox',{name:/2 保濕護理/}).check();
   if(kind==='desk')await page.getByRole('checkbox',{name:/1 頭部放鬆/}).check();
   if(kind==='member'){
    await page.getByLabel('日期',{exact:true}).fill('2099-10-20');await page.getByRole('button',{name:'14:00',exact:true}).click();await page.getByRole('button',{name:'下一步',exact:true}).click();
    if(!await page.getByText('NT$ 200',{exact:true}).isVisible())throw Error('later segment add-on total hidden');
    await page.getByRole('button',{name:'返回修改',exact:true}).click();await page.getByRole('checkbox',{name:/1 頭部放鬆/}).check();await page.getByRole('button',{name:'查詢可用時段',exact:true}).click();await page.getByRole('button',{name:'14:00',exact:true}).click();await page.getByRole('button',{name:'下一步',exact:true}).click();
    if(!await page.getByText('NT$ 500',{exact:true}).isVisible())throw Error('incorrect add-on cash total');
   }else{await page.getByRole('button',{name:'確認預約',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='確認預約'&&!b.disabled));}
  }else{
   await page.getByRole('checkbox',{name:'混合付款'}).check();await page.getByLabel('付款金額 1',{exact:true}).fill('200');await page.getByLabel('付款方式 2',{exact:true}).selectOption('CREDIT_CARD');await page.getByLabel('付款金額 2',{exact:true}).fill('300');
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow||errors.length)throw Error(JSON.stringify({width,kind,overflow,errors}));
  await page.screenshot({path:`${out}/${kind}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:kind==='payment'?'確認收款':'確認預約',exact:true}).click();
  await page.waitForFunction(()=>!!window.qaIntent,{},{timeout:5000}).catch(async e=>{console.log(JSON.stringify({width,kind,errors,body:await page.locator('body').innerText(),invalid:await page.locator('input:invalid').evaluateAll(els=>els.map(e=>({name:e.outerHTML,message:e.validationMessage})))}));throw e;});const intent=await page.evaluate(()=>window.qaIntent);
  if(kind==='payment'){if(intent.splits?.[0].amount!==200||intent.splits?.[1].method!=='CARD')throw Error('mixed payment intent');}
  else {if(intent.people.length!==1||intent.people[0].additionalServices?.[0].cardId!=='card-B'||intent.people[0].additionalServices?.[0].specifiedTechnicianId!=='two')throw Error('journey intent');}
  results.push({kind,width,height,overflow,errors,submitted:true});
  if(kind==='member'){
   await page.goto('https://fixture.local/?kind=member&single=1');if(await page.getByText('合併其他服務',{exact:true}).count())throw Error('single-plan customer sees combination entry');
  }
  await page.close();
 }
}
writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();
