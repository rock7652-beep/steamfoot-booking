"use client";

import { useEffect, useState, useTransition } from "react";
import { addTaiwanDuration } from "@/lib/date-utils";
import { getMusicSlotMatches, type MusicSlotMatch } from "@/server/actions/course-slot-matches";
import { createCourseSchedule } from "@/server/actions/course";

type Template = { id:string; name:string; durationMinutes:number; capacity:number; musicTermLessons?:number|null; defaultRoomId:string|null };
type Room = { id:string; name:string };
type Coach = { id:string; displayName:string };

export function MusicScheduleWizard({templates,rooms,coaches,initialDate,requestKey,sourceSessionId,initialTemplateId,onCreated}:{
  templates:Template[];rooms:Room[];coaches:Coach[];initialDate:string;requestKey:string;sourceSessionId?:string;initialTemplateId?:string;
  onCreated:(sessionId:string,date:string)=>void;
}) {
  const [templateId,setTemplateId]=useState(initialTemplateId ?? templates[0]?.id ?? "");
  const template=templates.find(t=>t.id===templateId);
  const [duration,setDuration]=useState<30|60|90|120>(()=>{
    const n=templates.find(t=>t.id===(initialTemplateId ?? templates[0]?.id))?.durationMinutes ?? 60;
    return ([30,60,90,120] as number[]).includes(n) ? n as 30|60|90|120 : 60;
  });
  const [date,setDate]=useState(initialDate);
  const [slots,setSlots]=useState<MusicSlotMatch[]|null>(null);
  const [time,setTime]=useState("");
  const [pair,setPair]=useState<{roomId:string;coachId:string}|null>(null);
  const [repeat,setRepeat]=useState(false);
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  function resetSlot(){setSlots(null);setTime("");setPair(null);setError("");}
  useEffect(()=>{
    if(!templateId || !date) return;
    let active=true;
    getMusicSlotMatches({date,templateId,durationMinutes:duration}).then(result=>{
      if(!active)return;
      if(result.success)setSlots(result.data);
      else setError(result.error ?? "空位讀取失敗");
    }).catch(()=>{if(active)setError("空位讀取失敗，請重新選擇日期");});
    return()=>{active=false;};
  },[date,templateId,duration]);
  const times=[...new Set(slots?.map(s=>s.time) ?? [])].sort();
  const pairs=slots?.filter(s=>s.time===time).flatMap(s=>s.coachIds.map(coachId=>({roomId:s.roomId,coachId}))) ?? [];
  function create(){
    if(!template || !pair || !time || pending)return;
    setError("");
    startTransition(async()=>{
      try{
        const result=await createCourseSchedule({
          templateId,sourceSessionId:templateId===initialTemplateId?sourceSessionId:undefined,roomId:pair.roomId,coachId:pair.coachId,date,time,
          durationMinutes:duration,capacity:template.capacity,
          repeatUntil:repeat?addTaiwanDuration(date,((template.musicTermLessons ?? 4)-1)*7,"DAY"):undefined,
          requestKey,
        });
        if(!result.success){setError(result.error ?? "排課失敗，請重新選擇空位");return;}
        if(!result.data.sessionId){setError("課程已建立，請重新整理課表選學員");return;}
        onCreated(result.data.sessionId,date);
      }catch{setError("連線失敗，請重試");}
    });
  }
  return <div className="space-y-4 text-sm">
    <p className="rounded-xl bg-primary-50 px-3 py-2 text-primary-900">課程 → 時長 → 看空位 → 選老師／教室 → 選學員</p>
    <label className="block">① 課程
      <select className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" value={templateId} onChange={e=>{setTemplateId(e.target.value);const n=templates.find(t=>t.id===e.target.value)?.durationMinutes ?? 60;setDuration(([30,60,90,120] as number[]).includes(n) ? n as 30|60|90|120 : 60);resetSlot();}}>
        {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
    <label className="block">② 上課時長
      <select className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" value={duration} onChange={e=>{setDuration(Number(e.target.value) as 30|60|90|120);resetSlot();}}>
        {[30,60,90,120].map(n=><option key={n} value={n}>{n} 分鐘</option>)}
      </select>
    </label>
    <label className="block">③ 看哪一天的空位
      <input aria-label="找空位日期" className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" type="date" value={date} onChange={e=>{setDate(e.target.value);resetSlot();}}/>
    </label>
    <div aria-label="可排時段" className="space-y-2">
      <strong>可排時段</strong>
      {!slots && !error && <p role="status" className="text-earth-600">正在核對老師、教室與營業時間…</p>}
      {slots?.length===0 && <p className="rounded-xl bg-earth-50 px-3 py-4 text-earth-700">這天沒有合適空位，請換日期或時長。</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {times.map(slotTime=>{
          const teacherCount=new Set(slots!.filter(s=>s.time===slotTime).flatMap(s=>s.coachIds)).size;
          return <button key={slotTime} type="button" className={`min-h-11 rounded-xl border px-2 ${slotTime===time?"border-primary-700 bg-primary-50 text-primary-900":"border-earth-200"}`} onClick={()=>{setTime(slotTime);setPair(null);}}>
            {slotTime}<span className="block text-[11px]">{teacherCount} 位老師可排</span>
          </button>;
        })}
      </div>
    </div>
    {time && <div aria-label="合格老師與可用教室" className="space-y-2">
      <strong>④ {date} {time} · 選老師／教室</strong>
      <div className="grid max-h-44 gap-1.5 overflow-y-auto">
        {pairs.map(option=><button key={`${option.roomId}:${option.coachId}`} type="button" className={`min-h-11 rounded-xl border px-3 text-left ${pair?.roomId===option.roomId&&pair.coachId===option.coachId?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>setPair(option)}>
          {coaches.find(c=>c.id===option.coachId)?.displayName} · 教室 {rooms.find(r=>r.id===option.roomId)?.name}
        </button>)}
      </div>
    </div>}
    {pair && <div className="space-y-3 border-t border-earth-100 pt-3">
      <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/>每週固定排 {template?.musicTermLessons ?? 4} 堂</label>
      {repeat && <p className="text-xs text-earth-600">將從首次上課日建立同時段的 {template?.musicTermLessons ?? 4} 堂；每堂都會再次檢查空位。</p>}
      <button type="button" disabled={pending} onClick={create} className="min-h-11 w-full rounded-xl bg-primary-700 px-4 font-medium text-white disabled:opacity-50">{pending?"建立中…":"建立課程，接著選學員"}</button>
    </div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p>}
  </div>;
}
