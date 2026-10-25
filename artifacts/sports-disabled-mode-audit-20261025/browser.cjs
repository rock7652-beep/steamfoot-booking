const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const results=[];
for(const [width,height]of [[390,844],[768,1024],[1024,768],[1366,900]])for(const surface of ['fee','legacy','subject','settings']){
 const p=await b.newPage({viewport:{width,height}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.process={env:{}}});await p.goto(`http://127.0.0.1:5193/?surface=${surface}&section=booking`);
 if(surface==='fee'||surface==='legacy'){
  await p.getByRole('heading',{name:/收費方式/}).waitFor();await p.getByRole('combobox',{name:'收費類型',exact:true}).waitFor();
  if(/開放選課|通用卡/.test(await p.locator('body').innerText()))throw Error('disabled mode leaked '+surface);
  if(await p.getByText('未具資格人員',{exact:true}).count())throw Error('unqualified fee provider');
  if(await p.locator('legend').filter({hasText:'此收費可安排'}).count()!==1)throw Error('duplicated provider picker');
  if(await p.locator('legend').filter({hasText:'可授課教練'}).count())throw Error('legacy qualification picker');
  const box=await p.getByRole('button',{name:'儲存',exact:true}).boundingBox();if(!box||box.x<0||box.x+box.width>width||box.y+box.height>height+1)throw Error('save outside viewport');
 }else if(surface==='subject'){
  await p.getByRole('button',{name:'編輯',exact:true}).click();await p.getByRole('heading',{name:'編輯教學項目',exact:true}).waitFor();
  if((await p.locator('body').innerText()).includes('開放選課'))throw Error('subject open-only fields');
  if(await p.getByLabel('開放選課每堂扣點',{exact:true}).count())throw Error('point charge visible');
 }else{
  await p.getByText('排課模式',{exact:true}).waitFor();
  if(await p.getByText('候補',{exact:true}).count())throw Error('waitlist settings visible');
  if((await p.locator('body').innerText()).includes('開放選課沿用方案預約規則'))throw Error('disabled rules copy');
 }
 if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('page overflow '+surface+' '+width);
 if(errors.length)throw Error(errors.join(';'));await p.screenshot({path:`${process.env.EVIDENCE_DIR || '/tmp'}/audit-${surface}-${width}.png`});results.push({surface,width,height,noDisabledFeature:true,noPageOverflow:true});await p.close();
}
await b.close();fs.writeFileSync('/tmp/audit-browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));})().catch(e=>{console.error(e);process.exit(1)});
