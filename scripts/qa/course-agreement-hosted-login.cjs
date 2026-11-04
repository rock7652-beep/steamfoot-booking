const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const creds=JSON.parse(fs.readFileSync('/tmp/agreements-1502-qa.json','utf8'));
 const share=fs.readFileSync('/tmp/agreements-1502-share-url','utf8').trim(),base=new URL(share).origin;
 if(base!=='https://steamfoot-booking-mjt74o220-rock7652-2111s-projects.vercel.app')throw Error('Unexpected hosted QA scope');
 const rawProxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
 const p=rawProxy?new URL(rawProxy):null;
 const proxy=p?{server:`${p.protocol}//${p.hostname}:${p.port}`,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:undefined;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],proxy});
 const context=await browser.newContext({viewport:{width:1366,height:900},ignoreHTTPSErrors:true});const page=await context.newPage();page.setDefaultTimeout(30000);
 try {
  await page.goto(share,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForURL(u=>u.origin===base&&!u.searchParams.has('_vercel_share'),{timeout:90000});
  await page.goto(base+'/login',{waitUntil:'domcontentloaded',timeout:90000});
  console.log('Login page reached',new URL(page.url()).pathname);
  await page.getByLabel('Email',{exact:true}).fill(creds.email);await page.getByLabel('密碼',{exact:true}).fill(creds.password);
  await page.getByRole('button',{name:'登入',exact:true}).click();
  await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});
  const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({storeId:s?.user?.storeId,role:s?.user?.role})));
  if(identity.storeId!=='qa_agreements_1502_20261103'||identity.role!=='OWNER')throw Error('Unexpected fixture identity');
  console.log('Isolated owner authenticated');
  await page.goto(base+'/s/qa-agreements-1502-20261103/admin/dashboard/courses/agreements',{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByRole('heading',{name:'課程共同約定',exact:true}).waitFor({timeout:90000});
  await context.storageState({path:'/tmp/agreements-1502-browser-state.json'});fs.chmodSync('/tmp/agreements-1502-browser-state.json',0o600);
  console.log((await page.locator('main').innerText()).slice(-4000));
 }catch(e){console.error((await page.locator('body').innerText()).slice(-4000));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
