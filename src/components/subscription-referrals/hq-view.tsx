import { InstantFilterForm } from "@/components/instant-filter-form";
import { randomUUID } from "node:crypto";
import { PageShell, PageHeader } from "@/components/desktop";
import { ReferralActionForm } from "./action-form";
import { toLocalDateStr, addTaiwanDuration, formatTWDateTime } from "@/lib/date-utils";
import type { ReferralActionState } from "@/server/actions/subscription-referral";
const field="min-h-11 w-full min-w-0 rounded-lg border border-earth-300 bg-white px-3 py-2 text-base";
export type Lead={id:string;storeName:string;code:string;trialApplicationId:string|null};
export type Row={id:string;code:string;referrerStoreId:string;referredStoreId:string;referrerName:string;referredName:string;receiptRef:string|null;settledAt:Date|null;paidSubscriptionId:string|null;activatedAt?:Date|null;refunded?:boolean|null};
export type Sub={id:string;storeId:string;plan:string;effectiveAt:Date|null;startedAt:Date};
export type Reward={id:string;referralId:string;beneficiaryStoreId:string;state:string;days:number;storeName:string;expiresAt:Date|null;newExpiresOn:Date|null;planStatus:string;subscriptionStatus:string|null;archivedAt:Date|null;billingCycle?:string|null;isTrial?:boolean};
type Action=(previous:ReferralActionState,form:FormData)=>Promise<ReferralActionState>;
function canApplyReward(w:Reward){return w.state==="READY"&&!!w.expiresAt&&!w.archivedAt&&["ACTIVE","TRIAL"].includes(w.planStatus)&&w.subscriptionStatus===w.planStatus&&toLocalDateStr(w.expiresAt)>=toLocalDateStr();}
function needsBilling(w:Reward){return w.state==="READY"&&w.isTrial===false&&w.billingCycle==="MONTHLY";}
function rewardStatus(row:Row,rewards:Reward[]){
 if(rewards.length===2&&rewards.every(w=>w.state==="APPLIED"))return "已發放";
 if(row.refunded)return "已退款，不發放";
 if(rewards.length===2)return rewards.every(w=>w.state==="APPLIED"||canApplyReward(w))?"可以發放":"獎勵已保留";
 if(!row.paidSubscriptionId)return "待確認收款";
 const start=Math.max(row.settledAt?.getTime()??0,row.activatedAt?.getTime()??0);
 return start&&Date.now()<start+30*86400000?"等待滿 30 天":"待確認無退款";
}
function PaymentReview({row,subs,action}:{row:Row;subs:Sub[];action:Action}){
 const options=subs.filter(s=>s.storeId===row.referredStoreId);
 const labels:Record<string,string>={BASIC:"基本版",GROWTH:"專業版",ALLIANCE:"展店版"};
 return <details open={!row.paidSubscriptionId} className="border-t border-earth-200 pt-3"><summary className="min-h-11 cursor-pointer text-base font-medium">{row.paidSubscriptionId?"查看收款／更新退款核對":"確認朋友已付費"}</summary><ReferralActionForm action={action} button={row.paidSubscriptionId?"保存核對結果":"確認收款"}>
  <input type="hidden" name="referralId" value={row.id}/><input type="hidden" name="commandId" value={randomUUID()}/>
  {row.paidSubscriptionId?<><input type="hidden" name="subscriptionId" value={row.paidSubscriptionId}/><input type="hidden" name="receiptRef" value={row.receiptRef??""}/><input type="hidden" name="settledAt" value={row.settledAt?formatTWDateTime(row.settledAt).replace(" ","T"):""}/><p className="break-words text-base text-earth-600">已確認收款：{row.settledAt?formatTWDateTime(row.settledAt):"—"} · 憑證 {row.receiptRef}</p></>:<div className="grid gap-3 sm:grid-cols-2"><label className="text-base">朋友購買的方案<select name="subscriptionId" required className={field} defaultValue={options.length===1?options[0].id:""}><option value="">選擇已收款的方案</option>{options.map(s=><option key={s.id} value={s.id}>{labels[s.plan]??s.plan} · {toLocalDateStr(s.effectiveAt??s.startedAt)}</option>)}</select></label><label className="text-base">收款日期與時間<input type="datetime-local" name="settledAt" required className={field}/></label><label className="text-base sm:col-span-2">收款憑證編號<input name="receiptRef" required maxLength={200} className={field} placeholder="例如：匯款或收據編號"/></label></div>}
  <div className="grid gap-3 sm:grid-cols-2"><label className="text-base">目前有退款嗎？<select name="refundStatus" required className={field} defaultValue=""><option value="">請確認</option><option value="CLEAR">沒有退款</option><option value="REFUNDED">已退款，不發放</option></select></label><label className="text-base">這次核對紀錄<input name="verificationRef" required maxLength={200} className={field} placeholder="對帳或退款查核編號"/></label></div>
  <input type="hidden" name="distinctOperator" value="on"/><label className="flex min-h-11 items-start gap-2 text-base"><input type="checkbox" name="firstPaymentConfirmed" required className="mt-1 h-5 w-5 shrink-0"/>已確認是朋友首次付費，雙方為不同經營者。</label><p className="text-base text-earth-600">付費開通滿 30 天、確認無退款後，就能發放雙方獎勵。</p>
 </ReferralActionForm></details>;
}
function PairReward({row,rewards,action}:{row:Row;rewards:Reward[];action:Action}){
 if(rewards.length!==2)return null;
 const sorted=[rewards.find(w=>w.beneficiaryStoreId===row.referrerStoreId),rewards.find(w=>w.beneficiaryStoreId===row.referredStoreId)];
 if(sorted.some(w=>!w))return null;
 const pair=sorted as Reward[],pending=pair.filter(w=>w.state!=="APPLIED"),monthly=pending.filter(needsBilling);
 const ready=pending.length>0&&pending.every(canApplyReward)&&row.refunded!==true;
 return <section className="space-y-3 border-t border-earth-200 pt-3" aria-label="雙方獎勵"><div className="grid gap-3 sm:grid-cols-2">{pair.map((w,i)=><div className="min-w-0 rounded-lg bg-earth-50 p-3" key={w.id}><p className="text-base text-earth-600">{i===0?"推薦人":"朋友"}</p><p className="break-words text-base font-semibold">{w.storeName}</p><p className="mt-1 text-lg font-semibold">{w.state==="APPLIED"?"已獲贈 30 天":"免費增加 30 天"}</p><p className="text-base text-earth-600">{w.state==="APPLIED"?`到期日 ${w.newExpiresOn?toLocalDateStr(w.newExpiresOn):"已更新"}`:w.expiresAt?`到期日 ${toLocalDateStr(w.expiresAt)} → ${addTaiwanDuration(toLocalDateStr(w.expiresAt),30,"DAY")}`:"訂閱啟用後使用"}</p></div>)}</div>
 {ready?<ReferralActionForm action={action} button={pending.length===2?"確認發放雙方各 30 天":"完成剩餘獎勵發放"}><input type="hidden" name="referralId" value={row.id}/>{pair.map((w,i)=><input key={w.id} type="hidden" name={i===0?"referrerExpiresOn":"referredExpiresOn"} value={toLocalDateStr(w.expiresAt??w.newExpiresOn!)}/>)}
 {monthly.length>0&&<div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-base font-semibold">月繳店家：請先確認免費期間不會扣款</p>{monthly.map(w=><label key={w.id} className="block text-base">{w.storeName} · 扣款安排紀錄<input name={w.beneficiaryStoreId===row.referrerStoreId?"referrerBillingReference":"referredBillingReference"} required maxLength={200} className={field} placeholder="填入已核對的紀錄編號"/><span className="text-base text-earth-600">免費期間 {addTaiwanDuration(toLocalDateStr(w.expiresAt!),1,"DAY")} 至 {addTaiwanDuration(toLocalDateStr(w.expiresAt!),30,"DAY")}</span></label>)}<label className="flex min-h-11 items-start gap-2 text-base"><input type="checkbox" name="billingConfirmed" required className="mt-1 h-5 w-5 shrink-0"/>已確認以上免費期間不扣款。</label></div>}
 <p className="text-base text-earth-600">按一次即可完成，不用手動修改到期日。重複按不會再加天數。</p></ReferralActionForm>:pending.length===0?<p role="status" className="text-base font-semibold text-green-800">雙方獎勵已發放完成。</p>:<p className="text-base text-earth-600">{row.refunded?"已退款，尚未發放的獎勵不會發出。":"獎勵已保留。請先完成雙方訂閱啟用，再一次發放。"}</p>}
 </section>;
}
export function HqSubscriptionReferralView({leads,rows,stores,subs,rewards,page,storeQuery,hasNext,actions}:{leads:Lead[];rows:Row[];stores:{id:string;name:string}[];subs:Sub[];rewards:Reward[];page:number;storeQuery:string;hasNext:boolean;actions:{bind:Action;verify:Action;apply:Action}}){
 return <PageShell><PageHeader title="推薦獎勵" subtitle="確認店家 → 確認收款 → 一次發放雙方各 30 天"/>
 <section className="space-y-3"><h2 className="text-lg font-semibold">1. 確認朋友的店家</h2>{!leads.length&&<p className="text-base text-earth-600">目前沒有需要確認的新申請。</p>}{leads.map(lead=><details key={lead.id} className="rounded-xl border border-earth-200 bg-white p-4"><summary className="min-h-11 cursor-pointer break-words text-base font-semibold">{lead.storeName}<span className="ml-2 font-normal text-earth-600">{lead.trialApplicationId?"待確認店家":"等待體驗帳號開通"}</span></summary>{lead.trialApplicationId?<><InstantFilterForm className="my-3 flex flex-wrap gap-2"><input aria-label="搜尋要確認的店家" name="storeQuery" defaultValue={storeQuery} placeholder="找不到店家？輸入名稱搜尋" className={`${field} flex-1`}/></InstantFilterForm><ReferralActionForm action={actions.bind} button="確認這是朋友的店家"><input type="hidden" name="leadId" value={lead.id}/><label className="block text-base">朋友開通的店家<select name="storeId" required className={field} defaultValue=""><option value="">請選擇店家</option>{stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="flex min-h-11 items-start gap-2 text-base"><input type="checkbox" name="confirmed" required className="mt-1 h-5 w-5 shrink-0"/>我已核對店家及推薦碼 {lead.code}，確認後不再更換推薦人。</label></ReferralActionForm></>:<p className="text-base text-earth-600">請先在需求諮詢中關聯體驗申請，完成後再來確認店家。</p>}</details>)}</section>
 <section className="space-y-4"><h2 className="text-lg font-semibold">2. 確認收款與發放獎勵</h2>{!rows.length&&<p className="text-base text-earth-600">確認朋友的店家後，就會顯示在這裡。</p>}{rows.map(row=>{const items=rewards.filter(w=>w.referralId===row.id);return <article key={row.id} className="space-y-3 rounded-xl border border-earth-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-lg font-semibold">{row.referrerName} → {row.referredName}</h3><p className="text-base text-earth-600">推薦碼 {row.code}</p></div><p className="rounded-full bg-earth-100 px-3 py-1 text-base font-semibold">{rewardStatus(row,items)}</p></div>
 <PairReward row={row} rewards={items} action={actions.apply}/>
 {!items.length&&row.paidSubscriptionId&&row.activatedAt&&row.settledAt&&<p className="text-base text-earth-600">{formatTWDateTime(new Date(Math.max(row.activatedAt.getTime(),row.settledAt.getTime())+30*86400000))} 起可核對無退款並發獎。</p>}
 <PaymentReview row={row} subs={subs} action={actions.verify}/></article>;})}</section>
 <nav aria-label="推薦管理分頁" className="flex flex-wrap items-center gap-4 text-base">{page>1&&<a className="inline-flex min-h-11 items-center underline" href={`?page=${page-1}&storeQuery=${encodeURIComponent(storeQuery)}`}>上一頁</a>}<span>第 {page} 頁</span>{hasNext&&<a className="inline-flex min-h-11 items-center underline" href={`?page=${page+1}&storeQuery=${encodeURIComponent(storeQuery)}`}>下一頁</a>}</nav>
 </PageShell>;
}
