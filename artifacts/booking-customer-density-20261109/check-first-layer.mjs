import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try {
for(const [name,width,height] of [['desktop',1440,1000],['ipad-landscape',1024,768],['ipad-portrait',768,1024],['narrow',390,844]]){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5198');
 await page.getByRole('button',{name:'預約人員預覽',exact:true}).click();
 await page.locator('.fixed.bottom-0').evaluate(el=>{el.style.display='none';});
 const panel=page.locator('[data-preview-panel]');const before=await panel.boundingBox();
 const row=page.locator('[aria-label="陳小姐"]');
 await row.getByRole('button',{name:'收款並完成 $499',exact:true}).waitFor();
 await page.screenshot({path:new URL(`./${name}-first-layer-overview.png`,import.meta.url).pathname});
 await row.getByRole('button',{name:'收款並完成 $499',exact:true}).click();
 if(await page.getByRole('dialog').count())throw Error('unexpected extra payment dialog');
 await row.getByRole('form',{name:'陳小姐收款'}).waitFor();
 await page.screenshot({path:new URL(`./${name}-first-layer-payment.png`,import.meta.url).pathname});
 await row.getByRole('button',{name:'確認收款 $499',exact:true}).click();
 await row.getByText('已收 $499・現金',{exact:false}).waitFor();
 if(await row.locator('form').count())throw Error('payment form not collapsed');
 await row.getByRole('button',{name:'＋新增方案',exact:true}).click();
 await row.getByRole('button',{name:'模擬購買 10 堂方案',exact:true}).click();
 await row.getByText('新購 10 堂方案・剩 10 堂・下次使用').waitFor();
 const after=await panel.boundingBox();
 if(before.height!==after.height || before.width!==after.width)throw Error('reservation dialog changed dimensions');
 await page.screenshot({path:new URL(`./${name}-first-layer-purchased.png`,import.meta.url).pathname});
 if(await page.getByRole('dialog').count())throw Error('unexpected extra dialog after purchase');
 if(errors.length)throw Error(errors.join(';'));
 results.push({name,width,height,passed:true,checks:['compact first-layer reservation details','inline individual collection; no extra dialog','same companion row after payment','new purchase summary with 10 sessions; no deduction','stable reservation dimensions'],data:'isolated fixture; simulated payments and purchases only'});
 await page.close();
}
await writeFile(new URL('./first-layer-browser-results.json',import.meta.url),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
