// Real adjustment component, synthetic responses. Not a signed-in business acceptance test.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
const out='/tmp/backfill-review-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/backfill-review-fixture.jsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('src')}});
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const [width,height] of [[390,844],[768,1024],[1366,900]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):r.abort());
 await page.goto('https://synthetic.invalid/');await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
 await page.getByLabel('實際上課日期').fill('2026-11-03');await page.getByRole('button',{name:'確認調整',exact:true}).click();await page.getByText('疑似重複補登',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__syntheticDebits),0);
 const confirmation=page.getByRole('button',{name:'確認為另一堂，仍要補登',exact:true});await confirmation.waitFor();await page.screenshot({path:path.join(out,`warning-${width}.png`),fullPage:true});
 await confirmation.evaluate(button=>{button.click();button.click();});await page.getByText('已核對為同日另一堂',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__syntheticDebits),1);await page.screenshot({path:path.join(out,`confirmed-${width}.png`),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);results.push({width,height,warningWrites:0,confirmedDoubleClickWrites:1,confirmationRecorded:true,errors});await page.close();
}writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
