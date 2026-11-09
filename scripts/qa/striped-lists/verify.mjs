import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const out=process.env.STRIPED_QA_OUTPUT??'/tmp/steamfoot-striped-lists';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[],checks=[];
const white='rgb(255, 255, 255)',tint='rgb(245, 243, 238)',hover='rgb(236, 232, 223)',selected='rgb(220, 232, 225)';
// Read the settled CSS color after the existing 150ms row transition.
const color=async locator=>{await new Promise(resolve=>setTimeout(resolve,180));return locator.evaluate(node=>getComputedStyle(node).backgroundColor);};
try{
 const page=await browser.newPage({viewport:{width:1366,height:900},locale:'zh-TW'});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:4198',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'顧客管理',exact:true}).waitFor();
 const table=page.locator('[data-fixture=customers] table'),bodyRows=table.locator('tbody > tr');await bodyRows.first().waitFor();await page.mouse.move(0,0);
 assert.equal(await bodyRows.count(),10);assert.equal(await color(bodyRows.nth(0)),white);assert.equal(await color(bodyRows.nth(1)),tint);
 assert.equal(await color(bodyRows.nth(1).locator('td').last()),tint,'sticky action cell follows full row');
 const originalHeight=await bodyRows.first().evaluate(n=>n.getBoundingClientRect().height);
 await bodyRows.nth(1).hover();await page.waitForTimeout(250);assert.equal(await color(bodyRows.nth(1)),hover);assert.equal(await color(bodyRows.nth(1).locator('td').last()),hover);
 await bodyRows.first().locator('input[type=checkbox]').check();await page.mouse.move(0,0);assert.equal(await color(bodyRows.first()),selected);
 await bodyRows.first().hover();await page.waitForTimeout(250);assert.equal(await color(bodyRows.first()),selected,'selection wins over hover');
 await bodyRows.first().locator('input[type=checkbox]').uncheck();await bodyRows.first().locator('input[type=checkbox]').focus();await page.keyboard.press('Space');assert.equal(await color(bodyRows.first()),selected,'keyboard selection retains row highlight');await bodyRows.first().locator('input[type=checkbox]').uncheck();await page.getByRole('button',{name:'反向排序'}).click();await page.mouse.move(0,0);assert.equal(await color(bodyRows.first()),white);assert.equal(await color(bodyRows.nth(1)),tint);
 await page.getByRole('button',{name:'下一頁',exact:true}).click();assert.equal(await bodyRows.count(),10);assert.equal(await color(bodyRows.first()),white);
 await page.getByLabel('搜尋顧客').fill('林');assert.equal(await bodyRows.count(),4);assert.equal(await color(bodyRows.nth(1)),tint);
 await page.getByLabel('搜尋顧客').fill('不存在');assert.equal(await table.count(),0);assert.ok(await page.getByText('目前沒有符合條件的顧客',{exact:true}).count());
 await page.getByLabel('搜尋顧客').fill('');
 for(const industry of ['steamfoot','fitness','music','beauty']){await page.getByRole('button',{name:industry,exact:true}).click();await page.mouse.move(0,0);assert.equal(await color(bodyRows.nth(1)),tint);checks.push(`${industry} customer stripes`);}
 const warning=page.locator('[data-test-state=warning]'),inactive=page.locator('[data-test-state=inactive]');
 for(const row of [warning,inactive]){await page.mouse.move(0,0);const before=await color(row);await row.hover();await page.waitForTimeout(250);assert.equal(await color(row),before,'semantic state survives hover');assert.equal(await color(row.locator('td').last()),before);}
 const grouped=page.locator('[data-fixture=grouped]');await page.getByRole('button',{name:'切換隱藏中間列'}).click();await page.mouse.move(0,0);assert.equal(await color(grouped.locator('[data-test-index="2"]')),tint);assert.equal(await color(grouped.locator('[data-test-index="3"]')),white);
 await grouped.locator('details').first().locator('summary').click();await page.mouse.move(0,0);assert.equal(await color(grouped.locator('[data-test-index="2"]')),tint);
 assert.equal(await color(page.locator('[data-fixture=calendar] tr').nth(0)),await color(page.locator('[data-fixture=calendar] tr').nth(1)),'unmarked calendar is untouched');
 await page.getByRole('button',{name:'steamfoot',exact:true}).click();
 const sizes=[];
 for(const [name,width,height] of [['desktop',1366,900],['wide',1920,1080],['ipad-landscape',1024,768],['ipad-portrait',768,1024],['narrow',600,900],['mobile',390,844],['small-mobile',360,800]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.mouse.move(0,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} page overflow`);
  const scroll=table.locator('..');await scroll.evaluate(n=>n.scrollLeft=n.scrollWidth);const last=bodyRows.first().locator('td').last();assert.ok(await last.isVisible());assert.equal(await color(bodyRows.nth(1).locator('td').last()),tint);
  await scroll.evaluate(n=>n.scrollLeft=0);await page.screenshot({path:`${out}/${name}.png`});sizes.push({name,width,height,overflow:false});
 }
 assert.equal(await bodyRows.first().evaluate(n=>n.getBoundingClientRect().height),originalHeight,'responsive changes do not increase fixed row spacing');
 assert.deepEqual(errors,[]);checks.push('white/tint full rows','sticky action color','hover','selected priority','warning/inactive priority','sort/filter/page resets','hidden rows ignored','group expand stable','calendar excluded','no external requests');
 writeFileSync(`${out}/results.json`,JSON.stringify({fixtureOnly:true,realComponents:['CustomersTable','DataTable','RosterTable','CourseStaffList'],substitutes:['navigation links','customer label metadata'],syntheticRows:30,checks,sizes,errors},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length,sizes:sizes.length,errors}));
}finally{await browser.close();}
