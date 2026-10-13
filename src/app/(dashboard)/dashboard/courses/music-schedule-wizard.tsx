"use client";

import { useEffect, useState, useTransition } from "react";
import {CourseScheduleLearners,type ScheduleLearner} from "@/components/admin/course-schedule-learners";
import { addTaiwanDuration, parseTaipeiDateTime, formatTWDateTime } from "@/lib/date-utils";
import { getMusicSlotMatches, type MusicSlotMatch, type MusicUnavailableSlot } from "@/server/actions/course-slot-matches";
import { inspectCourseSchedule } from "@/server/actions/course-schedule-check";
import { createCourseSchedule } from "@/server/actions/course";
import { DashboardLink } from "@/components/dashboard-link";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";

type Template = { musicSubjectId?:string|null;musicSubject?:{id:string;name:string;isActive:boolean}|null; id:string; name:string; durationMinutes:number; capacity:number; classType?:string|null; musicTrialMode?:string|null; musicTermLessons?:number|null; musicScheduleMode?:string|null; defaultRoomId:string|null };
type Room = { id:string; name:string };
type Coach = { id:string; displayName:string };

export function MusicScheduleWizard({templates,rooms,coaches,initialDate,seed,requestKey,sourceSessionId,initialTemplateId,onCreated,onGuard,onRefresh,isTrial=false,canCreateCustomer=false,onPositionChange}:{
  templates:Template[];rooms:Room[];coaches:Coach[];initialDate:string;requestKey:string;sourceSessionId?:string;initialTemplateId?:string;
  seed?:{date?:string;time?:string;roomId?:string;coachId?:string;durationMinutes?:number};
  onCreated:(sessionId:string,date:string,sessions:unknown[])=>void;
  onGuard?:(dirty:boolean,pending:boolean)=>void;
  onPositionChange?:(position:{date:string;time:string;roomId?:string;coachId?:string;durationMinutes:number})=>void;
  onRefresh?:()=>void; isTrial?:boolean; canCreateCustomer?:boolean;
}) {
  const [originalPosition]=useState(()=>({date:initialDate,time:seed?.time??"",roomId:seed?.roomId??""}));
  const eligibleTemplates=templates.filter(t=>isTrial?!!t.musicTrialMode:!t.musicTrialMode);
  const [templateId,setTemplateId]=useState(initialTemplateId ?? eligibleTemplates[0]?.id ?? "");
  const template=eligibleTemplates.find(t=>t.id===templateId);
  const [capacity,setCapacity]=useState(eligibleTemplates.find(t=>t.id===(initialTemplateId??eligibleTemplates[0]?.id))?.capacity??1);
  function chooseTemplate(id:string){setTemplateId(id);const t=templates.find(t=>t.id===id);setCapacity(t?.capacity??1);resetSlot();}

  const [duration,setDuration]=useState<30|60|90|120>(60);
  const [date,setDate]=useState(initialDate);
  const [slots,setSlots]=useState<MusicSlotMatch[]|null>(null);
  const [blocker,setBlocker]=useState<Omit<MusicUnavailableSlot,"time">>();
  const [unavailable,setUnavailable]=useState<MusicUnavailableSlot[]>([]);
  const [roomId,setRoomId]=useState(seed?.roomId??"");
  const [editingPosition,setEditingPosition]=useState(false);
  const [repeatCount,setRepeatCount]=useState(template?.musicTermLessons??4);
  const [time,setTime]=useState(seed?.time ?? "");
  const [coachId,setCoachId]=useState(seed?.coachId ?? "");
  const [teacherEdited,setTeacherEdited]=useState(false);
  const [learners,setLearners]=useState<ScheduleLearner[]>([]);
  const [enrollmentDirty,setEnrollmentDirty]=useState(false);
  const [enrollmentPending,setEnrollmentPending]=useState(false);
  const [learnersValid,setLearnersValid]=useState(true);
  const [pair,setPair]=useState<{roomId:string;coachId:string}|null>(null);
  const [excludedDates,setExcludedDates]=useState<string[]>([]);
  const [conflicts,setConflicts]=useState<{date:string;reason:string}[]>([]);
  const [repeat,setRepeat]=useState(false);
  const [editingArrangement,setEditingArrangement]=useState(false);
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  const [checkedAgain,setCheckedAgain]=useState(false);
  const [reload,setReload]=useState(0);
  const [selectedPurpose,setSelectedPurpose]=useState(isTrial);
  if(selectedPurpose!==isTrial){setSelectedPurpose(isTrial);setTemplateId(eligibleTemplates[0]?.id??"");setCapacity(eligibleTemplates[0]?.capacity??1);setSlots(null);setPair(null);setRepeat(false);setConflicts([]);setLearners([]);}
  const purposeTemplateId=eligibleTemplates.find(t=>t.id===initialTemplateId)?.id??eligibleTemplates[0]?.id??"";
  const initialTemplate=eligibleTemplates.find(t=>t.id===purposeTemplateId);
  const initialDuration=60;
  const dirty=time!==originalPosition.time || roomId!==originalPosition.roomId || teacherEdited || date!==originalPosition.date || templateId!==purposeTemplateId || capacity!==(initialTemplate?.capacity??1) || duration!==initialDuration || repeat || enrollmentDirty || learners.length>0;
  useCourseDraftGuard(dirty,pending);
  useEffect(()=>{onGuard?.(dirty,pending||enrollmentPending);return()=>onGuard?.(false,false);},[dirty,pending,enrollmentPending,onGuard]);
  function resetSlot(){setCheckedAgain(false);setSlots(null);setBlocker(undefined);setUnavailable([]);setPair(null);setError("");}
  useEffect(()=>{
    if(!templateId || !date) return;
    let active=true;
    getMusicSlotMatches({date,templateId,durationMinutes:duration}).then(result=>{
      if(!active)return;
      if(result.success){
        setBlocker("blocker" in result?result.blocker:undefined);setSlots(result.data);setUnavailable("unavailable" in result ? result.unavailable??[] : []);}
      else setError(result.error ?? "空位讀取失敗");
    }).catch(()=>{if(active)setError("空位讀取失敗，請重新選擇日期");});
    return()=>{active=false;};
  },[date,templateId,duration,reload,template?.musicScheduleMode]);
  function refresh(){resetSlot();setCheckedAgain(true);setReload(value=>value+1);onRefresh?.();}
  const slotBlocker=templateId?(unavailable.find(slot=>slot.time===time)??blocker):undefined;
  const repairTargets=slotBlocker?.fixTarget?[slotBlocker.fixTarget]:[];
  const noSlotReason=slotBlocker?.reason;
  const repairLinks={hours:{href:"/dashboard/courses/hours",label:"設定營業時間"},teacher:{href:"/dashboard/teachers",label:"設定老師"},room:{href:"/dashboard/courses?view=rooms",label:"設定教室"}};
  const times=[...new Set(slots?.map(s=>s.time) ?? [])].sort();
  const pairs=slots?.filter(s=>s.time===time&&(!roomId||s.roomId===roomId)).flatMap(s=>s.coachIds.map(coachId=>({roomId:s.roomId,coachId,fixedOrigin:s.fixedOriginCoachIds?.includes(coachId)??false}))) ?? [];
  const teacherIds=[...new Set(pairs.map(option=>option.coachId))];
  const selectedCoachId=coachId || (teacherIds.length===1?teacherIds[0]:"");
  const availableRooms=pairs.filter(option=>option.coachId===selectedCoachId);
  const validRooms=availableRooms.filter(option=>!(option.fixedOrigin&&template?.musicScheduleMode==="FIXED"));
  const selectedPair=validRooms.find(option=>option.roomId===pair?.roomId&&option.coachId===pair?.coachId) ?? (validRooms.length===1?validRooms[0]:null);
  useEffect(()=>{onPositionChange?.({date,time,roomId:roomId||selectedPair?.roomId,coachId:selectedCoachId||undefined,durationMinutes:duration});},[date,time,roomId,selectedPair?.roomId,selectedCoachId,duration,onPositionChange]);
  const noSlot=!!slots && (!slots.length || (!!time&&(!pairs.length || (!!selectedCoachId&&!availableRooms.length))));
  const reason=(noSlotReason??(coachId?"原選老師此時段無法授課，請更換老師或時間":roomId?"此教室目前無法排入，請更換教室、老師或時間":"此時段沒有可用老師或教室")).replace(/尚無教師具備.*授課資格/,"尚無可授課老師");
  const start=parseTaipeiDateTime(date,time);
  const endsAt=start?new Date(start.getTime()+duration*60000):null;
  const end=endsAt?`${formatTWDateTime(endsAt).slice(0,10)!==date?"隔日 ":""}${formatTWDateTime(endsAt).slice(11)}`:"";
  const roomName=rooms.find(room=>room.id===(roomId||selectedPair?.roomId))?.name;
  const saveReason=!template?"請選課程":!slots?"正在檢查時段…":!time?"請選時段":!selectedPair?(noSlot?"":!selectedCoachId?"請選老師":"請選教室"):!learnersValid?"請確認學員方案與名額":template.classType&&template.classType!=="GROUP"&&!learners.length?"請加入學員":"";
  const repeatDates=Array.from({length:Math.min(53,Math.max(0,repeatCount||0))},(_,i)=>addTaiwanDuration(date,i*7,"DAY"));
  const includedDates=repeat&&!isTrial?repeatDates.filter(day=>!excludedDates.includes(day)):[date];
  function create(){
    if(!template || !selectedPair || !time || pending || enrollmentPending || !learnersValid || !Number.isInteger(repeatCount)||repeatCount<1||repeatCount>53||!includedDates.length)return;
    if(!Number.isInteger(capacity)||capacity<1||capacity>500){setError("人數上限請填 1–500 人");return;}
    setError("");
    startTransition(async()=>{
      try{
        const input={
          templateId,sourceSessionId:templateId===initialTemplateId?sourceSessionId:undefined,roomId:selectedPair.roomId,coachId:selectedPair.coachId,time,
          durationMinutes:duration,capacity,
          date:includedDates[0],additionalDates:repeat?includedDates.slice(1):undefined,
          requestKey,isTrial,learners:learners.map(({customerId,cardId,trialPrice,name})=>({customerId:customerId.startsWith("trial-draft:")?null:customerId,...(customerId.startsWith("trial-draft:")?{participantKey:customerId.slice(12),customerName:name}:{}),cardId:cardId||null,...(trialPrice!==undefined?{trialPrice}:{})})),
        };
        const check=await inspectCourseSchedule(input);
        if(!check.success){setError(check.error??"時段檢查失敗");return;}
        setConflicts(check.issues);
        if(check.issues.length){setError("下列日期無法排入，整批尚未儲存");return;}
        const result=await createCourseSchedule(input);
        if(!result.success){setError(result.error ?? "排課失敗，請重新選擇空位");return;}
        if(!result.data.sessionId){setError("課程已建立，請重新整理課表選學員");return;}
        onCreated(result.data.sessionId,includedDates[0],result.data.sessions);
      }catch{setError("連線失敗，請重試");}
    });
  }
  return <fieldset disabled={pending} className="flex h-full min-h-0 min-w-0 flex-col text-sm">
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-3">
      {time && <p aria-label="已選排課位置" className="rounded-lg bg-earth-50 px-3 py-2">{date} · {time}{end?`–${end}`:""} · {roomName??"教室待選"}{coachId?` · ${coaches.find(c=>c.id===coachId)?.displayName??"老師待確認"}`:""}<button type="button" className="ml-2 min-h-11 text-primary-700" onClick={()=>setEditingPosition(v=>!v)}>{editingPosition?"收合":"修改"}</button></p>}
      {editingPosition&&<div className="grid grid-cols-2 gap-3"><label>日期<input aria-label="排課日期" type="date" value={date} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setDate(e.target.value);resetSlot();}}/></label><label>時間<input aria-label="排課時間" type="time" step={1800} value={time} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setTime(e.target.value);setPair(null);}}/></label><label>教室<select aria-label="排課教室" value={roomId} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setRoomId(e.target.value);setPair(null);}}><option value="">選擇可用教室</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>老師<select aria-label="更換排課老師" value={coachId} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setCoachId(e.target.value);setTeacherEdited(true);setPair(null);}}><option value="">選擇可用老師</option>{coaches.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label></div>}
      {eligibleTemplates.length>0&&<label className="block">課程<select aria-label="課程" className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" value={templateId} onChange={e=>chooseTemplate(e.target.value)}>{eligibleTemplates.map(t=><option key={t.id} value={t.id}>{t.musicSubject?.name&&!t.name.includes(t.musicSubject.name)?`${t.musicSubject.name} · ${t.name}`:t.name}</option>)}</select></label>}
      {eligibleTemplates.length>0&&<details open={editingArrangement} onToggle={event=>setEditingArrangement(event.currentTarget.open)} className="rounded-lg border border-earth-200 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2"><span>{duration} 分鐘 · 名額 {capacity} 人</span><span className="text-primary-700">{editingArrangement?"收合":"修改"}</span></summary>
        <div className="grid grid-cols-2 gap-3 pb-3">
          <label>時長<select aria-label="時長" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-2" value={duration} onChange={e=>{setDuration(Number(e.target.value) as 30|60|90|120);resetSlot();}}>{[30,60,90,120].map(n=><option key={n} value={n}>{n} 分鐘</option>)}</select></label>
          <label>名額<input aria-label="名額" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-2" type="number" min="1" max="500" value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>
        </div>
      </details>}
      {!time&&<label className="block">日期<input aria-label="找空位日期" className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 px-3" type="date" value={date} onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>}
      {!slots&&!error&&!!templateId&&<p role="status" className="text-earth-600">正在檢查時段…</p>}
      {(noSlot||!templateId)&&<div role="status" className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
        <p>{!templateId?(isTrial?"尚未設定體驗課程":"尚未建立課程"):reason}</p>
        <div className="flex flex-wrap gap-3">
          {!eligibleTemplates.length&&<DashboardLink href="/dashboard/courses?view=plans&action=create" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{isTrial?"設定體驗":"建立課程"}</DashboardLink>}
          {templateId&&time&&<button type="button" onClick={()=>setEditingPosition(true)} className="min-h-11 text-primary-700">更換時間／老師／教室</button>}
          {repairTargets.map(target=>{const repair=repairLinks[target!];return <DashboardLink key={target} href={repair.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{repair.label}</DashboardLink>;})}
          <button type="button" onClick={refresh} className="min-h-11 text-primary-700">重新檢查</button>
        </div>
      </div>}
      {(!time||editingPosition)&&!!slots?.length&&<div aria-label="可排時段" className="grid grid-cols-3 gap-2 sm:grid-cols-4">{times.map(slotTime=><button key={slotTime} type="button" className={`min-h-11 rounded-xl border px-2 ${slotTime===time?"border-primary-700 bg-primary-50 text-primary-900":"border-earth-200"}`} onClick={()=>{setTime(slotTime);setCoachId(seed?.coachId??"");setPair(null);}}>{slotTime}</button>)}</div>}
      {!time&&checkedAgain&&!!slots?.length&&<p role="status">請選時段</p>}
      {time&&templateId&&teacherIds.length>0&&<section aria-label="合格老師與可用教室" className="space-y-2">
        <strong>老師</strong>
        {seed?.coachId&&!teacherIds.includes(seed.coachId)&&<p className="text-amber-800">原選老師此時段無法授課</p>}
        {teacherIds.length===1&&(!coachId||teacherIds.includes(coachId))?<p className="rounded-lg bg-earth-50 px-3 py-2">{coaches.find(c=>c.id===teacherIds[0])?.displayName}</p>:<div className="grid grid-cols-2 gap-2">{teacherIds.map(id=><button key={id} type="button" aria-pressed={selectedCoachId===id} className={`min-h-11 rounded-xl border px-3 text-left ${selectedCoachId===id?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>{setCoachId(id);setTeacherEdited(true);setPair(null);}}>{coaches.find(c=>c.id===id)?.displayName}</button>)}</div>}

      </section>}
        {selectedCoachId&&!roomId&&validRooms.length>1&&<div aria-label="老師可用教室" className="grid grid-cols-2 gap-2">{validRooms.map(option=><button key={option.roomId} type="button" aria-pressed={selectedPair?.roomId===option.roomId} className={`min-h-11 rounded-xl border px-3 text-left ${selectedPair?.roomId===option.roomId?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>{setPair(option);if(option.fixedOrigin)setRepeat(false);}}>{rooms.find(r=>r.id===option.roomId)?.name}</button>)}</div>}
      {templateId&&<CourseScheduleLearners templateId={templateId} pointCost={1} capacity={capacity} occurrenceCount={includedDates.length} canCreateCustomer={canCreateCustomer} trialMode={isTrial} value={learners} onChange={setLearners} onValidityChange={setLearnersValid} onDraftChange={setEnrollmentDirty} onPendingChange={setEnrollmentPending} disabled={pending}/>}
      {!isTrial&&templateId&&<label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={repeat} disabled={!!selectedPair?.fixedOrigin} onChange={e=>setRepeat(e.target.checked)}/>每週重複</label>}
      {!isTrial&&repeat&&<div className="flex flex-wrap items-center gap-2"><label>共 <input aria-label="重複堂數" type="number" min="1" max="53" value={repeatCount} className="min-h-11 w-20 rounded-lg border px-2" onChange={e=>setRepeatCount(Number(e.target.value))}/> 堂</label>{[4,8].map(n=><button type="button" key={n} className="min-h-11 rounded-lg border px-3" onClick={()=>setRepeatCount(n)}>{n} 堂</button>)}<div className="flex w-full flex-wrap gap-2">{repeatDates.map(day=><label key={day} className="flex min-h-11 items-center gap-2 rounded-lg border px-2"><input type="checkbox" checked={!excludedDates.includes(day)} onChange={e=>{setExcludedDates(rows=>e.target.checked?rows.filter(d=>d!==day):[...rows,day]);setConflicts([]);setError("");}}/>{day}</label>)}</div><p className="w-full text-earth-600">本次排 {includedDates.length} 堂</p></div>}
      {conflicts.length>0&&<ul aria-label="排課衝突日期" className="space-y-1 text-red-700">{conflicts.map((issue,i)=><li key={i}>{issue.date} · {issue.reason}</li>)}</ul>}
      {error&&<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
    </div>
    <footer className="shrink-0 border-t border-earth-100 bg-white pt-3">
      {saveReason&&!noSlot&&templateId&&<p role="status" className="mb-2 text-earth-600">{saveReason}</p>}
      <button type="button" disabled={pending||enrollmentPending||noSlot||!selectedPair||!!saveReason||learners.length>capacity||!Number.isInteger(repeatCount)||repeatCount<1||repeatCount>53||!includedDates.length} onClick={create} className="min-h-11 w-full rounded-xl bg-primary-700 px-4 font-medium text-white disabled:opacity-50">{pending?"儲存中…":isTrial?"儲存體驗":"儲存排課"}</button>
    </footer>
  </fieldset>;
}
