// Synthetic component Preview. Does not log in, contact a backend or verify authorization.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
const out=path.resolve('/tmp/plan-grid-shortcuts-preview');mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/plan-grid-shortcuts-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('src')}});
const componentCss=readFileSync(path.join(out,'fixture.css'),'utf8');
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+componentCss);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{for(const [width,height] of [[1366,900],[768,1024],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):r.abort());
 await page.goto('https://synthetic.invalid/');await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
 await page.getByRole('button',{name:'補登已上課',exact:true}).waitFor();assert.equal(await page.locator('[data-lesson-slot]').count(),10);const boxes=await page.locator('[data-lesson-slot]').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width}}));
 if(width>=768){assert.equal(new Set(boxes.map(box=>box.y)).size,1);assert.ok(boxes.every(box=>box.width<=65));}
 await page.screenshot({path:path.join(out,`overview-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'補登已上課',exact:true}).click();await page.getByLabel('實際上課日期').waitFor();assert.equal(await page.getByLabel('調整類型').inputValue(),'BACKFILL');await page.screenshot({path:path.join(out,`backfill-${width}.png`),fullPage:true});
 await page.getByRole('button',{name:'返回方案',exact:true}).click();await page.getByRole('button',{name:'註銷堂數',exact:true}).click();assert.equal(await page.getByLabel('調整類型').inputValue(),'VOID');assert.equal(await page.getByLabel('實際上課日期').count(),0);
 await page.getByRole('button',{name:'確認調整',exact:true}).click();await page.getByText('剩餘 7 堂',{exact:true}).waitFor();await page.screenshot({path:path.join(out,`void-${width}.png`),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(errors.length,0);results.push({width,height,grid:10,backfill:'preselected',void:'preselected',savedBalance:7,errors});await page.close();
}writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
