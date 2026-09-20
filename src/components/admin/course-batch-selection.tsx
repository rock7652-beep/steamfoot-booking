"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {batchCourseStatus} from "@/server/actions/course-batch";
export function CourseBatchBar({kind,ids,selected,onChange}:{kind:"room"|"plan"|"staff";ids:string[];selected:string[];onChange:(ids:string[])=>void}) {
 const [pending,start]=useTransition(),[error,setError]=useState("");const router=useRouter();
 const active=selected.filter(id=>ids.includes(id));
 function submit(enabled:boolean){
  if(!enabled && !window.confirm(kind==="staff"?`停用 ${active.length} 位人員？工作存取將撤銷，既有課次與會員資料保留。`:`確認${kind==="plan"?"下架方案":"停用教室"} ${active.length} 筆？歷史紀錄保留。`))return;
  start(async()=>{try{const r=await batchCourseStatus({kind,ids:active,active:enabled});if(!r.success)setError(r.error);else{setError("");onChange([]);router.refresh();}}catch{setError("儲存失敗，請重試");}});
 }
 return <div className="my-3 flex flex-wrap items-center gap-3 text-sm"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={pending||!ids.length} checked={!!ids.length&&active.length===ids.length} onChange={e=>onChange(e.target.checked?ids:[])}/>全選目前篩選結果</label><span>已選 {active.length} 筆</span>{active.length>0&&<><button disabled={pending} className="min-h-11 rounded border px-3" onClick={()=>submit(true)}>{kind==="plan"?"批次上架":"批次啟用"}</button><button disabled={pending} className="min-h-11 rounded border px-3" onClick={()=>submit(false)}>{kind==="plan"?"批次下架":"批次停用"}</button><button disabled={pending} onClick={()=>onChange([])}>清除選取</button></>}{pending&&<span role="status">儲存中…</span>}{error&&<p role="alert" className="w-full text-red-700">{error}</p>}</div>;
}
