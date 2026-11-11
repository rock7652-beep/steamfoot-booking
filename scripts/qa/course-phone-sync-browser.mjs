// Real component + cache, synthetic server response; not a signed-in business acceptance test.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
const out='/tmp/course-phone-sync-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/course-phone-sync-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_BUILD_ENV':'"synthetic"'},alias:{'@':path.resolve('src')},plugins:[{name:'synthetic-phone-response',setup(b){b.onResolve({filter:/^@\/server\/actions\/course-phone-summary$/},()=>({path:'summary',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:'export const loadCoursePhoneSummary=()=>window.__readPhoneSummary();',loader:'js'}));}}]});
const componentCss=readFileSync(path.join(out,'fixture.css'),'utf8');
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+componentCss);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const [width,height] of [[390,844],[768,1024],[1366,900]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):r.abort());
 await page.goto('https://synthetic.invalid/book');await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
 await page.getByRole('button',{name:'重新讀取',exact:true}).waitFor();if(!await page.locator('details.cp-phone-learner').count())throw new Error(await page.locator('body').innerText());
 const learner=page.locator('details.cp-phone-learner');await learner.locator(':scope > summary').click();await page.getByText('剩餘 8 堂 · 已預約 0 堂 · 可再約 8 堂',{exact:true}).waitFor();
 const history=page.locator('details.cp-phone-history');await history.locator(':scope > summary').click();
 await page.getByRole('button',{name:'模擬後台補登',exact:true}).click();await page.getByText('剩餘 7 堂 · 已預約 0 堂 · 可再約 7 堂',{exact:true}).waitFor();
 assert.equal(await learner.getAttribute('open'),'');assert.equal(await history.getAttribute('open'),'');
 const record=history.getByText('2026-11-10 · 鋼琴八堂方案 · 已出席（補登）',{exact:true});await record.waitFor();assert.equal((await history.innerText()).includes('00:00'),false);
 assert.equal(await page.locator('[data-lesson-slot][data-completed="true"]').count(),1);await page.screenshot({path:path.join(out,`backfill-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'模擬更正返還',exact:true}).click();await page.getByText('剩餘 8 堂 · 已預約 0 堂 · 可再約 8 堂',{exact:true}).waitFor();assert.equal(await page.locator('[data-lesson-slot][data-completed="true"]').count(),0);assert.equal(await record.count(),0);await page.screenshot({path:path.join(out,`corrected-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'模擬撤銷查看',exact:true}).click();await page.getByText('原會員摘要',{exact:true}).waitFor();assert.equal(await learner.count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);results.push({width,height,backfill:'balance+grid+history updated',correction:'date removed and balance returned',revocation:'family data removed',openState:'preserved',errors});await page.close();
}writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
