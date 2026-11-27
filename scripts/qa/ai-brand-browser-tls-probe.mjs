// Run before requesting a share link. Uses existing NSS trust only; never imports a CA.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
const {chromium}=createRequire(import.meta.url)('playwright');
const target=new URL(process.argv[2]);
if(target.protocol!=='https:'||!target.hostname.startsWith('steamfoot-booking-')||!target.hostname.endsWith('.vercel.app')||target.search||target.hash)throw Error('APPROVED_PREVIEW_HOST_REQUIRED');
const db='sql:'+path.join(homedir(),'.pki/nssdb'),list=()=>execFileSync('certutil',['-L','-d',db],{encoding:'utf8'}),before=list();
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
let result;
try{const page=await browser.newPage();const response=await page.goto(target.origin+'/hq/login',{waitUntil:'commit',timeout:20000});result={strictBrowserTls:true,status:response.status(),authenticated:false};}
catch(error){result={strictBrowserTls:false,error:error.message.split('\n')[0]};process.exitCode=1;}
finally{await browser.close();result.existingTrustStoreUnchanged=before===list();if(!result.existingTrustStoreUnchanged)process.exitCode=1;}
console.log(JSON.stringify(result));
