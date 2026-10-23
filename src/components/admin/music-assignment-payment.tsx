"use client";
import {useCallback,useEffect,useState} from "react";
import {CourseAssignmentPayment,type AssignmentSummary} from "./course-assignment-payment";
import {loadMusicJoinOptions} from "@/server/actions/course-members";
import {musicCheckoutQuote} from "@/lib/music-course-products";
import {formatTWDateTime} from "@/lib/date-utils";

type MusicPlan={id:string;validDays:number;points:number;price:number;storeCost?:number;musicTerms?:number|null;musicTermSizes?:number[];musicBonusLessons?:number};
const field="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-earth-200 bg-white p-2 text-base";
export function MusicAssignmentPayment({plan,canDiscount,onSummary}:{plan:MusicPlan;canDiscount:boolean;onSummary:(value:AssignmentSummary)=>void}) {
 const [terms,setTerms]=useState(String(plan.musicTerms??1));
 const [validity,setValidity]=useState("");
 const [manual,setManual]=useState("0"),[join,setJoin]=useState("");
 const [options,setOptions]=useState<{id:string;startsAt:string;remaining:number}[]>([]);
 const [advanced,setAdvanced]=useState(false);
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!advanced)return;let active=true;
  void loadMusicJoinOptions(plan.id).then(result=>{if(!active)return;if(result.success&&"options" in result)setOptions(result.options);else if(!result.success)setError(result.error);}).catch(()=>{if(active)setError("插班日期讀取失敗，請重試");}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[plan.id,retry,advanced]);
 let quote:ReturnType<typeof musicCheckoutQuote>|null=null;
 try {const first=options.find(s=>s.id===join);quote=musicCheckoutQuote(plan,Number(terms),Number(manual),join&&first?first.remaining:undefined,validity===""?undefined:Number(validity));}catch{}
 const valid=!!quote && manual!=="" && terms!=="" && (!join||options.some(s=>s.id===join));
 const paymentSummary=useCallback((summary:AssignmentSummary)=>onSummary(valid?summary:{paid:null,valid:false}),[valid,onSummary]);
 return <div className="min-w-0 space-y-2">
  <input type="hidden" name="musicPurchaseTerms" value={terms}/>
  <input type="hidden" name="musicValidityDays" value={quote?.validDays??""}/>
  <input type="hidden" name="musicManualBonus" value={manual}/>
  <input type="hidden" name="musicJoinSessionId" value={join}/>
  <label className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">購買期數<input className={`${field} max-w-28`} type="number" min="1" max="100" step="1" required disabled={!!join} value={terms} onChange={e=>{setTerms(e.target.value);setValidity("");}}/></label>
  {valid&&quote?<dl className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-earth-50 p-2 text-sm" aria-live="polite">
    <div className="flex flex-wrap gap-x-2"><dt>堂數</dt><dd>{quote.musicTermSizes.length} 期 · 共 {quote.points} 堂</dd></div>
    <div className="flex flex-wrap gap-x-2"><dt>期限</dt><dd>首次扣堂起 {quote.validDays} 天</dd></div>
    {quote.musicBonusLessons>0&&<div className="flex flex-wrap gap-x-2"><dt>包含贈課</dt><dd>{quote.musicBonusLessons} 堂</dd></div>}

  </dl>:<p role="alert" className="text-red-700">請核對購買期數、堂數與有效天數。</p>}
  <div className="grid min-w-0 grid-cols-2 gap-2"><details className="min-w-0 open:col-span-2"><summary className="min-h-11 cursor-pointer py-2.5 text-sm">查看各期堂數</summary>
    {quote&&<div className="max-h-60 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">期別</th><th className="p-2">堂數</th><th className="p-2">期限</th></tr></thead><tbody>{quote.musicTermSizes.map((count,i)=><tr key={i} className="border-t border-earth-200"><td className="p-2">第 {i+1} 期</td><td className="p-2">{count} 堂</td><td className="p-2">堂數共用</td></tr>)}</tbody></table></div>}
  </details>
  <details className="min-w-0 open:col-span-2" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-2.5 text-sm">其他調整{Number(manual)>0?` · 贈 ${manual} 堂`:""}{validity?` · ${validity} 天`:""}{join?" · 插班":""}</summary>
    <div className="space-y-3">
      {loading&&advanced&&<p className="text-sm text-earth-500">核對可插班日期中…</p>}
      {error&&<p role="alert" className="text-sm text-red-700">{error} <button type="button" className="min-h-11 underline" onClick={()=>{setLoading(true);setError("");setRetry(n=>n+1);}}>重試</button></p>}
      {!!options.length&&<label className="block">購買方式<select className={field} value={join} onChange={e=>{setJoin(e.target.value);setTerms("1");setValidity("");}}><option value="">完整方案／續報</option>{options.map(s=><option key={s.id} value={s.id}>插班：{formatTWDateTime(new Date(s.startsAt))} 起 · 本期剩 {s.remaining} 堂</option>)}</select></label>}
      {canDiscount&&<label className="block">額外贈送堂數<input className={field} type="number" min="0" max="1000" step="1" value={manual} required onChange={e=>setManual(e.target.value)}/><span className="text-sm text-earth-500">方案已包含的堂數不需重複加贈。</span></label>}
      <label className="block">本次共用有效天數<input className={field} type="number" min="1" max="3650" placeholder={String(quote?.validDays??plan.validDays)} value={validity} onChange={e=>setValidity(e.target.value)}/><span className="text-sm text-earth-500">目前套用 {quote?.validDays??plan.validDays} 天，從首次扣堂起算。</span></label>
    </div>
  </details>
  </div>
  <div hidden={!valid}><CourseAssignmentPayment musicPeriods={quote?.musicTermSizes} price={quote?.price??0} storeCost={plan.storeCost??0} profitEnabled={false} canDiscount={canDiscount} onSummary={paymentSummary}/></div>
 </div>;
}
