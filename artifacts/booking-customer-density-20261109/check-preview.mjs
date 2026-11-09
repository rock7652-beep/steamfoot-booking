import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try {
for(const [name,width,height] of [['desktop',1440,1000],['ipad-landscape',1024,768],['ipad-portrait',768,1024],['short-screen',1024,600],['narrow',390,844]]){
 const page=await browser.newPage({viewport:{width,height}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5198');
 await page.locator('.fixed.bottom-0').evaluate(el=>{el.style.display='none';});
 await page.getByRole('button',{name:'管理方案',exact:true}).count();
 await page.getByText('剩餘 9 堂｜已約 2 堂｜可約 7 堂').waitFor();
 const panel=page.locator("[data-preview-panel]");
 const initialBox=await panel.boundingBox();
 await page.screenshot({path:new URL(`./${name}-overview.png`,import.meta.url).pathname});
 await page.getByRole('button',{name:'預約紀錄',exact:true}).click();
 await page.getByText('第 1 頁').waitFor();
 const recordBox=await panel.boundingBox();
 if(Math.abs(initialBox.height-recordBox.height)>1 || initialBox.width!==recordBox.width || initialBox.y!==recordBox.y)throw Error("panel changed size or position switching tabs");
 await page.getByRole('button',{name:'下一頁',exact:true}).click();
 await page.getByText('第 2 頁').waitFor();
 const scroller=page.locator('.overscroll-contain');
 await scroller.evaluate(el=>{el.scrollTop=24;});
 const scrollBefore=await scroller.evaluate(el=>el.scrollTop);
 await page.getByRole('button',{name:'總覽',exact:true}).click();
 await page.getByRole('button',{name:'預約紀錄',exact:true}).click();
 if(!await page.getByText('第 2 頁').isVisible())throw Error('page reset on switching tabs');
 const scrollAfter=await scroller.evaluate(el=>el.scrollTop);
 if(Math.abs(scrollBefore-scrollAfter)>1)throw Error('record scroll reset on switching tabs');
 await page.screenshot({path:new URL(`./${name}-records.png`,import.meta.url).pathname});
 await page.getByRole('button',{name:'基本／健康資料',exact:true}).click();
 await page.getByText('基本資料',{exact:true}).waitFor();
 const profileBox=await panel.boundingBox();
 if(Math.abs(initialBox.height-profileBox.height)>1)throw Error("profile changed panel height");
 if(width>=640 && (initialBox.height!==Math.min(640,height-48) || initialBox.y+initialBox.height>height))throw Error("fixed height outside viewport");
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error(`${name}: page horizontal overflow`);
 if(errors.length)throw Error(errors.join(';'));
 results.push({name,width,height,passed:true,checks:['fixed 640px panel; stable tab geometry','overview balance','records pagination','tab retains page and scroll','profile accessible','no page overflow'],data:'isolated fixture; no real transactions'});
 await page.close();
}
await writeFile(new URL('./browser-results.json',import.meta.url),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
} finally {await browser.close();}
