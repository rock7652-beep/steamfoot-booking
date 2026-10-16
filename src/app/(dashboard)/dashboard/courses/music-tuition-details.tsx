"use client";
import {isMusicPreviewPage} from "@/lib/music-finance-sync";
import {musicCheckoutTransport} from "@/lib/music-checkout-transport";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {recordMusicTuitionReceipt} from "@/server/actions/music-tuition";
import {toLocalDateStr,formatTWDateTime} from "@/lib/date-utils";
import {COURSE_PAYMENT_LABELS} from "@/lib/course-checkout";
import type {loadCourseCustomerPurchases} from "@/server/actions/course-customer-history";
type Result=Awaited<ReturnType<typeof loadCourseCustomerPurchases>>;
type Order=Extract<Result,{success:true}>["data"][number];
export function MusicTuitionDetails({order,onUpdated}:{order:Order;onUpdated:()=>void}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const tuition=order.tuition;if(!tuition)return null;
 const outstanding=order.status==="CONFIRMED"?tuition.due-order.price:0;
 const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base";
 return <details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">各期／繳費紀錄</summary>
  <p className="py-2 text-sm">應收 {tuition.due.toLocaleString()} · 已收 {order.price.toLocaleString()} · 未收 {outstanding.toLocaleString()} · {tuition.expiry} · {tuition.discountTeacherFee?"折後學費拆帳":"原學費拆帳"}</p>
  <div className="overflow-x-auto"><table className="w-full text-right text-sm tabular-nums"><thead><tr>{["期別","堂數","應收","已收","未收","點名"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{tuition.periods.map(p=><tr key={p.period} className="border-t"><td className="p-2">{p.period}</td><td>{p.lessons}</td><td>{p.due.toLocaleString()}</td><td>{p.received.toLocaleString()}</td><td>{order.status==="CONFIRMED"?p.outstanding.toLocaleString():"已結清"}</td><td>{tuition.canReadBookings?<details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">查看</summary><ul className="min-w-56 text-left">{tuition.lessons.filter(l=>l.ordinal>tuition.periods.slice(0,p.period-1).reduce((n,r)=>n+r.lessons,0)&&l.ordinal<=tuition.periods.slice(0,p.period).reduce((n,r)=>n+r.lessons,0)).map(l=><li key={l.id} className="border-t py-2">{formatTWDateTime(new Date(l.date))} · {l.teacher} · {l.status}</li>)}{!tuition.lessons.some(l=>l.ordinal>tuition.periods.slice(0,p.period-1).reduce((n,r)=>n+r.lessons,0))&&<li className="py-2">尚未排課</li>}</ul></details>:"—"}</td></tr>)}</tbody></table></div>
  <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="text-left font-medium">付款紀錄</caption><thead><tr><th className="p-2">付款日期</th><th>實收</th><th>方式</th><th>後四碼</th></tr></thead><tbody>{tuition.receipts.map(r=><tr key={r.id} className="border-t"><td className="p-2 whitespace-nowrap">{toLocalDateStr(new Date(r.paidAt))}</td><td>{r.amount.toLocaleString()}</td><td>{COURSE_PAYMENT_LABELS[r.method]}</td><td>{r.lastFour??"—"}</td></tr>)}</tbody></table>{!tuition.receipts.length&&<p className="py-2 text-sm">尚無付款</p>}</div>
  {order.refunds.map(r=><p key={r.id} className="py-2 text-sm">退款 {r.amount.toLocaleString()} · {r.reason}</p>)}
  {tuition.canReceive&&outstanding>0&&order.status==="CONFIRMED"&&<details><summary className="min-h-11 cursor-pointer py-2 text-primary-700">新增付款</summary><form className="min-w-64 space-y-2" onSubmit={async e=>{e.preventDefault();if(busy)return;const data=new FormData(e.currentTarget);setBusy(true);setError("");try{const result=await musicCheckoutTransport("receipt", {purchaseId:order.id,amount:Number(data.get("amount")),paymentDate:String(data.get("date")),method:String(data.get("method")),lastFour:String(data.get("lastFour")??""),requestKey,expectedReceived:order.price}, recordMusicTuitionReceipt);if(!result.success){setError(result.error??"收款未完成");return;}setRequestKey(crypto.randomUUID());if(!isMusicPreviewPage()){onUpdated();router.refresh();}}catch{setError("尚未確認收款結果，可用相同資料重試。");}finally{setBusy(false);}}}>
    <label className="block">本次實收<input className={field} name="amount" type="number" min="1" max={outstanding} step="1" required defaultValue={outstanding}/></label>
    <label className="block">付款日期<input className={field} name="date" type="date" max={toLocalDateStr()} required defaultValue={toLocalDateStr()}/></label>
    <label className="block">付款方式<select className={field} name="method" required defaultValue=""><option value="">請選擇</option>{["CASH","BANK_TRANSFER","CARD","OTHER"].map(m=><option key={m} value={m}>{COURSE_PAYMENT_LABELS[m]}</option>)}</select></label>
    <label className="block">轉帳後四碼<input className={field} name="lastFour" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}/></label>
    <p className="text-sm text-earth-500">僅登錄已收到的款項，堂數維持原購課額度。</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    <button className="min-h-11 rounded-lg bg-primary-600 px-4 text-white disabled:opacity-50" disabled={busy}>{busy?"儲存中…":"確認登錄收款"}</button>
  </form></details>}
 </details>;
}
