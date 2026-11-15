// Synthetic browser preview. All networking is blocked and server actions are mocked.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright-core');
const root=process.cwd(),out='/tmp/module-purchase-cancel-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/module-purchase-cancel-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_BUILD_ENV':'"synthetic"'},alias:{'@':path.join(root,'src')},plugins:[{name:'synthetic-actions',setup(b){
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({loader:'js',contents:`export const useRouter=()=>({refresh(){}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);`}));
 b.onResolve({filter:/^@\/server\//},a=>({path:path.join(root,'src',a.path.slice(2)+'.ts'),namespace:'actions'}));
 b.onLoad({filter:/.*/,namespace:'actions'},a=>({loader:'js',contents:[...readFileSync(a.path,'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(m=>`export const ${m[1]}=(...args)=>window.qaAction(${JSON.stringify(m[1])},...args);`).join('\n')}));
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8')+'\n'+readFileSync(path.join(out,'fixture.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{
 for(const moduleName of ['fitness','music','beauty'])for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith('https://synthetic.invalid/')?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
  await page.goto(`https://synthetic.invalid/?module=${moduleName}`);
  await page.evaluate(()=>{window.qaCalls=[];window.qaAction=async(name,input)=>{if(!['voidCoursePurchase','voidBeautyNativeTransaction'].includes(name))throw Error('Unexpected action '+name);window.qaCalls.push({name,input});return {success:true};};});
  await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
  await page.getByRole('button',{name:/查看/}).click();
  // Metadata correction and refunds still require their own existing information.
  await page.getByRole('button',{name:'更正',exact:true}).click();
  if(await page.getByRole('button',{name:'儲存更正',exact:true}).isEnabled())throw Error('Metadata reason guard removed');
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await page.getByRole('button',{name:'作廢交易',exact:true}).click();
  await page.getByRole('textbox',{name:'作廢原因（選填）',exact:true}).waitFor();
  const submit=page.getByRole('button',{name:'確認作廢',exact:true});if(!await submit.isEnabled())throw Error('Blank cancellation reason blocked');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal page overflow');
  await page.screenshot({path:path.join(out,`${moduleName}-${width}.png`)});
  await submit.click();await page.getByText('交易已作廢，額度與收款紀錄已沖銷。',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.qaCalls);if(calls.length!==1||calls[0].input.reason!=='')throw Error('Wrong or duplicate cancellation');
  if(moduleName==='beauty'&&calls[0].input.expectedStoreId!=='synthetic-store')throw Error('Store scope lost');
  if(errors.length)throw Error(errors.join('\n'));
  results.push({module:moduleName,width,height,blankReasonAccepted:true,metadataGuardRetained:true,submittedOnce:true,noReplacementRequired:true});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'synthetic browser UI only; financial services verified separately',results},null,2));console.log(JSON.stringify({output:out,results}));
}finally{await browser.close();}
