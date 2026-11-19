// Actual BookingCard/CSS with synthetic data; no server calls or real bookings.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = process.cwd();
const output = '/tmp/steamfoot-liff-booking-people-preview';
mkdirSync(output, { recursive: true });
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BookingCard}from'./src/app/(liff)/liff/bookings/_components/booking-card';
const base={bookingDate:'2026-11-20',slotTime:'10:00',bookingStatus:'PENDING',bookingType:'PACKAGE_SESSION',isMakeup:false};
createRoot(document.getElementById('root')).render(<main style={{maxWidth:560,margin:'auto',padding:12}}><p>隔離預覽・合成資料</p><h1>我的預約</h1>{[1,2,3].map(people=><BookingCard key={people} booking={{...base,id:'test-'+people,people}} tab="upcoming" storeName="暖暖蒸足" onRequestCancel={b=>window.cancelId=b.id} contactUrl="" storeAddress="302新竹縣竹北市中崙里科大一路80號" storeMapUrl=""/>)}<h2>歷史紀錄</h2><BookingCard booking={{...base,id:'history',people:2,bookingStatus:'COMPLETED'}} tab="history" storeName="暖暖蒸足" contactUrl="" storeAddress="" storeMapUrl=""/><BookingCard booking={{...base,id:'trial',people:2,bookingType:'FIRST_TRIAL',bookingStatus:'CANCELLED'}} tab="history" storeName="暖暖蒸足" contactUrl="" storeAddress="" storeMapUrl=""/></main>);`,resolveDir:root,loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(output,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.join(root,'src')}});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
// Preserve esbuild's CSS modules alongside Tailwind.
const componentCss=readFileSync(path.join(output,'fixture.css'),'utf8');
writeFileSync(path.join(output,'fixture.css'),css.css+'\n'+componentCss);
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];const errors=[];
try{
 for(const width of [360,390,768,1024,1366]){
  const page=await browser.newPage({viewport:{width,height:900},timezoneId:'Asia/Taipei'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-19T10:00:00+08:00')});
  await page.route('**/*',route=>route.request().url()==='http://localhost:3134/'?route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'}):route.abort());
  await page.goto('http://localhost:3134/');
  await page.addStyleTag({path:path.join(output,'fixture.css')});
  await page.addScriptTag({path:path.join(output,'fixture.js')});
  const rows=page.locator('[data-customer-booking-row]');
  await rows.nth(4).waitFor();
  for(const [i,label] of ['方案預約 · 1 位','方案預約 · 2 位','方案預約 · 3 位','方案預約 · 2 位','體驗預約 · 2 位'].entries()){
   assert.match(await rows.nth(i).innerText(),new RegExp(label));
  }
  const two=rows.nth(1);
  await two.locator('summary').click();
  await two.getByRole('button',{name:'取消此次預約',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.cancelId),'test-2');
  assert.equal(await two.getAttribute('open'),'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,`people-${width}.png`),fullPage:true});
  await page.setViewportSize({width:width===360?768:360,height:900});
  assert.equal(await two.getAttribute('open'),'');
  await two.locator('summary').click();
  assert.match(await two.innerText(),/方案預約 · 2 位/);
  results.push({width,status:'passed',cases:'1/2/3 people, upcoming/history, collapsed/expanded, cancel target, resize state, no overflow'});
  await page.close();
 }
 assert.deepEqual(errors,[]);
 writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({output,results}));
}finally{await browser.close()}
