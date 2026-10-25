const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const results=[];try{
for(const [width,height]of [[390,650],[390,844],[768,1024],[1024,768],[1366,900]])for(const kind of ['single','plan']){
 const p=await b.newPage({viewport:{width,height}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>window.process={env:{}});await p.goto('http://127.0.0.1:5194/?surface=fee');await p.getByRole('combobox',{name:'收費類型',exact:true}).selectOption(kind);
 await p.locator('input[name="storeCost"]').fill('200');await p.locator('input[name="price"]').fill('5800');await p.locator('input[name="name"]').fill('舞蹈收費');
 for(const tab of ['收費設定','授課設定']){
  const bt=p.getByRole('button',{name:tab,exact:true});if(await bt.isVisible())await bt.click();
  await p.waitForTimeout(80);
  const scroll=await p.locator('#course-member-form').evaluate(e=>{const body=e.closest('[class*="overflow-y-auto"]');return {height:body.clientHeight,scroll:body.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}});
  if(scroll.overflow||scroll.scroll>scroll.height+1)throw Error(JSON.stringify({width,height,kind,tab,scroll}));
  const save=await p.getByRole('button',{name:'儲存',exact:true}).boundingBox();if(!save||save.y+save.height>height+1)throw Error('save clipped');
  if(tab==='收費設定'){if(!await p.locator('input[name="storeCost"]').isVisible())throw Error('cost hidden');if(await p.locator('input[name="storeCost"]').evaluate(e=>!!e.closest('details')))throw Error('cost collapsed');}
  if(tab==='授課設定'){await p.getByRole('combobox',{name:'教學項目',exact:true}).selectOption('subject');await p.getByText('合格老師甲',{exact:true}).click();}
  await p.screenshot({path:`/tmp/fee-cost-${width}-${height}-${kind}-${tab==='收費設定'?'pricing':'teaching'}.png`});
 }
 const pricing=p.getByRole('button',{name:'收費設定',exact:true});if(await pricing.isVisible())await pricing.click();if(await p.locator('input[name="storeCost"]').inputValue()!=='200')throw Error('draft lost');if(errors.length)throw Error(errors.join(';'));results.push({width,height,kind,costVisible:true,noBodyScroll:true,draftPreserved:true});await p.close();
}
fs.writeFileSync('/tmp/fee-cost-browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
