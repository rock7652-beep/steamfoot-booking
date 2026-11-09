import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='artifacts/monthly-adjustments/feedback-density';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const metrics=[],errors=[];
try{
 for(const [size,width,height] of [['desktop',1366,900],['wide',1920,1080],['ipad-landscape',1024,768],['ipad-portrait',768,1024],['narrow',600,900]]){
  const page=await browser.newPage({viewport:{width,height},locale:'zh-TW'});page.on('pageerror',e=>errors.push(e.message));
  for(const variant of process.argv.includes('--before')?['before']:['after']){
   await page.goto(`http://127.0.0.1:4197/${variant==='before'?'?before=1':''}`,{waitUntil:'networkidle'});
   await page.evaluate(w=>{const main=document.querySelector('main');main.style.marginLeft=w>=768?'260px':'0';main.style.width=w>=768?'calc(100% - 260px)':'100%';},width);
   const section=page.locator('section[aria-label="獎勵與調整"]');await section.waitFor();
   const metric=await section.evaluate(node=>{
    const cells=[...node.querySelectorAll('tbody tr')],r=node.getBoundingClientRect(),first=cells[0].getBoundingClientRect();
    return {rows:cells.length,headerHeight:first.top-r.top,rowHeights:cells.map(el=>el.getBoundingClientRect().height),fullyVisibleRows:cells.filter(el=>el.getBoundingClientRect().bottom<=innerHeight).length,overflow:document.documentElement.scrollWidth>innerWidth,fontSize:getComputedStyle(cells[0]).fontSize,actionSizes:[...cells[0].querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))};
   });
   assert.equal(metric.rows,30);assert.equal(metric.overflow,false,`${variant} ${size} page overflow`);
   if(variant==='after')for(const action of metric.actionSizes){assert.ok(action.width>=44);assert.ok(action.height>=44);}
   await page.screenshot({path:`${out}/${variant}-${size}.png`});metrics.push({size,width,height,variant,...metric});
   await section.getByRole('button',{name:'＋新增調整'}).click();
   if(variant==='before')assert.ok(await page.locator('form:has(#monthly-adjustment-title) label').filter({hasText:'＊'}).count()>0,'--before requires the original component checkout; never relabel the new component as baseline');
   if(variant==='after'){const form=page.locator('form:has(#monthly-adjustment-title)');assert.equal(await form.getByLabel('日期 *',{exact:true}).count(),1);assert.equal(await form.locator('label').filter({hasText:'＊'}).count(),0);assert.equal(await form.getByRole('button',{name:'儲存',exact:true}).isVisible(),true);}
   await page.screenshot({path:`${out}/${variant}-${size}-form.png`});
  }
  await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/${process.argv.includes('--before')?'before':'after'}-density.json`,JSON.stringify({fixtureOnly:true,syntheticRows:30,sidebarWidth:260,metrics,errors},null,2)+'\n');
 console.log(JSON.stringify(metrics.map(({size,variant,headerHeight,fullyVisibleRows,rowHeights})=>({size,variant,headerHeight,fullyVisibleRows,typicalRowHeight:rowHeights[0]}))));
}finally{await browser.close();}
