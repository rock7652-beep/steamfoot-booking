"use client";
import {useEffect,useState} from "react";
import {CourseAssignmentPayment,type AssignmentSummary} from "./course-assignment-payment";
import {loadMusicJoinOptions} from "@/server/actions/course-members";
import {musicPurchaseTerms,musicProratedTerms} from "@/lib/music-course-products";
import {formatTWDateTime} from "@/lib/date-utils";

type MusicPlan={id:string;points:number;price:number;storeCost?:number;musicTerms?:number|null;musicTermSizes?:number[];musicBonusLessons?:number};
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base";
export function MusicAssignmentPayment({plan,canDiscount,onSummary}:{plan:MusicPlan;canDiscount:boolean;onSummary:(value:AssignmentSummary)=>void}) {
 const [manual,setManual]=useState("0"),[join,setJoin]=useState("");
 const [options,setOptions]=useState<{id:string;startsAt:string;remaining:number}[]>([]);
 const [error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;
  void loadMusicJoinOptions(plan.id).then(result=>{if(!active)return;if(result.success&&"options" in result)setOptions(result.options);else if(!result.success)setError(result.error);}).catch(()=>{if(active)setError("插班日期讀取失敗，請重試");}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[plan.id,retry]);
 let quote:ReturnType<typeof musicPurchaseTerms>|null=null;
 try {const first=options.find(s=>s.id===join);quote=join&&first?musicProratedTerms(plan,first.remaining,Number(manual)):musicPurchaseTerms(plan,Number(manual));}catch{}
 const valid=!!quote && manual!=="" && (!join||options.some(s=>s.id===join));
 useEffect(()=>{if(!valid)onSummary({paid:null,valid:false});},[valid,onSummary]);
 return <div className="space-y-3">
  <input type="hidden" name="musicManualBonus" value={manual}/>
  <input type="hidden" name="musicJoinSessionId" value={join}/>
  {loading&&<p className="text-sm text-earth-500">核對可插班日期中…</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error} <button type="button" className="underline" onClick={()=>{setLoading(true);setError("");setRetry(n=>n+1);}}>重試</button></p>}
  {!!options.length&&<label className="block">購買方式<select className={field} value={join} onChange={e=>{setJoin(e.target.value);onSummary({paid:null,valid:false});}}><option value="">完整方案／續報</option>{options.map(s=><option key={s.id} value={s.id}>插班：{formatTWDateTime(new Date(s.startsAt))} 起 · 本期剩 {s.remaining} 堂</option>)}</select></label>}
  {canDiscount&&<label className="block">另外贈送堂數<input className={field} type="number" min="0" max="1000" step="1" value={manual} required onChange={e=>setManual(e.target.value)}/></label>}
  {valid&&quote?<><p className="rounded-lg bg-earth-50 p-3 text-sm">購買 {quote.musicTermSizes.join("＋")} 堂 · 方案贈送 {plan.musicBonusLessons??0} 堂 · 另贈 {manual} 堂<br/>合計 {quote.points} 堂；贈課與付費課使用相同期限。</p><CourseAssignmentPayment key={join||"full"} price={quote.price} storeCost={plan.storeCost??0} profitEnabled={false} canDiscount={canDiscount} onSummary={onSummary}/></>:<p role="alert" className="text-red-700">請核對方案期別與贈課堂數。</p>}
 </div>;
}
