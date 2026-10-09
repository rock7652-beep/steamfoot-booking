"use client";

import { useEffect, useState, useTransition } from "react";
import { addTaiwanDuration } from "@/lib/date-utils";
import { getMusicSlotMatches, type MusicSlotMatch, type MusicUnavailableSlot } from "@/server/actions/course-slot-matches";
import { createCourseSchedule } from "@/server/actions/course";
import { DashboardLink } from "@/components/dashboard-link";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";

type Template = { musicSubjectId?:string|null;musicSubject?:{id:string;name:string;isActive:boolean}|null; id:string; name:string; durationMinutes:number; capacity:number; musicTermLessons?:number|null; musicScheduleMode?:string|null; defaultRoomId:string|null };
type Room = { id:string; name:string };
type Coach = { id:string; displayName:string };

export function MusicScheduleWizard({templates,rooms,coaches,initialDate,requestKey,sourceSessionId,initialTemplateId,onCreated,onGuard,onRefresh}:{
  templates:Template[];rooms:Room[];coaches:Coach[];initialDate:string;requestKey:string;sourceSessionId?:string;initialTemplateId?:string;
  onCreated:(sessionId:string,date:string)=>void;
  onGuard?:(dirty:boolean,pending:boolean)=>void;
  onRefresh?:()=>void;
}) {
  const [templateId,setTemplateId]=useState(initialTemplateId ?? templates[0]?.id ?? "");
  const template=templates.find(t=>t.id===templateId);
  const subjectId=template?.musicSubjectId??templateId;
  const subjects=[...new Map(templates.map(t=>[t.musicSubjectId??t.id,{id:t.musicSubjectId??t.id,name:t.musicSubject?.name??t.name}])).values()];
  const [capacity,setCapacity]=useState(templates.find(t=>t.id===(initialTemplateId??templates[0]?.id))?.capacity??1);
  function chooseTemplate(id:string){setTemplateId(id);const t=templates.find(t=>t.id===id);setCapacity(t?.capacity??1);const n=t?.durationMinutes??60;setDuration(([30,60,90,120] as number[]).includes(n)?n as 30|60|90|120:60);resetSlot();}

  const [duration,setDuration]=useState<30|60|90|120>(()=>{
    const n=templates.find(t=>t.id===(initialTemplateId ?? templates[0]?.id))?.durationMinutes ?? 60;
    return ([30,60,90,120] as number[]).includes(n) ? n as 30|60|90|120 : 60;
  });
  const [date,setDate]=useState(initialDate);
  const [slots,setSlots]=useState<MusicSlotMatch[]|null>(null);
  const [unavailable,setUnavailable]=useState<MusicUnavailableSlot[]>([]);
  const [time,setTime]=useState("");
  const [coachId,setCoachId]=useState("");
  const [pair,setPair]=useState<{roomId:string;coachId:string}|null>(null);
  const [repeat,setRepeat]=useState(false);
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  const [reload,setReload]=useState(0);
  const dirty=!!time || date!==initialDate || templateId!==(initialTemplateId??templates[0]?.id??"") || repeat;
  useCourseDraftGuard(dirty,pending);
  useEffect(()=>{onGuard?.(dirty,pending);return()=>onGuard?.(false,false);},[dirty,pending,onGuard]);
  function resetSlot(){setSlots(null);setUnavailable([]);setTime("");setCoachId("");setPair(null);setError("");}
  useEffect(()=>{
    if(!templateId || !date) return;
    let active=true;
    getMusicSlotMatches({date,templateId,durationMinutes:duration}).then(result=>{
      if(!active)return;
      if(result.success){setSlots(result.data);setUnavailable("unavailable" in result ? result.unavailable??[] : []);}
      else setError(result.error ?? "空位讀取失敗");
    }).catch(()=>{if(active)setError("空位讀取失敗，請重新選擇日期");});
    return()=>{active=false;};
  },[date,templateId,duration,reload]);
  function refresh(){resetSlot();setReload(value=>value+1);onRefresh?.();}
  const repairTargets=[...new Set(unavailable.map(slot=>slot.fixTarget).filter(Boolean))];
  const repairLinks={hours:{href:"/dashboard/courses/hours",label:"設定營業時間與公休"},teacher:{href:"/dashboard/teachers",label:"設定教師授課資格與時間"},room:{href:"/dashboard/courses?view=rooms",label:"設定教室與容量"}};
  const times=[...new Set(slots?.map(s=>s.time) ?? [])].sort();
  const pairs=slots?.filter(s=>s.time===time).flatMap(s=>s.coachIds.map(coachId=>({roomId:s.roomId,coachId,fixedOrigin:s.fixedOriginCoachIds?.includes(coachId)??false}))) ?? [];
  const teacherIds=[...new Set(pairs.map(option=>option.coachId))];
  const availableRooms=pairs.filter(option=>option.coachId===coachId);
  function create(){
    if(!template || !pair || !time || pending)return;
    if(!Number.isInteger(capacity)||capacity<1||capacity>500){setError("人數上限請填 1–500 人");return;}
    setError("");
    startTransition(async()=>{
      try{
        const result=await createCourseSchedule({
          templateId,sourceSessionId:templateId===initialTemplateId?sourceSessionId:undefined,roomId:pair.roomId,coachId:pair.coachId,date,time,
          durationMinutes:duration,capacity,
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
    <div className="grid gap-3 sm:grid-cols-2">
    <label className="block">教學項目<select className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" value={subjectId} onChange={e=>chooseTemplate(templates.find(t=>(t.musicSubjectId??t.id)===e.target.value)?.id??"")}>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="block">班型方案<select className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" value={templateId} onChange={e=>chooseTemplate(e.target.value)}>{templates.filter(t=>(t.musicSubjectId??t.id)===subjectId).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label className="block">人數上限<input className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" type="number" min="1" max="500" value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>
    </div>
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
      {!slots && !error && !!templateId && <p role="status" className="text-earth-600">正在核對老師、教室與營業時間…</p>}
      {(slots?.length===0 || !templateId) && <p className="rounded-xl bg-earth-50 px-3 py-4 text-earth-700">這天沒有合適空位，請換日期或時長。</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {times.map(slotTime=>{
          const matching=slots!.filter(s=>s.time===slotTime);
          const teacherCount=new Set(matching.flatMap(s=>s.coachIds)).size;
          return <button key={slotTime} type="button" className={`min-h-11 rounded-xl border px-2 ${slotTime===time?"border-primary-700 bg-primary-50 text-primary-900":"border-earth-200"}`} onClick={()=>{setTime(slotTime);const options=matching.flatMap(slot=>slot.coachIds.map(id=>({coachId:id,roomId:slot.roomId,fixedOrigin:slot.fixedOriginCoachIds?.includes(id)??false})));const ids=[...new Set(options.map(option=>option.coachId))];setCoachId(ids.length===1?ids[0]:"");setPair(options.length===1&&!(options[0].fixedOrigin&&template?.musicScheduleMode==="FIXED")?options[0]:null);}}>
            {slotTime}<span className="block text-[11px]">{teacherCount} 位老師 · {matching.length} 間教室</span>
          </button>;
        })}
      </div>
      {!!unavailable.length && <details className="rounded-xl border border-earth-200 px-3 py-2 text-earth-700"><summary className="cursor-pointer">查看其他時段為何不能排（{unavailable.length} 個）</summary><div className="mt-2 grid max-h-36 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">{unavailable.map(slot=><span key={slot.time} className="rounded bg-earth-50 px-2 py-1 text-xs">{slot.time} · {slot.reason}</span>)}</div></details>}
      {(slots?.length===0 || !templateId)&&<div className="flex flex-wrap items-center gap-2 text-sm">
        {!templates.length&&<DashboardLink href="/dashboard/courses?view=plans&action=create" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">建立班型與學費（另開分頁）</DashboardLink>}
        {repairTargets.map(target=>{const repair=repairLinks[target!];return <DashboardLink key={target} href={repair.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{repair.label}（另開分頁）</DashboardLink>;})}
        <button type="button" disabled={pending} onClick={refresh} className="min-h-11 rounded-lg border border-earth-200 px-3">已修正，重新查空位</button>
        <p className="w-full text-earth-600">設定另開分頁，這裡的日期、班型與時長會保留。</p>
      </div>}
    </div>
    {time && <div aria-label="合格老師與可用教室" className="space-y-2">
      <strong>④ {date} {time} · 選老師／教室</strong>
      <div className="grid grid-cols-2 gap-1.5">
        {teacherIds.map(id=><button key={id} type="button" className={`min-h-11 rounded-xl border px-3 text-left ${coachId===id?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>{setCoachId(id);setPair(null);}}>
          {coaches.find(c=>c.id===id)?.displayName} · {pairs.filter(option=>option.coachId===id).length} 間教室
        </button>)}
      </div>
      {coachId&&<div aria-label="老師可用教室" className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
        {availableRooms.map(option=><button key={option.roomId} type="button" disabled={option.fixedOrigin&&template?.musicScheduleMode==="FIXED"} title={option.fixedOrigin?"原固定課保留此時段，僅可排單次臨時課":undefined} className={`min-h-11 rounded-xl border px-3 text-left disabled:opacity-50 ${pair?.roomId===option.roomId?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>{setPair(option);if(option.fixedOrigin)setRepeat(false);}}>教室 {rooms.find(r=>r.id===option.roomId)?.name}{option.fixedOrigin&&<span className="block text-[11px]">原固定課保留 · 限單次臨時課</span>}</button>)}
      </div>}
    </div>}
    {pair && <div className="space-y-3 border-t border-earth-100 pt-3">
      <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={repeat} disabled={pairs.find(option=>option.roomId===pair.roomId&&option.coachId===pair.coachId)?.fixedOrigin} onChange={e=>setRepeat(e.target.checked)}/>每週固定排 {template?.musicTermLessons ?? 4} 堂</label>
      {repeat && <p className="text-xs text-earth-600">將從首次上課日建立同時段的 {template?.musicTermLessons ?? 4} 堂；每堂都會再次檢查空位。</p>}
      <button type="button" disabled={pending} onClick={create} className="min-h-11 w-full rounded-xl bg-primary-700 px-4 font-medium text-white disabled:opacity-50">{pending?"建立中…":"建立課程，接著選學員"}</button>
    </div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p>}
  </div>;
}
