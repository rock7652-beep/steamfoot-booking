"use client";
import {useState} from "react";
import {usePathname} from "next/navigation";
import {CourseConflicts,type ConflictItem} from "./course-conflicts";
import {formatTWDateTime,toLocalDateStr} from "@/lib/date-utils";
export function CourseStaffAssignments({items,label,fitness=false}:{items:ConflictItem[];label:string;fitness?:boolean}) {
  const path=usePathname();
  const prefix=path.includes("/s/")?path.split("/admin/")[0]+"/admin":"";
  const [date,setDate]=useState("");
  const [page,setPage]=useState(0);
  const [expanded,setExpanded]=useState(false);
  const rows=items.filter(item=>!date || toLocalDateStr(new Date(item.startsAt))===date);
  const compact=!fitness&&!date&&!expanded;
  const pageSize=compact?3:10;
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  const current=Math.min(page,pages-1);
  return <section className="space-y-2"><div data-browse-control className="flex flex-wrap items-center gap-3"><h3 className="font-medium">{label}（{items.length} 堂）</h3><label className={fitness?"flex items-center gap-2 text-sm":"text-sm"}>日期 <input aria-label="授課安排日期" type="date" className={fitness?"min-h-11 min-w-0 rounded-xl border border-earth-200 bg-white px-3 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100":"min-h-11 min-w-0 rounded-lg border px-2"} value={date} onChange={e=>{setDate(e.target.value);setPage(0);}}/></label>{date && <button type="button" className="min-h-11 px-3 text-sm" onClick={()=>{setDate("");setPage(0);}}>全部日期</button>}</div>
    {fitness ? <div className="overflow-x-auto rounded-lg border border-earth-200"><table className="w-full text-left text-sm" aria-label={label}><thead className="bg-primary-50 text-primary-900"><tr>{["日期","時間","課程","已約／上限"].map(title=><th key={title} className="px-3 py-2 font-medium">{title}</th>)}</tr></thead><tbody className="divide-y divide-earth-100">{rows.slice(current*pageSize,(current+1)*pageSize).map(item=><tr key={item.id}><td className="whitespace-nowrap px-3 py-2">{toLocalDateStr(new Date(item.startsAt))}</td><td className="whitespace-nowrap px-3 py-2">{formatTWDateTime(new Date(item.startsAt)).slice(11)}{item.endsAt?`–${formatTWDateTime(new Date(item.endsAt)).slice(11)}`:""}</td><td className="px-3 py-2"><a target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-primary-700 hover:underline" aria-label={`查看 ${item.name}（另開分頁）`} href={`${prefix}/dashboard/courses?date=${toLocalDateStr(new Date(item.startsAt))}&session=${encodeURIComponent(item.id)}`}>{item.name}</a></td><td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.bookedCount??"—"}／{item.capacity}</td></tr>)}</tbody></table></div> : <CourseConflicts items={rows.slice(current*pageSize,(current+1)*pageSize)} label={label}/>}
    {!rows.length && <p className="text-sm text-earth-500">此日期沒有未結束課次。</p>}
    {!fitness&&!date&&items.length>3&&<button type="button" className="min-h-10 rounded-lg border border-earth-200 px-3 text-sm" onClick={()=>{setExpanded(v=>!v);setPage(0);}}>{expanded?"收合":"查看全部（"+items.length+"）"}</button>}
    {pages>1 && <nav aria-label="授課安排分頁" className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {current+1}／{pages} 頁</span><button type="button" className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={!current} onClick={()=>setPage(current-1)}>上一頁</button><button type="button" className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>下一頁</button></nav>}
  </section>;
}
