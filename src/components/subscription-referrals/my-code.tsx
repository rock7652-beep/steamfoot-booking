"use client";
import { useActionState, useState } from "react";
import type { ReferralActionState } from "@/server/actions/subscription-referral";
import { subscriptionReferralLink } from "@/lib/subscription-referral-code";
export function MySubscriptionReferralCode({initialCode,createAction,shareOrigin}:{shareOrigin?:string;initialCode:string|null;createAction:(previous:ReferralActionState,form:FormData)=>Promise<ReferralActionState>}){
  const [state,action,pending]=useActionState(async(previous:ReferralActionState,form:FormData)=>{try{return await createAction(previous,form);}catch{return {success:false,message:"連線中斷，請重試；同一帳戶仍會沿用同一組推薦碼。"};}},{success:false,message:"",code:undefined as string|undefined});
  const [copyMessage,setCopyMessage]=useState("");
  const code=state.code??initialCode;
  const link=code?subscriptionReferralLink(code,shareOrigin):null;
  async function copy(){if(!link)return;try{await navigator.clipboard.writeText(link);setCopyMessage("推薦連結已複製。");}catch{setCopyMessage("無法自動複製，請選取上方連結手動複製。");}}
  return <section className="space-y-3 rounded-xl border border-earth-200 bg-white p-4"><h2 className="text-lg font-semibold">我的推薦碼</h2>{code&&link?<><p className="break-all text-2xl font-semibold tracking-wider">{code}</p><p className="break-all text-base">{link}</p><div className="flex flex-wrap gap-3"><button type="button" onClick={copy} className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-white">複製推薦連結</button><a href={`https://line.me/R/share?text=${encodeURIComponent(`推薦你使用蒸管家：${link}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-earth-300 px-4 py-2">分享到 LINE</a></div></>:<form action={action}><button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50">{pending?"建立中…":"取得我的推薦碼"}</button></form>}{state.message&&<p role={state.success?"status":"alert"}>{state.message}</p>}{copyMessage&&<p role="status">{copyMessage}</p>}<p className="text-base leading-7 text-earth-600">朋友首次付費並符合活動條件後，雙方各獲贈主方案 30 天；總部核對後發放。推薦碼轉換方案後沿用。</p></section>;
}
