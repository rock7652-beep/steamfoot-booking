"use client";
import {useEffect,useState} from "react";
import {CourseAssignmentPayment,type AssignmentSummary} from "./course-assignment-payment";
import {loadMusicJoinOptions} from "@/server/actions/course-members";
import {musicCheckoutQuote} from "@/lib/music-course-products";
import {formatTWDateTime} from "@/lib/date-utils";

type MusicPlan={id:string;validDays:number;points:number;price:number;storeCost?:number;musicTerms?:number|null;musicTermSizes?:number[];musicBonusLessons?:number};
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base";
export function MusicAssignmentPayment({plan,canDiscount,onSummary}:{plan:MusicPlan;canDiscount:boolean;onSummary:(value:AssignmentSummary)=>void}) {
 const [terms,setTerms]=useState(String(plan.musicTerms??1));
 const [validity,setValidity]=useState("");
 const [manual,setManual]=useState("0"),[join,setJoin]=useState("");
 const [options,setOptions]=useState<{id:string;startsAt:string;remaining:number}[]>([]);
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;
  void loadMusicJoinOptions(plan.id).then(result=>{if(!active)return;if(result.success&&"options" in result)setOptions(result.options);else if(!result.success)setError(result.error);}).catch(()=>{if(active)setError("插班日期讀取失敗，請重試");}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[plan.id,retry]);
 let quote:ReturnType<typeof musicCheckoutQuote>|null=null;
 try {const first=options.find(s=>s.id===join);quote=musicCheckoutQuote(plan,Number(terms),Number(manual),join&&first?first.remaining:undefined,validity===""?undefined:Number(validity));}catch{}
 const valid=!!quote && manual!=="" && terms!=="" && (!join||options.some(s=>s.id===join));
 useEffect(()=>{if(!valid)onSummary({paid:null,valid:false});},[valid,onSummary]);
 return <div className="space-y-3">
  <input type="hidden" name="musicPurchaseTerms" value={terms}/>
  <input type="hidden" name="musicValidityDays" value={quote?.validDays??""}/>
  <input type="hidden" name="musicManualBonus" value={manual}/>
  <input type="hidden" name="musicJoinSessionId" value={join}/>
  {loading&&<p className="text-sm text-earth-500">核對可插班日期中…</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error} <button type="button" className="underline" onClick={()=>{setLoading(true);setError("");setRetry(n=>n+1);}}>重試</button></p>}
  {!!options.length&&<label className="block">購買方式<select className={field} value={join} onChange={e=>{setJoin(e.target.value);setTerms("1");setValidity("");onSummary({paid:null,valid:false});}}><option value="">完整方案／續報</option>{options.map(s=><option key={s.id} value={s.id}>插班：{formatTWDateTime(new Date(s.startsAt))} 起 · 本期剩 {s.remaining} 堂</option>)}</select></label>}
  <div className="grid grid-cols-2 gap-3"><label>購買期數<input className={field} type="number" min="1" max="100" required disabled={!!join} value={terms} onChange={e=>{setTerms(e.target.value);setValidity("");onSummary({paid:null,valid:false});}}/></label>
  {canDiscount&&<label className="block">贈送堂數<input className={field} type="number" min="0" max="1000" step="1" value={manual} required onChange={e=>setManual(e.target.value)}/></label>}</div>
  <details><summary className="cursor-pointer py-1 text-sm">調整有效天數</summary><label className="block">本次有效天數<input className={field} type="number" min="1" max="3650" placeholder={String(quote?.validDays??plan.validDays)} value={validity} onChange={e=>setValidity(e.target.value)}/></label></details>
  {valid&&quote?<><p className="rounded-lg bg-earth-50 p-3 text-sm">{quote.musicTermSizes.length} 期：{quote.musicTermSizes.join("＋")} 堂 · 共 {quote.points} 堂{quote.musicBonusLessons>0?`（含贈送 ${quote.musicBonusLessons} 堂）`:""}<br/>首次使用起 {quote.validDays} 天</p><CourseAssignmentPayment key={`${join}:${terms}:${quote.price}`} price={quote.price} storeCost={plan.storeCost??0} profitEnabled={false} canDiscount={canDiscount} onSummary={onSummary}/></>:<p role="alert" className="text-red-700">請核對方案期別與贈課堂數。</p>}
 </div>;
}
