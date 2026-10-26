// Isolated UI fixture. No database, LINE SDK, OAuth or external requests.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||"playwright");
const root=process.cwd(),output="/tmp/verified-booking-entry-qa",origin="http://localhost:3130";mkdirSync(output,{recursive:true});
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BookingLineEntry}from'./src/components/booking-line-entry';import{OAuthButtons}from'./src/app/oauth-buttons';createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-md space-y-6 p-4"><p>隔離預覽：不會登入、建立預約或發送通知。</p><section className="rounded-2xl bg-white p-5"><h1 className="mb-4 text-xl font-semibold">音樂／運動｜驗證後預約</h1><OAuthButtons storeSlug="synthetic" lineEntryHref="https://liff.line.me/902-synthetic/public-trial?bookingStore=synthetic"/></section><BookingLineEntry href="https://liff.line.me/902-synthetic/public-trial?bookingStore=synthetic" friendHref="https://line.me/R/ti/p/@synthetic"/><BookingLineEntry verified/></main>);`,resolveDir:root,loader:"tsx"},bundle:true,format:"iife",jsx:"automatic",outfile:path.join(output,"fixture.js"),define:{"process.env.NODE_ENV":'"development"'},alias:{"@":path.join(root,"src")},plugins:[{name:"block-oauth",setup(b){b.onResolve({filter:/^next-auth\/react$/},()=>({path:"oauth",namespace:"qa"}));b.onLoad({filter:/.*/,namespace:"qa"},()=>({contents:"export const signIn=()=>{throw Error('OAuth forbidden in fixture')};",loader:"js"}));}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync("src/app/globals.css","utf8"),{from:path.join(root,"src/app/globals.css")});writeFileSync(path.join(output,"fixture.css"),css.css);
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]}),errors=[],sizes=[];
try{
 const page=await browser.newPage();page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",route=>route.request().url()===origin+"/"?route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
 await page.goto(origin+"/");await page.addStyleTag({path:path.join(output,"fixture.css")});await page.addScriptTag({path:path.join(output,"fixture.js")});
 for(const [width,height]of[[390,844],[768,1024],[1024,768],[1366,900]]){
  await page.setViewportSize({width,height});await page.getByRole("button",{name:"LINE 驗證並預約",exact:true}).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(`Overflow at ${width}`);
  const rect=await page.getByRole("button",{name:"LINE 驗證並預約",exact:true}).boundingBox();if(!rect||rect.height<44)throw Error("LINE button below 44px");
  if(await page.getByRole("link",{name:"使用 LINE 驗證並預約",exact:true}).getAttribute("href")!=="https://liff.line.me/902-synthetic/public-trial?bookingStore=synthetic")throw Error("Store context lost");
  await page.screenshot({path:path.join(output,`entry-${width}.png`),fullPage:true});sizes.push({width,height,overflow:false,lineButtonHeight:rect.height});
 }
 if(errors.length)throw Error(errors.join(";"));writeFileSync(path.join(output,"results.json"),JSON.stringify({synthetic:true,actualLINE:false,actualDatabase:false,errors,sizes},null,2));console.log(JSON.stringify({output,errors,sizes}));
}finally{await browser.close();}
