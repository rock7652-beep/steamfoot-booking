"use client";

import { useEffect, useState, useTransition } from "react";
import {CourseScheduleLearners,type ScheduleLearner} from "@/components/admin/course-schedule-learners";
import { addTaiwanDuration, parseTaipeiDateTime, formatTWDateTime } from "@/lib/date-utils";
import { getMusicSlotMatches, type MusicSlotMatch, type MusicUnavailableSlot } from "@/server/actions/course-slot-matches";
import { createCourseSchedule } from "@/server/actions/course";
import { DashboardLink } from "@/components/dashboard-link";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";

type Template = { musicSubjectId?:string|null;musicSubject?:{id:string;name:string;isActive:boolean}|null; id:string; name:string; durationMinutes:number; capacity:number; musicTermLessons?:number|null; musicScheduleMode?:string|null; defaultRoomId:string|null };
type Room = { id:string; name:string };
type Coach = { id:string; displayName:string };

export function MusicScheduleWizard({templates,rooms,coaches,initialDate,seed,requestKey,sourceSessionId,initialTemplateId,onCreated,onGuard,onRefresh}:{
  templates:Template[];rooms:Room[];coaches:Coach[];initialDate:string;requestKey:string;sourceSessionId?:string;initialTemplateId?:string;
  seed?:{date?:string;time?:string;roomId?:string;coachId?:string;durationMinutes?:number};
  onCreated:(sessionId:string,date:string,sessions:unknown[])=>void;
  onGuard?:(dirty:boolean,pending:boolean)=>void;
  onRefresh?:()=>void;
}) {
  const [templateId,setTemplateId]=useState(initialTemplateId ?? templates[0]?.id ?? "");
  const template=templates.find(t=>t.id===templateId);
  const [capacity,setCapacity]=useState(templates.find(t=>t.id===(initialTemplateId??templates[0]?.id))?.capacity??1);
  function chooseTemplate(id:string){setTemplateId(id);const t=templates.find(t=>t.id===id);setCapacity(t?.capacity??1);const n=t?.durationMinutes??60;setDuration(([30,60,90,120] as number[]).includes(n)?n as 30|60|90|120:60);resetSlot();}

  const [duration,setDuration]=useState<30|60|90|120>(()=>{
    const n=templates.find(t=>t.id===(initialTemplateId ?? templates[0]?.id))?.durationMinutes ?? 60;
    return ([30,60,90,120] as number[]).includes(n) ? n as 30|60|90|120 : 60;
  });
  const [date,setDate]=useState(initialDate);
  const [slots,setSlots]=useState<MusicSlotMatch[]|null>(null);
  const [blocker,setBlocker]=useState<Omit<MusicUnavailableSlot,"time">>();
  const [unavailable,setUnavailable]=useState<MusicUnavailableSlot[]>([]);
  const [time,setTime]=useState(seed?.time ?? "");
  const [coachId,setCoachId]=useState(seed?.coachId ?? "");
  const [teacherEdited,setTeacherEdited]=useState(false);
  const [learners,setLearners]=useState<ScheduleLearner[]>([]);
  const [learnersValid,setLearnersValid]=useState(true);
  const [pair,setPair]=useState<{roomId:string;coachId:string}|null>(null);
  const [repeat,setRepeat]=useState(false);
  const [editingArrangement,setEditingArrangement]=useState(false);
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  const [checkedAgain,setCheckedAgain]=useState(false);
  const [reload,setReload]=useState(0);
  const initialTemplate=templates.find(t=>t.id===(initialTemplateId??templates[0]?.id));
  const initialDuration=([30,60,90,120] as number[]).includes(initialTemplate?.durationMinutes??60)?initialTemplate?.durationMinutes??60:60;
  const dirty=time!==(seed?.time??"") || teacherEdited || date!==initialDate || templateId!==(initialTemplateId??templates[0]?.id??"") || capacity!==(initialTemplate?.capacity??1) || duration!==initialDuration || repeat || learners.length>0;
  useCourseDraftGuard(dirty,pending);
  useEffect(()=>{onGuard?.(dirty,pending);return()=>onGuard?.(false,false);},[dirty,pending,onGuard]);
  function resetSlot(){setCheckedAgain(false);setSlots(null);setBlocker(undefined);setUnavailable([]);setTime(seed?.time??"");setCoachId(seed?.coachId??"");setPair(null);setError("");}
  useEffect(()=>{
    if(!templateId || !date) return;
    let active=true;
    getMusicSlotMatches({date,templateId,durationMinutes:duration}).then(result=>{
      if(!active)return;
      if(result.success){
        if(seed?.time){
          const matching=result.data.filter(slot=>slot.time===seed.time && (!seed.roomId || slot.roomId===seed.roomId));
          const options=matching.flatMap(slot=>slot.coachIds.filter(id=>!seed.coachId || id===seed.coachId).map(id=>({roomId:slot.roomId,coachId:id,fixedOrigin:slot.fixedOriginCoachIds?.includes(id)??false})));
          const ids=[...new Set(options.map(option=>option.coachId))];
          setTime(seed.time);
          setCoachId(seed.coachId ?? (ids.length===1?ids[0]:""));
          if(options.length===1 && !(options[0].fixedOrigin && template?.musicScheduleMode==="FIXED"))setPair(options[0]);
        }
        setBlocker("blocker" in result?result.blocker:undefined);setSlots(result.data);setUnavailable("unavailable" in result ? result.unavailable??[] : []);}
      else setError(result.error ?? "空位讀取失敗");
    }).catch(()=>{if(active)setError("空位讀取失敗，請重新選擇日期");});
    return()=>{active=false;};
  },[date,templateId,duration,reload,seed,template?.musicScheduleMode]);
  function refresh(){resetSlot();setCheckedAgain(true);setReload(value=>value+1);onRefresh?.();}
  const repairTargets=blocker ? [blocker.fixTarget].filter(Boolean) : [...new Set(unavailable.map(slot=>slot.fixTarget).filter(Boolean))];
  const noSlotReason=blocker?.reason??unavailable.find(slot=>slot.fixTarget!=="hours")?.reason??unavailable[0]?.reason;
  const repairLinks={hours:{href:"/dashboard/courses/hours",label:"設定營業時間"},teacher:{href:"/dashboard/teachers",label:"設定老師"},room:{href:"/dashboard/courses?view=rooms",label:"設定教室"}};
  const times=[...new Set(slots?.map(s=>s.time) ?? [])].sort();
  const pairs=slots?.filter(s=>s.time===time&&(!seed?.roomId||s.roomId===seed.roomId)).flatMap(s=>s.coachIds.map(coachId=>({roomId:s.roomId,coachId,fixedOrigin:s.fixedOriginCoachIds?.includes(coachId)??false}))) ?? [];
  const teacherIds=[...new Set(pairs.map(option=>option.coachId))];
  const selectedCoachId=coachId || (teacherIds.length===1 ? teacherIds[0] : "");
  const availableRooms=pairs.filter(option=>option.coachId===selectedCoachId);
  const validRooms=availableRooms.filter(option=>!(option.fixedOrigin&&template?.musicScheduleMode==="FIXED"));
  const selectedPair=validRooms.find(option=>option.roomId===pair?.roomId&&option.coachId===pair?.coachId) ?? (validRooms.length===1?validRooms[0]:null);
  const noSlot=!!slots && (!slots.length || (!!time&&!pairs.length));
  const reason=(noSlotReason??"此時段沒有可用老師或教室").replace(/尚無教師具備.*授課資格/,"尚無可授課老師");
  const start=parseTaipeiDateTime(date,time);
  const end=start?formatTWDateTime(new Date(start.getTime()+duration*60000)).slice(11):"";
  const roomName=rooms.find(room=>room.id===(seed?.roomId??selectedPair?.roomId))?.name;
  const saveReason=!template?"請選課程":!slots?"正在檢查時段…":!time?"請選時段":!selectedPair?(noSlot?"請先處理時段限制":!selectedCoachId?"請選老師":"請選教室"):!learnersValid?"請確認學員方案與名額":"";
  function create(){
    if(!template || !selectedPair || !time || pending || !learnersValid)return;
    if(!Number.isInteger(capacity)||capacity<1||capacity>500){setError("人數上限請填 1–500 人");return;}
    setError("");
    startTransition(async()=>{
      try{
        const result=await createCourseSchedule({
          templateId,sourceSessionId:templateId===initialTemplateId?sourceSessionId:undefined,roomId:selectedPair.roomId,coachId:selectedPair.coachId,date,time,
          durationMinutes:duration,capacity,
          repeatUntil:repeat?addTaiwanDuration(date,((template.musicTermLessons ?? 4)-1)*7,"DAY"):undefined,
          requestKey,learners:learners.map(({customerId,cardId})=>({customerId,cardId})),
        });
        if(!result.success){setError(result.error ?? "排課失敗，請重新選擇空位");return;}
        if(!result.data.sessionId){setError("課程已建立，請重新整理課表選學員");return;}
        onCreated(result.data.sessionId,date,result.data.sessions);
      }catch{setError("連線失敗，請重試");}
    });
  }
  return <fieldset disabled={pending} className="flex h-full min-h-0 flex-col text-sm">
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-3">
      {time && <p aria-label="已選排課位置" className="rounded-lg bg-earth-50 px-3 py-2">{date} · {time}{end?`–${end}`:""} · {roomName??"教室待選"}</p>}
      <label className="block">課程<select aria-label="課程" className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" value={templateId} onChange={e=>chooseTemplate(e.target.value)}>{templates.map(t=><option key={t.id} value={t.id}>{t.musicSubject?.name&&!t.name.includes(t.musicSubject.name)?`${t.musicSubject.name} · ${t.name}`:t.name}</option>)}</select></label>
      <details open={editingArrangement} onToggle={event=>setEditingArrangement(event.currentTarget.open)} className="rounded-lg border border-earth-200 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2"><span>{duration} 分鐘 · 名額 {capacity} 人</span><span className="text-primary-700">修改</span></summary>
        <div className="grid grid-cols-2 gap-3 pb-3">
          <label>時長<select aria-label="時長" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-2" value={duration} onChange={e=>{setDuration(Number(e.target.value) as 30|60|90|120);resetSlot();}}>{[30,60,90,120].map(n=><option key={n} value={n}>{n} 分鐘</option>)}</select></label>
          <label>名額<input aria-label="名額" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-2" type="number" min="1" max="500" value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>
        </div>
      </details>
      {!seed?.time&&<label className="block">日期<input aria-label="找空位日期" className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 px-3" type="date" value={date} onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>}
      {!slots&&!error&&!!templateId&&<p role="status" className="text-earth-600">正在檢查時段…</p>}
      {(noSlot||!templateId)&&<div role="status" className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
        <p>{!templateId?"尚未建立課程":reason}</p>
        <div className="flex flex-wrap gap-3">
          {!templates.length&&<DashboardLink href="/dashboard/courses?view=plans&action=create" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">建立課程</DashboardLink>}
          {repairTargets.map(target=>{const repair=repairLinks[target!];return <DashboardLink key={target} href={repair.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{repair.label}</DashboardLink>;})}
          <button type="button" onClick={refresh} className="min-h-11 text-primary-700">重新檢查</button>
        </div>
      </div>}
      {!seed?.time&&!!slots?.length&&<div aria-label="可排時段" className="grid grid-cols-3 gap-2 sm:grid-cols-4">{times.map(slotTime=><button key={slotTime} type="button" className={`min-h-11 rounded-xl border px-2 ${slotTime===time?"border-primary-700 bg-primary-50 text-primary-900":"border-earth-200"}`} onClick={()=>{setTime(slotTime);setCoachId(seed?.coachId??"");setPair(null);}}>{slotTime}</button>)}</div>}
      {!seed?.time&&checkedAgain&&!!slots?.length&&<p role="status">請選時段</p>}
      {time&&teacherIds.length>0&&<section aria-label="合格老師與可用教室" className="space-y-2">
        <strong>老師</strong>
        {teacherIds.length===1?<p className="rounded-lg bg-earth-50 px-3 py-2">{coaches.find(c=>c.id===teacherIds[0])?.displayName}</p>:<div className="grid grid-cols-2 gap-2">{teacherIds.map(id=><button key={id} type="button" aria-pressed={selectedCoachId===id} className={`min-h-11 rounded-xl border px-3 text-left ${selectedCoachId===id?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>{setCoachId(id);setTeacherEdited(true);setPair(null);}}>{coaches.find(c=>c.id===id)?.displayName}</button>)}</div>}
        {selectedCoachId&&!seed?.roomId&&validRooms.length>1&&<div aria-label="老師可用教室" className="grid grid-cols-2 gap-2">{validRooms.map(option=><button key={option.roomId} type="button" aria-pressed={selectedPair?.roomId===option.roomId} className={`min-h-11 rounded-xl border px-3 text-left ${selectedPair?.roomId===option.roomId?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>{setPair(option);if(option.fixedOrigin)setRepeat(false);}}>{rooms.find(r=>r.id===option.roomId)?.name}</button>)}</div>}
      </section>}
      {templateId&&<CourseScheduleLearners key={templateId} templateId={templateId} pointCost={1} capacity={capacity} occurrenceCount={repeat?(template?.musicTermLessons??4):1} value={learners} onChange={setLearners} onValidityChange={setLearnersValid} disabled={pending}/>}
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={repeat} disabled={!!selectedPair?.fixedOrigin} onChange={e=>setRepeat(e.target.checked)}/>每週重複 · 共 {template?.musicTermLessons??4} 堂</label>
      {error&&<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
    </div>
    <footer className="shrink-0 border-t border-earth-100 bg-white pt-3">
      {saveReason&&<p role="status" className="mb-2 text-earth-600">{saveReason}</p>}
      <button type="button" disabled={pending||!!saveReason||learners.length>capacity} onClick={create} className="min-h-11 w-full rounded-xl bg-primary-700 px-4 font-medium text-white disabled:opacity-50">{pending?"儲存中…":"儲存排課"}</button>
    </footer>
  </fieldset>;
}
