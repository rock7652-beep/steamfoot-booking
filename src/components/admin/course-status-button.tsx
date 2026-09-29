"use client";
import {useState,useRef,useId} from "react";
import {RightSheet} from "@/components/admin/right-sheet";
import {useRouter} from "next/navigation";
import {applyCourseBatchStatus,courseStatusImpact} from "@/server/actions/course-batch";
export function useCourseStatusRows<T extends {id:string}>(items:T[],key:"isActive"|"active"="isActive"){
 const [busyIds,setBusyIds]=useState<string[]>([]);
 const [snapshot,setSnapshot]=useState(items),[overrides,setOverrides]=useState<Record<string,boolean>>({});
 if(snapshot!==items){setSnapshot(items);setOverrides(old=>Object.fromEntries(Object.entries(old).filter(([id,value])=>{const row=items.find(item=>item.id===id);return row && (row as Record<string,unknown>)[key]!==value;})));}
 const rows=items.map(item=>item.id in overrides?{...item,[key]:overrides[item.id]}:item);
 return [rows,(ids:string[],active:boolean)=>setOverrides(old=>({...old,...Object.fromEntries(ids.map(id=>[id,active]))})),busyIds,(ids:string[],busy:boolean)=>setBusyIds(old=>busy?[...new Set([...old,...ids])]:old.filter(id=>!ids.includes(id)))] as const;
}
export function CourseStatusButton({kind,id,active,onApplied,disabled=false,onPendingChange}:{disabled?:boolean;onPendingChange?:(ids:string[],busy:boolean)=>void;kind:"room"|"plan"|"staff"|"subject";id:string;active:boolean;onApplied:(ids:string[],active:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const router=useRouter();const product=kind==="plan"||kind==="subject";
 const [checking,setChecking]=useState(false),[confirmation,setConfirmation]=useState<string|null>(null);
 const lock=useRef(false),titleId=useId();
 async function run(confirmed=false){if(lock.current||disabled)return;lock.current=true;setError("");
 if(active&&!confirmed){setChecking(true);try{const impact=await courseStatusImpact({kind,ids:[id]});if(!impact.success){setError(impact.error);return;}setConfirmation(`${impact.count?`已有 ${impact.count} 堂未結束課程，既有排課會保留。`:""}停止新增選用，已購方案與歷史紀錄保留。${kind==="staff"?"工作存取將撤銷。":""}`);}catch{setError("無法確認影響，請重試");}finally{setChecking(false);lock.current=false;}return;}
 setConfirmation(null);setBusy(true);onPendingChange?.([id],true);const optimistic=kind!=="staff";const previous=active;if(optimistic)onApplied([id],!previous);try{
  const result=await applyCourseBatchStatus({kind,ids:[id],active:!active});if(!result.success){if(optimistic)onApplied([id],previous);setError(result.error);return;}if(result.failed.length){if(optimistic)onApplied([id],previous);setError(result.failed[0].error);return;}onApplied([id],!previous);router.refresh();
 }catch{if(optimistic)onApplied([id],previous);setError("未確認儲存，請重新整理核對後重試");}finally{lock.current=false;setBusy(false);onPendingChange?.([id],false);}}
 return <><span><button type="button" disabled={busy||checking||disabled} className="min-h-11 whitespace-nowrap rounded-lg border border-earth-200 px-2 text-sm text-primary-800 disabled:opacity-50" onClick={()=>void run()}>{checking?"確認中…":busy?"儲存中…":product?active?"下架":"上架":active?"停用":"啟用"}</button>{error&&<span role="alert" className="block max-w-64 whitespace-normal text-xs text-red-700">{error}</span>}</span>{confirmation&&<RightSheet open presentation="centered" fitContent width={420} labelledById={titleId} onClose={()=>setConfirmation(null)}><section className="whitespace-normal p-4"><h2 id={titleId} className="font-semibold">確認{product?"下架":"停用"}？</h2><p className="my-3 text-sm">{confirmation}</p><div className="flex justify-end gap-2"><button type="button" className="min-h-11 rounded border px-4" onClick={()=>setConfirmation(null)}>取消</button><button type="button" className="min-h-11 rounded bg-primary-700 px-4 text-white" disabled={disabled} onClick={()=>void run(true)}>{product?"下架":"停用"}</button></div></section></RightSheet>}</>;
}
