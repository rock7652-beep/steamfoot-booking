"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatTWDateTime } from "@/lib/date-utils";
import { saveCourseLeaveNote, updateCourseDailyAttendanceBatch } from "@/server/actions/course-members";

export type DailyAttendanceRow = {
  id: string;
  sessionId: string;
  status: "RESERVED" | "CANCELLED";
  name: string;
  course: string;
  startsAt: string;
  endsAt: string;
  teacher: string;
  note?: string;
};

export function DailyAttendanceList({kind,date,nowIso,rows,canEdit,onClose,onOpenCourse,onAttendanceOptimistic}:{
  kind:"leave"|"unmarked";date:string;nowIso:string;rows:DailyAttendanceRow[];canEdit:boolean;
  onClose:()=>void;onOpenCourse:(sessionId:string)=>void;
  onAttendanceOptimistic?:(items:DailyAttendanceRow[],status:"ATTENDED"|"NO_SHOW"|null)=>void;
}) {
  const router=useRouter();
  const [selected,setSelected]=useState<string[]>([]);
  const [pending,startTransition]=useTransition();
  const [error,setError]=useState("");
  const [editing,setEditing]=useState<DailyAttendanceRow|null>(null);
  const [note,setNote]=useState("");
  const now=new Date(nowIso).getTime();
  const actionable=rows.filter(row=>kind==="leave" || new Date(row.startsAt).getTime()<=now);
  const chosen=actionable.filter(row=>selected.includes(row.id));
  const title=kind==="leave"?"請假學員":"待點名學員";
  const groups=kind==="leave" ? [{label:"請假紀錄",items:rows}] : [
    {label:"已過上課時間",items:rows.filter(row=>new Date(row.endsAt).getTime()<=now)},
    {label:"正在上課",items:rows.filter(row=>new Date(row.startsAt).getTime()<=now && new Date(row.endsAt).getTime()>now)},
    {label:"尚未開始（暫不處理）",items:rows.filter(row=>new Date(row.startsAt).getTime()>now)},
  ];
  function submit(items:DailyAttendanceRow[],target:"RESERVED"|"ATTENDED"|"NO_SHOW") {
    if(!items.length||pending)return;
    if(target==="NO_SHOW"&&items.some(row=>new Date(row.endsAt).getTime()>Date.now())){setError("課程結束後才能記錄曠課，請先取消正在上課的學員選取。");return;}
    const action=target==="RESERVED"?"取消請假，恢復待點名":target==="ATTENDED"?"記錄出席並依規則扣堂":"記錄曠課並依規則扣堂";
    if(!window.confirm(`確定將 ${items.length} 位學員${action}？\n${items.map(row=>`${formatTWDateTime(new Date(row.startsAt)).slice(11,16)} ${row.name} · ${row.course}`).join("\n")}`))return;
    setError("");
    if(target!=="RESERVED")onAttendanceOptimistic?.(items,target);
    startTransition(async()=>{
      try {
        // All selected classes are validated and changed in one transaction.
        const result=await updateCourseDailyAttendanceBatch({target,bookings:items.map(row=>({id:row.id,sessionId:row.sessionId,status:row.status}))});
        if(!result.success){if(target!=="RESERVED")onAttendanceOptimistic?.(items,null);setError(result.error??"更新失敗");router.refresh();setSelected([]);return;}
        setSelected([]);router.refresh();onClose();
      }catch{if(target!=="RESERVED")onAttendanceOptimistic?.(items,null);setError("連線失敗，請重新整理名單後再試。");router.refresh();}
    });
  }
  function saveNote(){
    if(!editing||pending)return;
    setError("");
    startTransition(async()=>{
      try {
        const result=await saveCourseLeaveNote({bookingId:editing.id,note});
        if(!result.success){setError(result.error??"備註儲存失敗");return;}
        setEditing(null);router.refresh();onClose();
      }catch{setError("連線失敗，請重試。");}
    });
  }
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true" aria-label={title} onClick={()=>{if(!pending)onClose();}}>
    <div className="flex max-h-[85dvh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl" onClick={event=>event.stopPropagation()}>
      <header className="flex flex-wrap items-center gap-3 border-b border-earth-200 p-4"><h2 className="font-semibold">{date} · {title} {rows.length} 人</h2><button type="button" className="ml-auto min-h-10 rounded-lg border border-earth-200 px-3" disabled={pending} onClick={onClose}>關閉</button></header>
      {canEdit && <div className="flex flex-wrap items-center gap-2 border-b border-earth-100 px-4 py-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" aria-label="全選可處理學員" checked={actionable.length>0&&chosen.length===actionable.length} disabled={pending||!actionable.length} onChange={event=>setSelected(event.target.checked?actionable.map(row=>row.id):[])}/>全選可處理學員</label>
        <span className="text-earth-600">已選 {chosen.length} 人</span>
        <button type="button" className="min-h-10 rounded-lg border border-primary-300 px-3 text-primary-800 disabled:opacity-50" disabled={pending||!chosen.length} onClick={()=>submit(chosen,kind==="leave"?"RESERVED":"ATTENDED")}>{kind==="leave"?"批次取消請假":"批次記錄出席"}</button>
        {kind==="unmarked"&&<button type="button" title="須等所選課程全部結束" className="min-h-10 rounded-lg border border-earth-200 px-3 disabled:opacity-50" disabled={pending||!chosen.length||chosen.some(row=>new Date(row.endsAt).getTime()>now)} onClick={()=>submit(chosen,"NO_SHOW")}>批次記錄曠課</button>}
      </div>}
      {error&&<p role="alert" className="mx-4 mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-y-auto p-4">{groups.map(group=>group.items.length>0&&<section key={group.label} className="mb-4"><h3 className="sticky top-0 bg-white py-2 text-sm font-semibold text-earth-700">{group.label} · {group.items.length} 人</h3><ul className="divide-y divide-earth-100">{group.items.map(row=><li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
        {canEdit&&actionable.some(item=>item.id===row.id)&&<input type="checkbox" aria-label={`選取 ${row.name}`} checked={selected.includes(row.id)} disabled={pending} onChange={event=>setSelected(old=>event.target.checked?[...old,row.id]:old.filter(id=>id!==row.id))}/>}
        <strong className="min-w-24">{row.name}</strong><span>{formatTWDateTime(new Date(row.startsAt)).slice(11,16)} · {row.course}</span><span className="text-earth-600">{row.teacher}</span>
        {kind==="leave"&&row.note&&<span className="text-xs text-earth-600">備註：{row.note}</span>}
        <div className="ml-auto flex items-center gap-2">{canEdit&&kind==="leave"&&<button type="button" className="min-h-9 rounded-lg border border-earth-200 px-2" disabled={pending} onClick={()=>{setEditing(row);setNote(row.note??"");}}>編輯備註</button>}{canEdit&&actionable.some(item=>item.id===row.id)&&<button type="button" className="min-h-9 rounded-lg border border-primary-200 px-2 text-primary-800" disabled={pending} onClick={()=>submit([row],kind==="leave"?"RESERVED":"ATTENDED")}>{kind==="leave"?"取消請假":"出席"}</button>}
        <button type="button" className="min-h-9 text-primary-700 underline" disabled={pending} onClick={()=>onOpenCourse(row.sessionId)}>查看課程</button></div>
      </li>)}</ul></section>)}{!rows.length&&<p className="py-8 text-center text-sm text-earth-500">當日沒有學員</p>}</div>
      {editing&&<form className="border-t border-earth-200 bg-earth-50 p-4" onSubmit={event=>{event.preventDefault();saveNote();}}><label className="block text-sm font-semibold">{editing.name} · 請假備註<textarea className="mt-2 min-h-20 w-full rounded-lg border border-earth-200 bg-white p-2 font-normal" value={note} maxLength={1000} onChange={event=>setNote(event.target.value)} /></label><div className="mt-2 flex justify-end gap-2"><button type="button" className="min-h-10 rounded-lg border border-earth-200 px-3" disabled={pending} onClick={()=>setEditing(null)}>返回</button><button type="submit" className="min-h-10 rounded-lg bg-primary-700 px-3 text-white disabled:opacity-50" disabled={pending}>儲存備註</button></div></form>}
    </div>
  </div>;
}
