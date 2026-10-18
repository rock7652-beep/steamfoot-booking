"use client";
import {useRef,useState,useTransition} from "react";
import {RightSheet} from "@/components/admin/right-sheet";
import {updateCourseRosterBatch} from "@/server/actions/course-members";
import {formatTWDateTime} from "@/lib/date-utils";
type Booking={id:string;customerName:string;status:string;absenceKind?:string|null};
type Session={id:string;nameSnapshot:string;startsAt:string;bookings:Booking[]};
type Leave={id:string;sessionId:string;customerName:string;absenceKind:string|null};
const button="min-h-11 rounded-lg border border-earth-200 px-3 text-sm text-primary-800 disabled:opacity-50";
/** Uses the calendar's existing scoped data; all corrections recheck the live transaction. */
export function SportsAttendancePanel({date,sessions,leaves,canEdit,onClose,onChanged}:{date:string;sessions:Session[];leaves:Leave[];canEdit:boolean;onClose:()=>void;onChanged:()=>Promise<void>}){
 const [pending,start]=useTransition(),[error,setError]=useState(""),lock=useRef(false);
 const rows=sessions.flatMap(session=>{
  const noShows=session.bookings.filter(b=>b.status==="NO_SHOW").map(b=>({...b,session,kind:"曠課"}));
  const absent=leaves.filter(b=>b.sessionId===session.id&&["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(b.absenceKind??"")).map(b=>({...b,status:"CANCELLED",session,kind:"請假"}));
  return [...noShows,...absent];
 }).sort((a,b)=>a.session.startsAt.localeCompare(b.session.startsAt)||a.customerName.localeCompare(b.customerName));
 function restore(row:typeof rows[number]){
  if(pending||lock.current||!canEdit)return;lock.current=true;setError("");
  start(async()=>{try{
   const result=await updateCourseRosterBatch({sessionId:row.session.id,target:"RESERVED",bookings:[{id:row.id,status:row.status}]});
   if(!result.success){setError(result.error??"尚未完成取消，請重試");return;}
   await onChanged();
  }catch{setError("連線失敗，請核對最新狀況後再試。");}finally{lock.current=false;}});
 }
 return <RightSheet open presentation="centered" width={760} labelledById="sports-attendance-title" onClose={()=>!pending&&onClose()}>
  <header className="flex items-center gap-3 border-b border-earth-200 px-4 py-3"><h2 id="sports-attendance-title" className="font-semibold">出席狀況</h2><span className="text-sm text-earth-600">{date}</span><button type="button" className={`${button} ml-auto`} disabled={pending} onClick={onClose}>關閉</button></header>
  <div className="min-h-0 overflow-y-auto p-4">
   <p className="mb-3 text-sm text-earth-600">當日請假與曠課紀錄。取消標記後恢復待點名；扣堂與補課資格依原紀錄核對。</p>
   {error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   {!rows.length&&<p className="py-8 text-center text-sm text-earth-500">當日沒有請假或曠課紀錄。</p>}
   <ul className="divide-y divide-earth-100">{rows.map(row=><li key={row.id} className="flex flex-wrap items-center gap-3 py-3 text-sm"><div className="min-w-0 flex-1 basis-48"><strong>{row.customerName}</strong><span className="ml-2 text-earth-600">{row.kind}</span><p className="break-words text-earth-600">{formatTWDateTime(new Date(row.session.startsAt)).slice(11,16)} · {row.session.nameSnapshot}</p></div>{canEdit&&<button type="button" className={button} disabled={pending} aria-label={`${row.customerName} 取消${row.kind}`} onClick={()=>restore(row)}>取消{row.kind}</button>}</li>)}</ul>
  </div>
 </RightSheet>;
}
