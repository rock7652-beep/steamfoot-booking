"use client";
import {useState} from "react";
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
 async function run(){if(busy||disabled)return;setBusy(true);onPendingChange?.([id],true);setError("");try{
  if(active){const impact=await courseStatusImpact({kind,ids:[id]});if(!impact.success){setError(impact.error);return;}if(!window.confirm(`確認${product?"下架":"停用"}？${impact.count?`已有 ${impact.count} 堂未結束課程，既有排課會保留。`:""}停止新增選用，歷史紀錄保留。${kind==="staff"?"工作存取將撤銷。":""}`))return;}
  const result=await applyCourseBatchStatus({kind,ids:[id],active:!active});if(!result.success){setError(result.error);return;}if(result.failed.length){setError(result.failed[0].error);return;}onApplied([id],!active);router.refresh();
 }catch{setError("儲存失敗，請重試");}finally{setBusy(false);onPendingChange?.([id],false);}}
 return <span><button type="button" disabled={busy||disabled} className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm text-primary-800 disabled:opacity-50" onClick={()=>void run()}>{busy?"儲存中…":product?active?"下架":"上架":active?"停用":"啟用"}</button>{error&&<span role="alert" className="block max-w-64 whitespace-normal text-xs text-red-700">{error}</span>}</span>;
}
