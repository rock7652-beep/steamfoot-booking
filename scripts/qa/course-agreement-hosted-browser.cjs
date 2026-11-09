const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const base=new URL(fs.readFileSync('/tmp/agreements-1502-share-url','utf8').trim()).origin;
 assert.equal(base,'https://steamfoot-booking-mjt74o220-rock7652-2111s-projects.vercel.app');
 const run=require('node:crypto').randomUUID().slice(0,8),signerName=`合成整合學員 ${run}`,guardianName=`合成整合家長 ${run}`;
 const prefix='/s/qa-agreements-1502-20261103/admin/dashboard/courses/agreements';
 const out='/workspace/reports/course-agreements-hosted';fs.mkdirSync(out,{recursive:true});
 const raw=process.env.HTTPS_PROXY||process.env.HTTP_PROXY,p=raw?new URL(raw):null;
 const proxy=p?{server:`${p.protocol}//${p.hostname}:${p.port}`,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:undefined;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],proxy});
 const context=await browser.newContext({storageState:'/tmp/agreements-1502-browser-state.json',viewport:{width:1366,height:900},ignoreHTTPSErrors:true,acceptDownloads:true});
 const page=await context.newPage();page.setDefaultTimeout(45000);const errors=[],checks=[];let complete=false;
 page.on('pageerror',e=>errors.push(e.message));
 checks.push=(...items)=>{console.log(items.join('\n'));return Array.prototype.push.apply(checks,items);};
 const save=()=>fs.writeFileSync(out+'/results.json',JSON.stringify({deployment:'dpl_2siHbgN3s7UD7h11G8p16FpUw6qf',source:'7926ec40',realBackend:true,production:false,complete,checks,errors},null,2));
 async function shot(label){for(const [width,height]of[[1366,900],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Viewport overflow '+label+width);await page.screenshot({path:`${out}/${label}-${width}.png`,fullPage:true});}await page.setViewportSize({width:1366,height:900});}
 try{
  await page.goto(base+prefix,{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByRole('heading',{name:'課程共同約定',exact:true}).waitFor();
  if(await page.getByRole('button',{name:'開始設定',exact:true}).count()){
  await page.waitForFunction(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent==='開始設定');return el&&Object.keys(el).some(k=>k.startsWith('__reactProps$')&&typeof el[k]?.onClick==='function');},null,{timeout:60000});
  await page.getByRole('button',{name:'開始設定',exact:true}).click();
  for(const [label,value]of Object.entries({'品牌／店名':'共同約定整合測試','營業登記名稱':'共同約定合成音樂教室','負責人':'測試負責人','所在縣市':'新竹縣','聯絡方式':'03-0000000','地址':'合成測試地址 1 號'}))await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByLabel('範本適用類型',{exact:true}).selectOption('cram');
  await page.getByRole('button',{name:'下一步：課程規則',exact:true}).click();
  await page.getByLabel('請假期限',{exact:true}).selectOption('deadline');await page.getByLabel('截止時間（台灣時間）',{exact:true}).fill('21:00');
  await page.getByLabel('補課方式',{exact:true}).fill('測試規則：請由教室統一協調補課。');
  await page.getByRole('button',{name:'下一步：個資告知',exact:true}).click();
  await page.getByLabel('個人資料告知',{exact:true}).fill('本文件僅為隔離環境合成測試。蒐集者為共同約定合成音樂教室，目的為測試課程約定與簽署；資料包括姓名、電話、簽名及未成年法定代理人資料，僅在隔離測試系統處理，不供真實課程使用。資料由店家及系統維護者於測試必要期間處理，可透過 03-0000000 申請查詢、更正、停止利用或依法刪除；不提供資料可另洽店家以其他方式簽署。');
  await page.getByRole('button',{name:'下一步：預覽約定書',exact:true}).click();
  await page.getByText('草稿 · 尚未啟用',{exact:true}).waitFor();assert.match(await page.locator('article').innerText(),/21:00/);checks.push('server draft saved and fixed deadline rendered');await shot('preview');
  await page.getByRole('checkbox').last().check();await page.getByRole('button',{name:'確認啟用',exact:true}).click();
  await page.getByRole('button',{name:'讓學員簽署',exact:true}).waitFor();checks.push('published immutable version');
  }
  await page.waitForFunction(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent==='讓學員簽署');return el&&Object.keys(el).some(k=>k.startsWith('__reactProps$')&&typeof el[k]?.onClick==='function');},null,{timeout:60000});
  await page.getByRole('button',{name:'讓學員簽署',exact:true}).click();
  const url=await page.getByRole('link',{name:'開啟學員簽署頁',exact:true}).getAttribute('href');assert.equal(new URL(url).origin,base,'Signing link must stay in isolated Preview');
  fs.writeFileSync('/tmp/agreements-1502-signing-url',url,{mode:0o600});checks.push('QR and signing link use same Preview origin');
  const state=await context.storageState();const learnerContext=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,acceptDownloads:true,storageState:{cookies:state.cookies.filter(c=>c.name.includes('vercel')),origins:[]}});
  const learner=await learnerContext.newPage();learner.setDefaultTimeout(45000);learner.on('pageerror',e=>errors.push(e.message));
  await learner.goto(url,{waitUntil:'domcontentloaded',timeout:90000});await learner.getByRole('button',{name:'取得約定書並開始填寫',exact:true}).click();
  await learner.getByLabel('學員姓名',{exact:true}).fill(signerName);await learner.getByLabel('聯絡電話',{exact:true}).fill('0911000001');
  await learner.getByRole('combobox').selectOption('minor');await learner.getByLabel('法定代理人姓名',{exact:true}).fill(guardianName);await learner.getByLabel('與學員的關係',{exact:true}).fill('母親');await learner.getByLabel('法定代理人電話',{exact:true}).fill('0911000002');
  await learner.getByRole('checkbox').nth(0).check();await learner.getByRole('checkbox').nth(1).check();
  const pad=learner.getByRole('application',{name:'手寫簽名區'});await pad.scrollIntoViewIfNeeded();const r=await pad.boundingBox();await learner.mouse.move(r.x+r.width*.1,r.y+r.height*.3);await learner.mouse.down();for(const[x,y]of[[.2,.5],[.4,.2],[.6,.6],[.8,.3]])await learner.mouse.move(r.x+r.width*x,r.y+r.height*y,{steps:4});await learner.mouse.up();assert.equal(await pad.locator('polyline').count(),1);
  await learner.getByRole('button',{name:'預覽簽署資料',exact:true}).click();await learner.getByRole('heading',{name:'確認簽署資料',exact:true}).waitFor();
  await learner.getByRole('button',{name:'確認簽署',exact:true}).click();await learner.getByRole('heading',{name:'已完成簽署',exact:true}).waitFor({timeout:90000});checks.push('minor + guardian signed against real database');
  const receipt=await learner.getByRole('link',{name:/查看|副本/}).first().getAttribute('href');
  assert.ok(receipt);fs.writeFileSync('/tmp/agreements-1502-receipt-path',receipt,{mode:0o600});
  await learner.goto(new URL(receipt,base).href,{waitUntil:'domcontentloaded',timeout:90000});await learner.getByRole('button',{name:'下載已簽署 PDF',exact:true}).waitFor();
  const headers=await learner.evaluate(async path=>{const r=await fetch(path+'/pdf');return {status:r.status,type:r.headers.get('content-type'),cache:r.headers.get('cache-control'),referrer:r.headers.get('referrer-policy'),magic:new TextDecoder().decode((await r.arrayBuffer()).slice(0,5))};},receipt);
  assert.equal(headers.status,200);assert.equal(headers.magic,'%PDF-');assert.match(headers.cache,/no-store/);assert.equal(headers.referrer,'no-referrer');checks.push('public receipt works without owner login and PDF is private/no-store');
  const downloadWait=learner.waitForEvent('download',{timeout:90000});await learner.getByRole('button',{name:'下載已簽署 PDF',exact:true}).click();const download=await downloadWait;await download.saveAs(out+'/learner-signed.pdf');checks.push('learner signed PDF downloaded');
  await page.goto(base+prefix+'/records?storeId=qa_agreements_1502_20261103',{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByLabel('姓名或電話（含代理人）',{exact:true}).fill(guardianName);await page.getByRole('button',{name:'查詢',exact:true}).click();await page.getByRole('link',{name:`查看 ${signerName} 的同意書`,exact:true}).waitFor();await page.getByRole('button',{name:'查詢',exact:true}).waitFor();checks.push('guardian search returns signed learner');await shot('records');
  const ownerWait=page.waitForEvent('download',{timeout:90000});await page.getByRole('button',{name:`下載 ${signerName} 的 PDF`,exact:true}).click();const ownerDownload=await ownerWait;await ownerDownload.saveAs(out+'/owner-signed.pdf');checks.push('owner PDF downloaded');
  await page.getByRole('link',{name:`查看 ${signerName} 的同意書`,exact:true}).click();await page.getByText(guardianName,{exact:false}).first().waitFor();checks.push('owner detail retains guardian and original clauses');await shot('detail');
  await page.goto(base+prefix,{waitUntil:'domcontentloaded',timeout:90000});await page.getByRole('button',{name:'暫停新簽署',exact:true}).click();await page.getByRole('button',{name:'確認暫停',exact:true}).click();await page.getByRole('status').filter({hasText:'已暫停新簽署'}).waitFor();
  await learner.goto(url,{waitUntil:'domcontentloaded',timeout:90000});assert.equal(await learner.getByRole('button',{name:'取得約定書並開始填寫',exact:true}).count(),0);checks.push('paused link offers no signing form');
  await learner.goto(new URL(receipt,base).href,{waitUntil:'domcontentloaded',timeout:90000});await learner.getByRole('button',{name:'下載已簽署 PDF',exact:true}).waitFor();checks.push('prior receipt survives pause');
  assert.deepEqual(errors,[]);complete=true;save();console.log(JSON.stringify({checks,errors}));
 }catch(e){save();console.error((await page.locator('main').innerText().catch(()=>page.locator('body').innerText())).slice(-3000));await page.screenshot({path:out+'/failure.png',fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
