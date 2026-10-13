"use client";

import { useEffect, useState, useTransition } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import {CourseScheduleLearners,type ScheduleLearner} from "@/components/admin/course-schedule-learners";
import { parseTaipeiDateTime, formatTWDateTime } from "@/lib/date-utils";
import { buildFixedScheduleDates } from "@/lib/course-fixed-schedule";
import { getMusicSlotMatches, type MusicSlotMatch, type MusicUnavailableSlot } from "@/server/actions/course-slot-matches";
import { inspectCourseSchedule } from "@/server/actions/course-schedule-check";
import { createCourseSchedule } from "@/server/actions/course";
import { DashboardLink } from "@/components/dashboard-link";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { isMusicTrialTemplate } from "@/lib/music-trial-template";

type Template = { musicSubjectId?:string|null;musicSubject?:{id:string;name:string;isActive:boolean}|null; id:string; name:string; durationMinutes:number; capacity:number; classType?:string|null; musicTrialMode?:string|null; musicTermLessons?:number|null; musicScheduleMode?:string|null; defaultRoomId:string|null;isActive?:boolean;visibility?:string|null };
type Room = { id:string; name:string };
type Coach = { id:string; displayName:string };
function musicCourseOptionLabel(template:Template){
  if(!template.musicSubject)return template.name;
  const classLabel=template.classType==="PRIVATE"?"個別課":template.classType==="SELF_ORGANIZED"?"自組班":template.classType==="GROUP"?"團體班":"";
  return `${template.musicSubject.name}${classLabel?` · ${classLabel}`:""}`;
}

