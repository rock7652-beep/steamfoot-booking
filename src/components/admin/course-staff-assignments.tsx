"use client";
import {useState} from "react";
import {CourseConflicts,type ConflictItem} from "./course-conflicts";
import {toLocalDateStr} from "@/lib/date-utils";
export function CourseStaffAssignments({items,label}:{items:ConflictItem[];label:string}) {
  const [date,setDate]=useState("");
  const [page,setPage]=useState(0);
  const [expanded,setExpanded]=useState(false);
  const rows=items.filter(item=>!date || toLocalDateStr(new Date(item.startsAt))===date);
  const compact=!date&&!expanded;
  const pageSize=compact?3:10;
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  const current=Math.min(page,pages-1);
  return <section className="space-y-2"><div data-browse-control className="flex flex-wrap items-center gap-3"><h3 className="font-medium">{label}（{items.length} 堂）</h3><label className="text-sm">日期 <input aria-label="授課安排日期" type="date" className="min-h-11 min-w-0 rounded-lg border px-2" value={date} onChange={e=>{setDate(e.target.value);setPage(0);}}/></label>{date && <button type="button" className="min-h-11 px-3 text-sm" onClick={()=>{setDate("");setPage(0);}}>全部日期</button>}</div>
    <CourseConflicts items={rows.slice(current*pageSize,(current+1)*pageSize)} label={label}/>
    {!rows.length && <p className="text-sm text-earth-500">此日期沒有未結束課次。</p>}
    {!date&&items.length>3&&<button type="button" className="min-h-10 rounded-lg border border-earth-200 px-3 text-sm" onClick={()=>{setExpanded(v=>!v);setPage(0);}}>{expanded?"收合":"查看全部（"+items.length+"）"}</button>}
    {pages>1 && <nav aria-label="授課安排分頁" className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {current+1}／{pages} 頁</span><button type="button" className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={!current} onClick={()=>setPage(current-1)}>上一頁</button><button type="button" className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>下一頁</button></nav>}
  </section>;
}
