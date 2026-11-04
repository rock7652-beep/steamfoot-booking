// Actual presentation components with synthetic data only; never imports DB/session/actions.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {cloneElement} from "react";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import {HqSubscriptionReferralView} from "../../src/components/subscription-referrals/hq-view";
import {MySubscriptionReferralCode} from "../../src/components/subscription-referrals/my-code";
const out="artifacts/subscription-referral-management/preview";
const actions={bind:async()=>({success:false,message:"靜態預覽不儲存"}),verify:async()=>({success:false,message:"靜態預覽不核對"}),apply:async()=>({success:false,message:"靜態預覽不發放"})};
function html(body:string){return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/style.css"><title>推薦管理介面預覽</title></head><body class="bg-earth-50 p-4 text-earth-900"><p id="fixture-status" role="status" class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-base">介面預覽・合成資料，不會儲存、發放或扣款。</p>${body}<script>document.addEventListener('submit',event=>{event.preventDefault();document.getElementById('fixture-status').textContent='靜態介面預覽，未送出任何資料。';});document.addEventListener('click',event=>{const link=event.target.closest('a');if(link&&new URL(link.href).origin!==location.origin){event.preventDefault();document.getElementById('fixture-status').textContent='合成資料預覽，未開啟外部連結。';}});</script></body></html>`;}
async function main(){
 mkdirSync(out,{recursive:true});
 const hq=<HqSubscriptionReferralView leads={[{id:"synthetic-lead",storeName:"合成新店家申請",code:"SB-ABCDEFGH",trialApplicationId:"synthetic-application"}]} rows={[{id:"synthetic-relation",code:"SB-ABCDEFGH",referrerStoreId:"a",referredStoreId:"b",referrerName:"合成推薦店家",referredName:"合成美容美體按摩與芳療服務工作室",receiptRef:"BANK-SYNTHETIC-01",settledAt:new Date("2026-10-01T10:00:00+08:00"),paidSubscriptionId:"synthetic-sub-b"}]} stores={[{id:"b",name:"合成美容美體按摩與芳療服務工作室"}]} subs={[{id:"synthetic-sub-b",storeId:"b",plan:"BASIC",effectiveAt:new Date("2026-10-02T10:00:00+08:00"),startedAt:new Date("2026-10-02T10:00:00+08:00")}]} rewards={[{id:"synthetic-reward-a",referralId:"synthetic-relation",beneficiaryStoreId:"a",storeName:"合成推薦店家",state:"READY",planStatus:"TRIAL",subscriptionStatus:"TRIAL",archivedAt:null,days:30,expiresAt:new Date("2026-11-30T00:00:00Z"),newExpiresOn:null},{id:"synthetic-reward-b",referralId:"synthetic-relation",beneficiaryStoreId:"b",storeName:"合成朋友店家",state:"APPLIED",planStatus:"ACTIVE",subscriptionStatus:"ACTIVE",archivedAt:null,days:30,expiresAt:new Date("2026-12-30T00:00:00Z"),newExpiresOn:new Date("2026-12-30T00:00:00Z")}]} page={1} storeQuery="" hasNext={false} actions={actions}/>;
 writeFileSync(out+"/hq.html",html(renderToStaticMarkup(hq)));
 writeFileSync(out+"/hq-expired.html",html(renderToStaticMarkup(cloneElement(hq,{rewards:hq.props.rewards.map((reward:import("../../src/components/subscription-referrals/hq-view").Reward)=>({...reward,state:"READY",planStatus:"EXPIRED",subscriptionStatus:"EXPIRED",expiresAt:new Date("2026-10-01T00:00:00Z")}))}))));
 writeFileSync(out+"/mine.html",html(renderToStaticMarkup(<MySubscriptionReferralCode initialCode="SB-ABCDEFGH" createAction={actions.bind}/>)));
 copyFileSync("public/pricing/apply.html",out+"/apply.html");
 mkdirSync(out+"/pricing/brand",{recursive:true});copyFileSync("public/pricing/brand/steam-butler-logo.png",out+"/pricing/brand/steam-butler-logo.png");
 const css=await postcss([tailwindcss()]).process(readFileSync("src/app/globals.css","utf8"),{from:"src/app/globals.css"});writeFileSync(out+"/style.css",css.css);
 console.log("Generated isolated HQ, owner and application UI fixtures.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
