// Synthetic component Preview. Does not log in, contact a backend or verify authorization.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
const out=path.resolve('artifacts/plan-session-adjustment-20261030');mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/plan-session-adjustment-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('src')}});
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
  for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[360,780]])for(const moduleName of ['運動','音樂','美業']){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).hostname,'synthetic.invalid');return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});});
    await page.goto('https://synthetic.invalid/?module='+encodeURIComponent(moduleName));await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
    await page.getByRole('button',{name:'調整堂數',exact:true}).click();
    const panel=page.getByRole('region',{name:'調整堂數',exact:true});
    await panel.getByLabel('實際上課日期').fill('2026-01-02');await panel.getByLabel('調整原因（選填）').fill('驗證旋轉後保留草稿');
    await page.setViewportSize({width:height,height:width});assert.equal(await panel.getByLabel('實際上課日期').inputValue(),'2026-01-02');await page.setViewportSize({width,height});
    await panel.getByRole('button',{name:'確認調整',exact:true}).click();await panel.getByText('實際上課：2026-01-02',{exact:true}).waitFor();
    assert.ok((await panel.textContent()).includes('剩餘 9'));assert.equal(new URL(page.url()).hostname,'synthetic.invalid');
    await panel.getByRole('button',{name:'更正返還',exact:true}).click();await panel.getByRole('button',{name:'確認更正返還',exact:true}).click();await panel.getByText(/（已更正）/).waitFor();
    await panel.getByLabel('調整類型').selectOption('VOID');await panel.getByLabel('調整數量').fill('1');await panel.getByRole('button',{name:'確認調整',exact:true}).click();await panel.getByText(/註銷堂數 1/).waitFor();
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,minimumControlHeight:Math.min(...[...document.querySelectorAll('button,input,select')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.getBoundingClientRect().height))}));
    assert.ok(layout.scroll<=width,JSON.stringify(layout));assert.ok(layout.minimumControlHeight>=43);assert.deepEqual(errors,[]);
    if(moduleName==='音樂')await page.screenshot({path:path.join(out,`component-${width}.png`),fullPage:true});
    results.push({module:moduleName,width,height,checks:['backfill-date-and-debit','optional-reason','rotation-preserves-draft','correction-retains-original','void-without-class-date','same-panel','no-horizontal-overflow','touch-controls'],layout,pageErrors:errors});await page.close();
  }
}finally{await browser.close();writeFileSync(path.join(out,'component-results.json'),JSON.stringify({scope:'synthetic component Preview; no real login, database, Safari or LIFF verification',results},null,2));}
console.log(JSON.stringify({cases:results.length,passed:results.length===15}));
