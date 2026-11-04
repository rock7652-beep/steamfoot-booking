import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out='/workspace/beauty-opening-review-20261104';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[],sizes=[];
try{const page=await browser.newPage({viewport:{width:1366,height:900},locale:'zh-TW'});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:4199',{waitUntil:'networkidle'});
 const guide=()=>page.getByRole('button',{name:'開店設定引導',exact:true});
 await guide().click();assert.equal(await page.getByRole('dialog').locator('ol li').count(),7);assert.equal(await page.getByRole('dialog').getByRole('button',{name:'執行開店檢查'}).count(),0);assert.equal(await page.getByRole('dialog').getByRole('checkbox').count(),0);await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'模擬其他店家確認',exact:true}).click();assert.equal(await guide().count(),1);await page.getByRole('button',{name:'模擬最後資料儲存確認',exact:true}).click();assert.equal(await guide().count(),0);assert.equal(await page.getByRole('button',{name:'修改',exact:true}).count(),2);
 await page.getByRole('button',{name:'已完成店家',exact:true}).click();assert.equal(await guide().count(),0);await page.screenshot({path:`${out}/completed-desktop.png`});await page.getByRole('button',{name:'未完成店家',exact:true}).click();
 for(const [name,width,height] of [['desktop',1366,900],['ipad-landscape',1024,768],['ipad-portrait',768,1024],['narrow',600,900],['mobile',390,844],['small-mobile',360,800]]){await page.setViewportSize({width,height});await guide().click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const rect=await dialog.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1);assert.ok(rect.y>=0&&rect.y+rect.height<=height+1);await page.screenshot({path:`${out}/${name}.png`});await page.getByRole('button',{name:'關閉',exact:true}).click();sizes.push({name,width,height});}
 assert.deepEqual(errors,[]);writeFileSync(`${out}/results.json`,JSON.stringify({fixtureOnly:true,checks:['incomplete shows guide','seven links, no fixed check or completion button','complete hides initially','same-store confirmed save hides immediately','other-store save ignored','normal settings retained'],sizes,errors},null,2)+'\n');console.log(JSON.stringify({status:'passed',sizes:sizes.length,errors}));
}finally{await browser.close();}
