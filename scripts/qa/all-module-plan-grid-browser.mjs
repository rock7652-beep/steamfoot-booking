import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const root=process.cwd(),out='/tmp/all-module-plan-grid-qa';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/all-module-plan-grid-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'}});
const component=readFileSync(path.join(out,'fixture.css'),'utf8');
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+component);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{for(const [width,height] of [[390,844],[768,1024],[1024,768],[1366,900]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):r.abort());
 await page.goto('https://synthetic.invalid/plan-grids');await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
 await page.locator('[data-module="beauty"] [data-lesson-slot]').first().waitFor();
 const grids={};for(const [module,total]of [['steam',10],['beauty',20],['music',8],['sports',10]]){
  const section=page.locator(`[data-module="${module}"]`),cells=section.locator('[data-lesson-slot]');if(await cells.count()!==total)throw Error(`${module}: incorrect quantity`);
  const geometry=await cells.evaluateAll(rows=>rows.map(row=>{const slot=row.firstElementChild,r=row.getBoundingClientRect(),s=getComputedStyle(slot);return{x:r.x,y:r.y,height:r.height,textAlign:s.textAlign,font:s.fontSize,justify:s.justifyContent};}));
  const columns=geometry.filter(r=>Math.abs(r.y-geometry[0].y)<2).length;
  if(width>=768&&columns!==Math.min(total,10))throw Error(`${module}: expected dense desktop columns, got ${columns}`);
  if(geometry.some(r=>r.height<44||r.justify!=='center'||r.textAlign!=='center'))throw Error(`${module}: cell readability/alignment`);
  if(await section.evaluate(e=>e.scrollWidth>e.clientWidth+1))throw Error(`${module}: overflow`);
  grids[module]={total,columns,rows:new Set(geometry.map(r=>Math.round(r.y))).size};
 }
 await page.locator('[data-module="beauty"] [data-completed=true] button').first().click();await page.getByRole('status').filter({hasText:'孩子甲'}).waitFor();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)||errors.length)throw Error('Browser errors or page overflow: '+errors.join(','));
 await page.screenshot({path:path.join(out,`grids-${width}.png`),fullPage:true});results.push({width,height,grids,sharedUserVisible:true,realWrites:false,errors});await page.close();
}writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
