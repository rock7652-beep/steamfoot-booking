"use client";
import {useState,useTransition,useRef,useEffect} from "react";
import {useRouter} from "next/navigation";
import {applyCourseBatchStatus,courseStatusImpact,deleteCourseItems} from "@/server/actions/course-batch";
type Kind="room"|"plan"|"staff"|"template"|"subject";
export function CourseBatchBar({kind,ids,selected,onChange,names={},deleteOnly=false,canDelete=false,onApplied,onPendingChange,blockedIds=[]}:{kind:Kind;blockedIds?:string[];onPendingChange?:(ids:string[],busy:boolean)=>void;names?:Record<string,string>;deleteOnly?:boolean;canDelete?:boolean;ids:string[];selected:string[];onChange:(ids:string[])=>void;onApplied?:(ids:string[],active:boolean)=>void}) {
 const [pending,start]=useTransition(),[error,setError]=useState("");const router=useRouter();
 const [confirmDelete,setConfirmDelete]=useState(false);
 const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const active=selected.filter(id=>ids.includes(id));
 const blocked=active.some(id=>blockedIds.includes(id));
 const product=kind==="plan"||kind==="subject";
 function remove(){if(kind==="subject")return;start(async()=>{try{const r=await deleteCourseItems({kind,ids:active});if(!r.success)setError(r.error);else{setError("");setConfirmDelete(false);onChange([]);router.refresh();}}catch{setError("刪除失敗，資料未確認刪除，請重新整理核對");}});}
 function submit(enabled:boolean){
 if(kind==="template")return;
 if(blocked||pending)return;const requested=[...active];setError("");onPendingChange?.(requested,true);
 start(async()=>{try{
   if(!enabled){const impact=await courseStatusImpact({kind,ids:requested});if(!impact.success){setError(impact.error);return;}if(!window.confirm(`確認${product?"下架":"停用"} ${requested.length} 筆？${impact.count?`已有 ${impact.count} 堂未結束課程，既有排課會保留。`:""}已購方案與歷史紀錄保留，停止提供新增選用。${kind==="staff"?"人員工作存取將撤銷。":""}`))return;}
   const r=await applyCourseBatchStatus({kind,ids:requested,active:enabled});
   if(!r.success){setError(r.error);return;}
   onApplied?.(r.succeeded,enabled);if(!mounted.current){router.refresh();return;}onChange(r.failed.map(f=>f.id));
   setError(r.failed.map(f=>`${names[f.id]??f.id}：${f.error}`).join("；"));router.refresh();
 }catch{setError("連線中斷，請核對選取項目的狀態後重試");}finally{onPendingChange?.(requested,false);}});
 }
 return <div className="flex flex-wrap items-center gap-2 py-1 text-sm"><label className="flex min-h-9 items-center gap-2"><input type="checkbox" disabled={pending||!ids.length} checked={!!ids.length&&active.length===ids.length} onChange={e=>onChange(e.target.checked?ids:[])}/>全選目前篩選結果</label><span>已選 {active.length} 筆</span>{active.length>0&&<>{!deleteOnly&&kind!=="template"&&<><button disabled={pending||blocked} className="min-h-9 rounded-lg border px-3" onClick={()=>submit(true)}>{product?"批次上架":"批次啟用"}</button><button disabled={pending||blocked} className="min-h-9 rounded-lg border px-3" onClick={()=>submit(false)}>{product?"批次下架":"批次停用"}</button></>}{canDelete&&kind!=="subject"&&<button disabled={pending||blocked} className="min-h-9 rounded-lg border border-red-200 px-3 text-red-700" onClick={()=>{setConfirmDelete(true);setError("");}}>刪除選取項目</button>}<button disabled={pending||blocked} onClick={()=>onChange([])}>清除選取</button></>}{canDelete&&confirmDelete&&active.length>0&&<section role="alertdialog" aria-label="確認刪除選取項目" className="w-full rounded border border-red-200 bg-white p-4"><p>確認刪除以下 {active.length} 筆？刪除後無法復原；已有使用紀錄的項目會阻擋整批刪除。</p><ul className="my-2 max-h-40 overflow-auto">{active.map(id=><li key={id}>{names[id]??id}</li>)}</ul><button className="min-h-11 rounded border px-3" disabled={pending||blocked} onClick={()=>setConfirmDelete(false)}>返回</button><button className="ml-2 min-h-11 rounded bg-red-700 px-3 text-white" disabled={pending||blocked} onClick={remove}>確認刪除 {active.length} 筆</button></section>}{pending&&<span role="status">儲存中…</span>}{error&&<p role="alert" className="w-full text-red-700">{error}</p>}</div>;
}
