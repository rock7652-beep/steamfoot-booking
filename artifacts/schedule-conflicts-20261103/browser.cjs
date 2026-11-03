const {chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const {writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[];
 try{
  for(const viewport of [{width:1366,height:900},{width:1024,height:768},{width:768,height:1024}])for(const module of ['sports','beauty']){
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:5197/?module=${module}`);
   if(module==='sports'){
    await page.getByRole('button',{name:'新增',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'2026-11-30'}).waitFor();
   }else await page.getByRole('status').filter({hasText:'2026-11-23 08:30'}).waitFor();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   assert.equal(overflow,false,'page must not overflow horizontally');
   const message=module==='sports'?page.getByRole('alert'):page.getByRole('status').filter({hasText:'指定位置'});
   const rect=await message.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=viewport.width+1,'message within viewport');
   await page.screenshot({path:path.join(__dirname,`${module}-${viewport.width}x${viewport.height}.png`),fullPage:true});
   if(module==='sports'){
    assert.equal(await page.getByLabel('排課日期',{exact:true}).inputValue(),'2026-11-23');
    await page.getByLabel('排課時間',{exact:true}).fill('11:00');
    await page.getByRole('button',{name:'新增',exact:true}).click();
    await page.waitForFunction(()=>window.fixtureCreated.length===1);
    const calls=await page.evaluate(()=>window.fixtureCalls);assert.equal(calls.length,2);assert.equal(calls[0].payload.requestKey,calls[1].payload.requestKey);
   }else{
    assert.equal(await page.getByLabel('顧客姓名 1',{exact:true}).inputValue(),'合成顧客 · 0900000000');
    await page.getByLabel('預約開始時間',{exact:true}).fill('11:00');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='確認預約'&&!button.disabled));
    await page.getByRole('button',{name:'確認預約',exact:true}).click();
    await page.waitForFunction(()=>window.fixtureCreated.length===1);
    assert.equal((await page.evaluate(()=>window.fixtureCalls))[0].people[0].customerId,'c');
   }
   assert.deepEqual(errors,[]);results.push({module,viewport,overflow,conflictVisible:true,draftPreserved:true,retrySucceeded:true});await page.close();
  }
  writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({scope:'Real React components, mocked isolated ports; no database/auth/notifications or hosted end-to-end verification',results},null,2));
  console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
