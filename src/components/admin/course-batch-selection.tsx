"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {batchCourseStatus,deleteCourseItems} from "@/server/actions/course-batch";
export function CourseBatchBar({kind,ids,selected,onChange,names={},deleteOnly=false,canDelete=false}:{kind:"room"|"plan"|"staff"|"template";names?:Record<string,string>;deleteOnly?:boolean;canDelete?:boolean;ids:string[];selected:string[];onChange:(ids:string[])=>void}) {
 const [pending,start]=useTransition(),[error,setError]=useState("");const router=useRouter();
 const [confirmDelete,setConfirmDelete]=useState(false);
 const active=selected.filter(id=>ids.includes(id));
 function remove(){start(async()=>{try{const r=await deleteCourseItems({kind,ids:active});if(!r.success)setError(r.error);else{setError("");setConfirmDelete(false);onChange([]);router.refresh();}}catch{setError("刪除失敗，資料未確認刪除，請重新整理核對");}});}
 function submit(enabled:boolean){
 if(kind==="template")return;
  if(!enabled && !window.confirm(kind==="staff"?`停用 ${active.length} 位人員？工作存取將撤銷，既有課次與會員資料保留。`:`確認${kind==="plan"?"下架方案":"停用教室"} ${active.length} 筆？歷史紀錄保留。`))return;
  start(async()=>{try{const r=await batchCourseStatus({kind,ids:active,active:enabled});if(!r.success)setError(r.error);else{setError("");onChange([]);router.refresh();}}catch{setError("儲存失敗，請重試");}});
 }
 return <div className="my-3 flex flex-wrap items-center gap-3 text-sm"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={pending||!ids.length} checked={!!ids.length&&active.length===ids.length} onChange={e=>onChange(e.target.checked?ids:[])}/>全選目前篩選結果</label><span>已選 {active.length} 筆</span>{active.length>0&&<>{!deleteOnly&&kind!=="template"&&<><button disabled={pending} className="min-h-11 rounded border px-3" onClick={()=>submit(true)}>{kind==="plan"?"批次上架":"批次啟用"}</button><button disabled={pending} className="min-h-11 rounded border px-3" onClick={()=>submit(false)}>{kind==="plan"?"批次下架":"批次停用"}</button></>}{canDelete&&<button disabled={pending} className="min-h-11 rounded border border-red-200 px-3 text-red-700" onClick={()=>{setConfirmDelete(true);setError("");}}>刪除選取項目</button>}<button disabled={pending} onClick={()=>onChange([])}>清除選取</button></>}{canDelete&&confirmDelete&&active.length>0&&<section role="alertdialog" aria-label="確認刪除選取項目" className="w-full rounded border border-red-200 bg-white p-4"><p>確認刪除以下 {active.length} 筆？刪除後無法復原；已有使用紀錄的項目會阻擋整批刪除。</p><ul className="my-2 max-h-40 overflow-auto">{active.map(id=><li key={id}>{names[id]??id}</li>)}</ul><button className="min-h-11 rounded border px-3" disabled={pending} onClick={()=>setConfirmDelete(false)}>返回</button><button className="ml-2 min-h-11 rounded bg-red-700 px-3 text-white" disabled={pending} onClick={remove}>確認刪除 {active.length} 筆</button></section>}{pending&&<span role="status">儲存中…</span>}{error&&<p role="alert" className="w-full text-red-700">{error}</p>}</div>;
}