export function MusicScheduleWizard({templates,rooms,coaches,initialDate,seed,requestKey,sourceSessionId,initialTemplateId,onCreated,onGuard,onRefresh,isTrial=false,canCreateCustomer=false,onPositionChange,initialScheduleKind}:{
  templates:Template[];rooms:Room[];coaches:Coach[];initialDate:string;requestKey:string;sourceSessionId?:string;initialTemplateId?:string;
  seed?:{date?:string;time?:string;roomId?:string;coachId?:string;durationMinutes?:number};
  onCreated:(sessionId:string,date:string,sessions:unknown[])=>void;
  onGuard?:(dirty:boolean,pending:boolean)=>void;
  onPositionChange?:(position:{date:string;time:string;roomId?:string;coachId?:string;durationMinutes:number})=>void;
  onRefresh?:()=>void; isTrial?:boolean; canCreateCustomer?:boolean; initialScheduleKind? : "FIXED"|"SINGLE";
}) {
  const workflow=seed?.time?"time":"course";
  const [originalPosition]=useState(()=>({date:initialDate,time:seed?.time??"",roomId:seed?.roomId??""}));
  const eligibleTemplates=templates.filter(t=>(t.isActive!==false&&t.visibility!=="OFF"&&t.musicSubject?.isActive!==false)&&(isTrial?isMusicTrialTemplate(t):!isMusicTrialTemplate(t)));
  const defaultTemplate=eligibleTemplates.find(t=>t.id===initialTemplateId)??eligibleTemplates[0];
  const [templateId,setTemplateId]=useState(defaultTemplate?.id ?? "");
  const template=eligibleTemplates.find(t=>t.id===templateId);
  const [capacity,setCapacity]=useState(defaultTemplate?.capacity??1);
  function chooseTemplate(id:string){setTemplateId(id);const t=templates.find(t=>t.id===id);setCapacity(t?.capacity??1);resetSlot();}

  const [duration,setDuration]=useState<30|60|90|120>(60);
  const [date,setDate]=useState(initialDate);
  const [slots,setSlots]=useState<MusicSlotMatch[]|null>(null);
  const [blocker,setBlocker]=useState<Omit<MusicUnavailableSlot,"time">>();
  const [unavailable,setUnavailable]=useState<MusicUnavailableSlot[]>([]);
  const [roomId,setRoomId]=useState(seed?.roomId??"");
  const [editingPosition,setEditingPosition]=useState(false);
  const [time,setTime]=useState(seed?.time ?? "");
  const [coachId,setCoachId]=useState(seed?.coachId ?? "");
  const [teacherEdited,setTeacherEdited]=useState(false);
  const [learners,setLearners]=useState<ScheduleLearner[]>([]);
  const [enrollmentDirty,setEnrollmentDirty]=useState(false);
  const [enrollmentPending,setEnrollmentPending]=useState(false);
  const [learnersValid,setLearnersValid]=useState(true);
  const [pair,setPair]=useState<{roomId:string;coachId:string}|null>(null);
  const [conflicts,setConflicts]=useState<{date:string;reason:string}[]>([]);
  const [scheduleKind,setScheduleKind]=useState<"FIXED"|"SINGLE">(initialScheduleKind??(template?.musicScheduleMode==="FIXED"?"FIXED":"SINGLE"));
  const [frequency,setFrequency]=useState<"WEEKLY"|"BIWEEKLY">("WEEKLY");
  const [validUntil,setValidUntil]=useState("");
  const [conflictCheckPending,setConflictCheckPending]=useState(false);
  const [conflictCheckError,setConflictCheckError]=useState("");
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  const [checkedAgain,setCheckedAgain]=useState(false);
  const [reload,setReload]=useState(0);
  const [selectedPurpose,setSelectedPurpose]=useState(isTrial);
  useEffect(()=>{
    if(selectedPurpose===isTrial)return;
    setSelectedPurpose(isTrial);
    const next=eligibleTemplates[0];
    setTemplateId(next?.id??"");setCapacity(next?.capacity??1);setSlots(null);setPair(null);
    setValidUntil("");setConflicts([]);setLearners([]);setTime(seed?.time??"");setRoomId(seed?.roomId??"");
  },[eligibleTemplates,isTrial,seed?.roomId,seed?.time,selectedPurpose]);
  useEffect(()=>{if(initialScheduleKind)setScheduleKind(initialScheduleKind);},[initialScheduleKind]);
  const initialTemplate=templates.find(t=>t.id===(initialTemplateId??templates[0]?.id));
  const initialDuration=60;
  const repeat=scheduleKind==="FIXED"&&!isTrial;
  const derivedInitialScheduleKind: "FIXED"|"SINGLE"=isTrial?"SINGLE":initialTemplate?.musicScheduleMode==="FIXED"?"FIXED":"SINGLE";
  const dirty=time!==originalPosition.time || roomId!==originalPosition.roomId || teacherEdited || date!==originalPosition.date || templateId!==(initialTemplateId??templates[0]?.id??"") || capacity!==(initialTemplate?.capacity??1) || duration!==initialDuration || scheduleKind!==(initialScheduleKind??derivedInitialScheduleKind) || frequency!=="WEEKLY" || validUntil!=="" || enrollmentDirty || learners.length>0;
  useCourseDraftGuard(dirty,pending);
  useEffect(()=>{onGuard?.(dirty,pending||enrollmentPending);return()=>onGuard?.(false,false);},[dirty,pending,enrollmentPending,onGuard]);
  function resetSlot(){setCheckedAgain(false);setSlots(null);setBlocker(undefined);setUnavailable([]);setPair(null);setError("");setConflicts([]);}
  const slotReader=usePanelReader("music-schedule-matches",getMusicSlotMatches,"",8_000);
  const alternateTemplate=templates.find(item=>isMusicTrialTemplate(item)!==isTrial&&item.isActive!==false&&item.visibility!=="OFF"&&item.musicSubject?.isActive!==false);
  useEffect(()=>{if(alternateTemplate&&date)void slotReader.prefetch({date,templateId:alternateTemplate.id,durationMinutes:duration});},[alternateTemplate,date,duration,slotReader]);
  useEffect(()=>{
    if(!templateId || !date) return;
    let active=true;
    slotReader.read({date,templateId,durationMinutes:duration}).then(result=>{
      if(!active)return;
      if(result.success){
        setBlocker("blocker" in result?result.blocker:undefined);setSlots(result.data);setUnavailable("unavailable" in result ? result.unavailable??[] : []);}
      else setError(result.error ?? "空位讀取失敗");
    }).catch(()=>{if(active)setError("空位讀取失敗，請重新選擇日期");});
    return()=>{active=false;};
  },[date,templateId,duration,reload,template?.musicScheduleMode,slotReader]);
  function refresh(){slotReader.invalidate({date,templateId,durationMinutes:duration});resetSlot();setCheckedAgain(true);setReload(value=>value+1);onRefresh?.();}
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
  const draftPair=selectedPair??(roomId&&selectedCoachId?{roomId,coachId:selectedCoachId}:null);
  useEffect(()=>{onPositionChange?.({date,time,roomId:roomId||selectedPair?.roomId,coachId:selectedCoachId||undefined,durationMinutes:duration});},[date,time,roomId,selectedPair?.roomId,selectedCoachId,duration,onPositionChange]);
  const noSlot=!!slots && (!slots.length || (!!time&&(!pairs.length || (!!selectedCoachId&&!availableRooms.length))));
  const reason=(noSlotReason??(coachId?"原選老師此時段無法授課，請更換老師或時間":roomId?"此教室目前無法排入，請更換教室、老師或時間":"此時段沒有可用老師或教室")).replace(/尚無教師具備.*授課資格/,"尚無可授課老師");
  const start=parseTaipeiDateTime(date,time);
  const endsAt=start?new Date(start.getTime()+duration*60000):null;
  const end=endsAt?`${formatTWDateTime(endsAt).slice(0,10)!==date?"隔日 ":""}${formatTWDateTime(endsAt).slice(11)}`:"";
  const roomName=rooms.find(room=>room.id===(roomId||selectedPair?.roomId))?.name;
  const saveReason=!template?"請選課程":!date?"請選日期":!slots?"正在確認可排時段…":!time?"請選時段":!selectedPair?(noSlot?"":!selectedCoachId?"請選老師":"請選教室"):!learnersValid?"請確認學員方案與名額":template.classType&&template.classType!=="GROUP"&&!learners.length?"請加入學員":"";
  const fixedSchedule=buildFixedScheduleDates(date,frequency,validUntil||undefined);
  const includedDates=repeat?fixedSchedule.dates:[date];
  const includedDateKey=includedDates.join(",");
  const validityError=repeat?fixedSchedule.error:"";
  const learnerSignature=JSON.stringify(learners.map(({customerId,cardId})=>({customerId,cardId:cardId||null})));
  const selectedPairKey=selectedPair?`${selectedPair.roomId}:${selectedPair.coachId}`:"";
  const hasTemplate=!!template;
  useEffect(()=>{
    if(!hasTemplate||!selectedPairKey||!time||validityError){setConflicts([]);setConflictCheckPending(false);setConflictCheckError("");return;}
    let active=true;
    const timer=setTimeout(async()=>{
      setConflictCheckPending(true);
      try{
        const [roomId,coachId]=selectedPairKey.split(":");
        const dates=includedDateKey.split(",").filter(Boolean);
        const result=await inspectCourseSchedule({templateId,roomId,coachId,date:dates[0],additionalDates:repeat?dates.slice(1):undefined,time,durationMinutes:duration,capacity:workflow==="time"?Math.max(1,learners.length):capacity,requestKey,isTrial,learners:JSON.parse(learnerSignature)});
        if(!active)return;
        setConflicts(result.success?result.issues:[]);
        setConflictCheckError(result.success?"":result.error??"時段檢查失敗，請重試");
      }catch{
        if(!active)return;
        setConflicts([]);setConflictCheckError("時段檢查失敗，請重試");
      }finally{if(active)setConflictCheckPending(false);}
    },120);
    return()=>{active=false;clearTimeout(timer);};
  },[templateId,hasTemplate,selectedPairKey,date,includedDateKey,time,duration,capacity,workflow,requestKey,isTrial,repeat,learnerSignature,learners.length,validityError]);
  function create(){
    if(!template || !selectedPair || !time || pending || enrollmentPending || !learnersValid || validityError || !includedDates.length)return;
    if(!Number.isInteger(capacity)||capacity<1||capacity>500){setError("人數上限請填 1–500 人");return;}
    setError("");
    startTransition(async()=>{
      try{
        const input={
          templateId,scheduleType:isTrial?"TRIAL":repeat?"FIXED":"SINGLE",scheduleFrequency:repeat?frequency:"NONE",sourceSessionId:templateId===initialTemplateId?sourceSessionId:undefined,roomId:selectedPair.roomId,coachId:selectedPair.coachId,time,
          durationMinutes:duration,capacity:workflow==="time"?Math.max(1,learners.length):capacity,
          date:includedDates[0],additionalDates:repeat?includedDates.slice(1):undefined,fixedUntil:repeat&&validUntil?validUntil:undefined,
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
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-2">
      {time && <p aria-label="已選排課位置" className="rounded-lg bg-earth-50 px-3 py-2">{date} · {time}{end?`–${end}`:""} · {roomName??"教室待選"}{coachId?` · ${coaches.find(c=>c.id===coachId)?.displayName??"老師待確認"}`:""}<button type="button" className="ml-2 min-h-11 text-primary-700" onClick={()=>setEditingPosition(v=>!v)}>{editingPosition?"收合":"修改"}</button></p>}
      {editingPosition&&<div className="grid grid-cols-2 gap-3"><label>日期<input aria-label="排課日期" type="date" value={date} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setDate(e.target.value);resetSlot();}}/></label><label>時間<input aria-label="排課時間" type="time" step={1800} value={time} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setTime(e.target.value);setPair(null);}}/></label><label>教室<select aria-label="排課教室" value={roomId} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setRoomId(e.target.value);setPair(null);}}><option value="">選擇可用教室</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>老師<select aria-label="更換排課老師" value={coachId} className="min-h-11 w-full rounded-lg border px-2" onChange={e=>{setCoachId(e.target.value);setTeacherEdited(true);setPair(null);}}><option value="">選擇可用老師</option>{coaches.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label></div>}
      {eligibleTemplates.length>0&&<label className="block">課程<select aria-label="課程" className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 bg-white px-3" value={templateId} onChange={e=>chooseTemplate(e.target.value)}>{eligibleTemplates.map(t=><option key={t.id} value={t.id}>{musicCourseOptionLabel(t)}</option>)}</select></label>}
      {eligibleTemplates.length>0&&<div className="grid grid-cols-2 gap-2">
        <label>時長<select aria-label="時長" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-2" value={duration} onChange={e=>{setDuration(Number(e.target.value) as 30|60|90|120);resetSlot();}}>{[30,60,90,120].map(n=><option key={n} value={n}>{n} 分鐘</option>)}</select></label>
        {workflow==="course"&&<label>名額<input aria-label="名額" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-2" type="number" min="1" max="500" value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>}
      </div>}
      {!time&&<label className="block">日期<input aria-label="找空位日期" className="mt-1 min-h-11 w-full rounded-xl border border-earth-200 px-3" type="date" value={date} onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>}
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
      {time&&templateId&&(teacherIds.length>0||!!coachId)&&<section aria-label="合格老師與可用教室" className="space-y-2">
        <strong>可教這門課的老師</strong>
        {!slots&&coachId&&<p className="rounded-lg bg-earth-50 px-3 py-2">{coaches.find(c=>c.id===coachId)?.displayName??"原選老師"}</p>}
        {seed?.coachId&&!teacherIds.includes(seed.coachId)&&<p className="text-amber-800">原選老師此時段無法授課</p>}
        {!!teacherIds.length&&(teacherIds.length===1&&(!coachId||teacherIds.includes(coachId))?<p className="mt-1 rounded-lg bg-earth-50 px-3 py-2">{coaches.find(c=>c.id===teacherIds[0])?.displayName}</p>:<select aria-label="授課老師" className="mt-1 min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3" value={selectedCoachId} onChange={e=>{setCoachId(e.target.value);setTeacherEdited(true);setPair(null);}}><option value="">請選擇老師</option>{teacherIds.map(id=><option key={id} value={id}>{coaches.find(c=>c.id===id)?.displayName??"老師"}</option>)}</select>)}

      </section>}
      {selectedCoachId&&!roomId&&validRooms.length>1&&<label className="block font-medium">教室<select aria-label="排課教室" className="mt-1 min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3" value={selectedPair?.roomId??""} onChange={e=>setPair(validRooms.find(option=>option.roomId===e.target.value)??null)}><option value="">請選擇教室</option>{validRooms.map(option=><option key={option.roomId} value={option.roomId}>{rooms.find(r=>r.id===option.roomId)?.name??"教室"}</option>)}</select></label>}
      {!slots&&!!templateId&&<p role="status" className="text-xs text-earth-500">{time?"正在確認這個時段可授課的老師…":"正在讀取可排時段…"}</p>}
      {!isTrial&&scheduleKind==="FIXED"&&draftPair&&templateId&&<section aria-label="固定課程設定" className="grid grid-cols-2 gap-2 rounded-lg border border-earth-200 p-2">
        {repeat&&<div className="grid gap-3 sm:grid-cols-2">
          <label>頻率<select aria-label="固定課程頻率" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3" value={frequency} onChange={e=>{setFrequency(e.target.value as "WEEKLY"|"BIWEEKLY");setConflicts([]);}}><option value="WEEKLY">每週</option><option value="BIWEEKLY">隔週</option></select></label>
          <label>開始日期<input aria-label="固定課程開始日期" type="date" value={date} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3" onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>
          <label className="sm:col-span-2">有效期限（選填）<input aria-label="固定課程有效期限" type="date" min={date} value={validUntil} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3" onChange={e=>{setValidUntil(e.target.value);setConflicts([]);}}/></label>
          {!validUntil&&<p className="text-xs text-earth-500 sm:col-span-2">固定時段會持續保留；課表先顯示至 {fixedSchedule.lastSupportedDate}，取消後續才釋出。</p>}
          {validityError&&<p role="alert" className="text-red-700 sm:col-span-2">{validityError}</p>}
          <p className="text-earth-600 sm:col-span-2">將安排 {includedDates.length} 次，日期從 {date} 開始。</p>
        </div>}
      </section>}
      {isTrial&&<div aria-label="體驗課類型" className="rounded-lg border-l-4 border-orange-500 bg-orange-50 px-3 py-2 font-medium text-orange-900">體驗課</div>}
      {draftPair&&templateId&&<CourseScheduleLearners templateId={templateId} pointCost={1} capacity={capacity} occurrenceCount={includedDates.length} canCreateCustomer={canCreateCustomer} trialMode={isTrial} value={learners} onChange={setLearners} onValidityChange={setLearnersValid} onDraftChange={setEnrollmentDirty} onPendingChange={setEnrollmentPending} disabled={pending}/>}
      {conflictCheckPending&&selectedPair&&<p role="status" className="text-xs text-earth-500">正在確認排課時段…</p>}
      {conflictCheckError&&<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{conflictCheckError}</p>}
      {conflicts.length>0&&<section aria-label="排課衝突日期" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800"><strong>以下日期有衝突，尚未建立</strong><ul className="mt-1 space-y-1">{conflicts.map((issue,i)=><li key={i}>{issue.date} · {issue.reason}</li>)}</ul></section>}
      {error&&<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
    </div>
    <footer className="shrink-0 border-t border-earth-100 bg-white pt-3">
      {saveReason&&!noSlot&&templateId&&<p role="status" className="mb-2 text-earth-600">{saveReason}</p>}
      <button type="button" disabled={pending||enrollmentPending||conflictCheckPending||!!conflictCheckError||noSlot||!selectedPair||!!saveReason||!!validityError||conflicts.length>0||learners.length>capacity||!includedDates.length} onClick={create} className={`min-h-11 w-full rounded-xl px-4 font-medium text-white disabled:opacity-50 ${isTrial?"bg-orange-600":scheduleKind==="FIXED"?"bg-sky-700":"bg-emerald-700"}`}>{pending?"儲存中…":isTrial?"新增體驗課":scheduleKind==="FIXED"?"新增固定課程":"新增單次課程"}</button>
    </footer>
  </fieldset>;
}
