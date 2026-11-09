import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const mode=process.env.DENSITY_MODE??'after',out=process.env.DENSITY_OUTPUT??'/tmp/record-density-review';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{const page=await browser.newPage({viewport:{width:1366,height:900},locale:'zh-TW'});page.on('pageerror',e=>console.log('PAGEERROR',e.message));await page.goto('http://127.0.0.1:4201',{waitUntil:'networkidle'});await page.locator('[data-fixture=customers] tbody tr').first().waitFor();await page.mouse.move(0,0);
const result=await page.evaluate(()=>{const heights=s=>[...document.querySelectorAll(s)].map(n=>Math.round(n.getBoundingClientRect().height));return {customerRows:heights('[data-fixture=customers] tbody tr'),visibleCustomerRows:[...document.querySelectorAll('[data-fixture=customers] tbody tr')].filter(n=>n.getBoundingClientRect().bottom<=innerHeight).length,staffRows:heights('[data-fixture=staff] tbody tr'),rosterRows:heights('[data-fixture=roster] tbody tr'),settingsRows:heights('[data-fixture=settings] section > div:first-child'),reminderRows:heights('[data-fixture=reminders] [data-reminder-row] > :first-child'),font:getComputedStyle(document.querySelector('[data-fixture=customers] td')).fontSize};});
await page.screenshot({path:`${out}/${mode}.png`});writeFileSync(`${out}/${mode}.json`,JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}
