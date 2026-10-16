"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { CourseScheduleLearners, type ScheduleLearner } from "@/components/admin/course-schedule-learners";
import { addTaiwanDuration, formatTWDateTime, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import { buildFixedScheduleDates } from "@/lib/course-fixed-schedule";
import { getMusicSlotMatches, type MusicSlotMatch } from "@/server/actions/course-slot-matches";
import { inspectCourseSchedule } from "@/server/actions/course-schedule-check";
import { createCourseSchedule } from "@/server/actions/course";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import {getMusicScheduleRooms} from "@/server/actions/music-schedule-rooms";
import {MusicTrialLearners} from "@/components/admin/music-trial-learners";
import {musicTeachingKey} from "@/lib/music-teaching-item";
import { courseTemplateLabel } from "@/lib/course-template-presentation";
import { isMusicTrialTemplate } from "@/lib/music-trial-template";

type Template = { id:string; name:string; displayName?:string; durationMinutes:number; capacity:number; defaultRoomId:string|null; musicSubjectId?:string|null; musicSubject?:{id:string;name:string;isActive:boolean}|null; classType?:string|null; musicTrialMode?:string|null; musicScheduleMode?:string|null; isActive?:boolean; visibility?:string|null; category?:string|null };
type Position = {date:string;time:string;roomId?:string;coachId?:string;durationMinutes:number};
type Arrangement = "fixed"|"single"|"trial"|"rental";
function schedulingLabel(template:Template) {
  const name=courseTemplateLabel(template);
  const subject=template.musicSubject?.name;
  return subject&&!name.startsWith(subject)?`${subject} · ${name}`:name;
}
const field="mt-1 min-h-11 w-full max-w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-base";

export function MusicScheduleWizard({autoRoom=false,subjects,templates,rooms,coaches,initialDate,seed,requestKey,sourceSessionId,initialTemplateId,onCreated,onGuard,onRefresh,isTrial=false,canCreateCustomer=false,onPositionChange,initialScheduleKind,onArrangementChange,onCancel,active=true}:{
  autoRoom?:boolean;subjects?:{id:string;name:string;isActive:boolean;category?:string}[];active?:boolean;templates:Template[];rooms:{id:string;name:string}[];coaches:{id:string;displayName:string}[];initialDate:string;requestKey:string;sourceSessionId?:string;initialTemplateId?:string;
  seed?:Partial<Position>;onCreated:(sessionId:string,date:string,sessions:unknown[])=>void;onGuard?:(dirty:boolean,pending:boolean)=>void;
  onPositionChange?:(position:Position)=>void;onRefresh?:()=>void;isTrial?:boolean;canCreateCustomer?:boolean;initialScheduleKind?:"FIXED"|"SINGLE";
  onArrangementChange?:(kind:Arrangement)=>void;onCancel?:()=>void;
}) {
  const scrollArea=useRef<HTMLDivElement>(null);
  const submitLock=useRef(false);
  useEffect(()=>{if(active&&scrollArea.current)scrollArea.current.scrollTop=0;},[active,isTrial,initialScheduleKind]);
  const [originalPosition]=useState(()=>({date:initialDate,time:seed?.time??"",roomId:seed?.roomId??"",coachId:seed?.coachId??"",durationMinutes:seed?.durationMinutes??60}));
  const [date,setDate]=useState(originalPosition.date);
  const [time,setTime]=useState(originalPosition.time);
  const [roomId,setRoomId]=useState(originalPosition.roomId);
  const [coachId,setCoachId]=useState(originalPosition.coachId);
  const [duration,setDuration]=useState(originalPosition.durationMinutes);
  const [enrollmentMode,setEnrollmentMode]=useState<"ASSIGNED"|"OPEN">("ASSIGNED");
  // Trial and regular course drafts survive type switches independently.
  const [regularTemplateId,setRegularTemplateId]=useState(initialTemplateId??"");
  const [trialTemplateId,setTrialTemplateId]=useState("");
  const templateId=isTrial?trialTemplateId:regularTemplateId;
  const setTemplateId=isTrial?setTrialTemplateId:setRegularTemplateId;
  const [regularLearners,setRegularLearners]=useState<ScheduleLearner[]>([]);
  const [trialLearners,setTrialLearners]=useState<ScheduleLearner[]>([{customerId:`trial-draft:${crypto.randomUUID()}`,cardId:"",name:"",participantPhone:""}]);
  const learners=isTrial?trialLearners:regularLearners;
  const setLearners=isTrial?setTrialLearners:setRegularLearners;
  const roomEdited=useRef(false);
  const [roomMessage,setRoomMessage]=useState<{key:string;message:string}|null>(null);
  const roomReader=usePanelReader("music-available-rooms",getMusicScheduleRooms,"",0);
  useEffect(()=>{if(!autoRoom||roomEdited.current||!parseTaipeiDateTime(date,time))return;let current=true;const key=`${date}:${time}:${duration}`;roomReader.read({date,time,durationMinutes:duration}).then(result=>{if(!current||roomEdited.current)return;if(result.success){setRoomId(old=>result.roomIds.includes(old)?old:result.roomIds[0]??"");setRoomMessage({key,message:result.roomIds.length?"":"此時段沒有可用教室，請調整時間"});}else setRoomMessage({key,message:result.error??"可用教室讀取失敗"});}).catch(()=>{if(current)setRoomMessage({key,message:"可用教室讀取失敗，請手動選擇後確認衝突"});});return()=>{current=false;};},[autoRoom,date,time,duration,roomReader]);
  const [capacity,setCapacity]=useState(1);
  const [frequency,setFrequency]=useState<"WEEKLY"|"BIWEEKLY">("WEEKLY");
  const [singleWeeks,setSingleWeeks]=useState(1);
  const [enrollmentDirty,setEnrollmentDirty]=useState(false);
  const [enrollmentPending,setEnrollmentPending]=useState(false);
  const [learnersValid,setLearnersValid]=useState(true);
  const [slots,setSlots]=useState<MusicSlotMatch[]|null>(null);
  const [slotError,setSlotError]=useState("");
  const [unavailableReason,setUnavailableReason]=useState("");
  const [fixTarget,setFixTarget]=useState<"hours"|"teacher"|"room"|undefined>();
  const [conflicts,setConflicts]=useState<{date:string;reason:string}[]>([]);
  const [checkPending,setCheckPending]=useState(false);
  const [checkError,setCheckError]=useState("");
  const [error,setError]=useState("");
  const [reload,setReload]=useState(0);
  const [pending,startTransition]=useTransition();
  const [scheduleKind,setScheduleKind]=useState<"FIXED"|"SINGLE">(initialScheduleKind??"SINGLE");
  useEffect(()=>{if(initialScheduleKind)setScheduleKind(initialScheduleKind);},[initialScheduleKind]);
  const repeat=!isTrial&&scheduleKind==="FIXED";
  const eligibleTemplates=subjects?subjects.filter(subject=>subject.isActive).map(subject=>({id:musicTeachingKey(subject.id,isTrial),name:subject.name,durationMinutes:60,capacity:500,defaultRoomId:null,musicSubjectId:subject.id,musicSubject:subject})):templates.filter(t=>t.isActive!==false&&t.visibility!=="OFF"&&!!t.musicSubjectId&&t.musicSubject?.isActive===true&&(isTrial?isMusicTrialTemplate(t):!isMusicTrialTemplate(t)));
  const template=eligibleTemplates.find(t=>t.id===templateId);
  const hasTemplate=!!template;
  const effectiveCapacity=enrollmentMode==="ASSIGNED"?Math.max(1,learners.length):capacity;
  const submittedLearners=enrollmentMode==="ASSIGNED"?learners:[];
  const fixed=buildFixedScheduleDates(date,frequency);
  const weeksValid=Number.isInteger(singleWeeks)&&singleWeeks>=1&&singleWeeks<=53;
  const dateValid=!!parseTaipeiDateTime(date,"00:00");
  const dates=!dateValid?[]:repeat?fixed.dates.slice(0,4):isTrial?[date]:weeksValid?Array.from({length:singleWeeks},(_,index)=>addTaiwanDuration(date,index*7,"DAY")):[];
  const startsAt=parseTaipeiDateTime(date,time);
  const endsAt=startsAt?new Date(startsAt.getTime()+duration*60_000):null;
  const endLabel=endsAt?`${formatTWDateTime(endsAt).slice(11)}${toLocalDateStr(endsAt)!==date?"（隔日）":""}`:"";
  const weekday=startsAt?new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",weekday:"long"}).format(startsAt):"";
  const positionReady=!!parseTaipeiDateTime(date,time)&&!!roomId;
  const canChooseCourse=positionReady&&(isTrial||enrollmentMode==="OPEN"||learners.length>0);
  const dirty=date!==originalPosition.date||time!==originalPosition.time||roomId!==originalPosition.roomId||coachId!==originalPosition.coachId||duration!==originalPosition.durationMinutes||regularTemplateId!==(initialTemplateId??"")||!!trialTemplateId||regularLearners.length>0||trialLearners.some(row=>!!row.name||!!row.participantPhone)||enrollmentDirty||enrollmentMode!=="ASSIGNED"||capacity!==1||frequency!=="WEEKLY"||singleWeeks!==1;
  useCourseDraftGuard(false,active&&(pending||enrollmentPending));
  useEffect(()=>{onGuard?.(dirty,pending||enrollmentPending);return()=>onGuard?.(false,false);},[dirty,pending,enrollmentPending,onGuard]);
  useEffect(()=>{if(active)onPositionChange?.({date,time,roomId:roomId||undefined,coachId:coachId||undefined,durationMinutes:duration});},[active,date,time,roomId,coachId,duration,onPositionChange]);
  useEffect(()=>{if(active)return;if(seed?.date)setDate(seed.date);if(seed?.time!==undefined)setTime(seed.time);setRoomId(seed?.roomId??"");setCoachId(seed?.coachId??"");if(seed?.durationMinutes)setDuration(seed.durationMinutes);},[active,seed?.date,seed?.time,seed?.roomId,seed?.coachId,seed?.durationMinutes]);
  const slotReader=usePanelReader("music-schedule-matches",getMusicSlotMatches,"",8_000);
  useEffect(()=>{
    setSlots(null);setSlotError("");setUnavailableReason("");setFixTarget(undefined);
    if(!hasTemplate||!positionReady)return;
    let active=true;
    slotReader.read({date,templateId,durationMinutes:duration}).then(result=>{
      if(!active)return;
      if(result.success){setSlots(result.data);const unavailable=("unavailable" in result?result.unavailable?.find(slot=>slot.time===time):undefined)??("blocker" in result?result.blocker:undefined);setUnavailableReason(unavailable?.reason??"");setFixTarget(unavailable?.fixTarget);}else setSlotError(result.error??"老師讀取失敗");
    }).catch(()=>{if(active)setSlotError("老師讀取失敗，請重試");});
    return()=>{active=false;};
  },[date,templateId,hasTemplate,positionReady,duration,time,reload,slotReader]);
  const teacherIds=[...new Set(slots?.filter(slot=>slot.time===time&&slot.roomId===roomId).flatMap(slot=>slot.coachIds)??[])];
  const selectedCoachId=coachId||(teacherIds.length===1?teacherIds[0]:"");
  const datesKey=dates.join(",");
  const learnerKey=JSON.stringify(submittedLearners.map(({customerId,cardId,trialPrice})=>({customerId:customerId.startsWith("trial-draft:")?null:customerId,cardId:cardId||null,...(trialPrice!==undefined?{trialPrice}:{})})));
  useEffect(()=>{
    setConflicts([]);setCheckError("");setCheckPending(false);
    if(!hasTemplate||!positionReady||!selectedCoachId||!datesKey)return;
    let active=true;
    setCheckPending(true);
    const timer=setTimeout(async()=>{
      try{
        const dates=datesKey.split(",");
        const result=await inspectCourseSchedule({templateId,roomId,coachId:selectedCoachId,date:dates[0],additionalDates:dates.slice(1),time,durationMinutes:duration,capacity:effectiveCapacity,requestKey,isTrial,scheduleType:isTrial?"TRIAL":repeat?"FIXED":"SINGLE",scheduleFrequency:repeat?frequency:"NONE",enrollmentMode,learners:JSON.parse(learnerKey)});
        if(!active)return;
        if(result.success)setConflicts(result.issues);else setCheckError(result.error??"衝突檢查失敗");
      }catch{if(active)setCheckError("衝突檢查失敗，請重試");}finally{if(active)setCheckPending(false);}
    },120);
    return()=>{active=false;clearTimeout(timer);};
  },[templateId,hasTemplate,positionReady,selectedCoachId,roomId,time,date,datesKey,duration,effectiveCapacity,requestKey,isTrial,enrollmentMode,learnerKey,reload,repeat,frequency]);
  const saveReason=!positionReady?"請選擇時間與教室":enrollmentMode==="ASSIGNED"&&!learners.length?"請指定學員":!template?"請選擇課程":!slots?"正在確認可授課老師…":!teacherIds.includes(selectedCoachId)?fixTarget==="teacher"?unavailableReason||"請先設定老師的授課資格與可授課時間":"請選擇此時段可授課的老師":enrollmentMode==="ASSIGNED"&&!learnersValid?"請確認學員資料與個人方案":!Number.isInteger(effectiveCapacity)||effectiveCapacity<1||effectiveCapacity>500?"名額請填 1–500 人":!repeat&&!isTrial&&!weeksValid?"請填 1–53 週":repeat&&fixed.error?fixed.error:"";
  function refresh(){if(templateId)slotReader.invalidate({date,templateId,durationMinutes:duration});setReload(n=>n+1);onRefresh?.();}
  function create(){
    if(submitLock.current||saveReason||pending||enrollmentPending||checkPending||checkError||conflicts.length)return;
    submitLock.current=true;
    setError("");
    startTransition(async()=>{
      try{
        const input={templateId,sourceSessionId:templateId===initialTemplateId?sourceSessionId:undefined,scheduleType:isTrial?"TRIAL":repeat?"FIXED":"SINGLE",scheduleFrequency:repeat?frequency:"NONE",enrollmentMode,roomId,coachId:selectedCoachId,date:dates[0],additionalDates:dates.slice(1),time,durationMinutes:duration,capacity:effectiveCapacity,requestKey,isTrial,learners:submittedLearners.map(({customerId,cardId,trialPrice,name,participantPhone})=>({customerId:customerId.startsWith("trial-draft:")?null:customerId,...(customerId.startsWith("trial-draft:")?{participantKey:customerId.slice(12),customerName:name,customerPhone:participantPhone}:{}),cardId:cardId||null,...(trialPrice!==undefined?{trialPrice}:{})}))};
        const result=await createCourseSchedule(input);
        if(!result.success){setError(result.error??"排課失敗");return;}
        if(!result.data.sessionId){setError("請重新整理確認排課結果");return;}
        onCreated(result.data.sessionId,dates[0],result.data.sessions);
      }catch{setError("連線失敗，輸入已保留，請重試");}finally{submitLock.current=false;}
    });
  }
  const type=isTrial?"trial":scheduleKind==="FIXED"?"fixed":"single";
  const accent=isTrial?"border-orange-500 bg-orange-50":repeat?frequency==="BIWEEKLY"?"border-violet-500 bg-violet-50":"border-blue-500 bg-blue-50":"border-emerald-500 bg-emerald-50";
  return <div data-course-entry aria-busy={pending} inert={pending} className="flex h-full min-h-0 min-w-0 flex-col text-sm">
    <div ref={scrollArea} className="min-h-0 min-w-0 flex-1 grid content-start grid-cols-2 gap-3 overflow-y-auto overscroll-contain pb-3">
      <section aria-label="時間與教室" className="col-span-2 grid min-w-0 grid-cols-2 sm:grid-cols-4 gap-3 [&>label]:min-w-0">
        <label>日期<input aria-label="排課日期" type="date" value={date} className={field} onChange={e=>setDate(e.target.value)}/></label>
        <label>時間<input aria-label="排課時間" type="time" step={1800} value={time} className={field} onChange={e=>setTime(e.target.value)}/></label>
        <label>教室<select aria-label="排課教室" value={roomId} className={field} onChange={e=>{roomEdited.current=true;setRoomId(e.target.value);}}><option value="">請選擇教室</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <label>時長<select aria-label="時長" className={field} value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[30,60,90,120].map(n=><option key={n} value={n}>{n} 分鐘</option>)}</select></label>
      </section>
      {roomMessage?.key===`${date}:${time}:${duration}`&&roomMessage.message&&!roomId&&<p role="status" className="text-amber-800">{roomMessage.message}</p>}
      {onArrangementChange&&<label className={`block rounded-lg border-l-4 px-3 py-1 ${accent}`}>排課類型<select aria-label="安排類型" value={type} className={field} onChange={e=>onArrangementChange(e.target.value as Arrangement)}><option value="fixed">固定課</option><option value="single">單次課</option><option value="trial">體驗課</option><option value="rental">空間租借</option></select></label>}
      {repeat&&<section aria-label="固定課程設定" className="space-y-2"><label>頻率<select aria-label="固定課程頻率" className={field} value={frequency} onChange={e=>setFrequency(e.target.value as "WEEKLY"|"BIWEEKLY")}><option value="WEEKLY">每週</option><option value="BIWEEKLY">隔週</option></select></label><p className="text-earth-600">從 {date} 開始持續保留時段，直到取消後續。</p></section>}
      {!repeat&&!isTrial&&<label className="block">安排週數<input aria-label="單次課安排週數" type="number" min={1} max={53} value={singleWeeks} className={field} onChange={e=>setSingleWeeks(Number(e.target.value))}/></label>}
      {positionReady&&<section aria-label="學員安排方式" className="space-y-2"><strong>學員安排</strong><div className="flex flex-wrap gap-3">{([["ASSIGNED","指定學員"],["OPEN","開放報名"]] as const).map(([mode,label])=><label key={mode} className="flex min-h-11 items-center gap-2"><input type="radio" name={`enrollment-${requestKey}`} checked={enrollmentMode===mode} onChange={()=>setEnrollmentMode(mode)}/>{label}</label>)}</div></section>}
      {positionReady&&isTrial&&enrollmentMode==="ASSIGNED"&&<MusicTrialLearners templateId={templateId} value={learners} onChange={setLearners} onValidityChange={setLearnersValid} disabled={pending}/>}
      {positionReady&&!isTrial&&<div className={enrollmentMode==="ASSIGNED"?"col-span-2 max-h-48 overflow-y-auto overscroll-contain":"hidden"}><CourseScheduleLearners templateId={templateId} scheduleDate={date} pointCost={1} capacity={500} showCapacity={false} useConfiguredTrialPrice allowDeferred={!isTrial} occurrenceCount={repeat?1:dates.length} canCreateCustomer={canCreateCustomer} trialMode={isTrial} value={learners} onChange={setLearners} onValidityChange={setLearnersValid} onDraftChange={setEnrollmentDirty} onPendingChange={setEnrollmentPending} disabled={pending}/></div>}
      {canChooseCourse&&<label className="block">課程<select aria-label="課程" className={field} value={templateId} onChange={e=>{setTemplateId(e.target.value);const next=eligibleTemplates.find(item=>item.id===e.target.value);if(isTrial&&next)setDuration(next.durationMinutes);}}><option value="">請選擇課程</option>{eligibleTemplates.map(item=><option key={item.id} value={item.id}>{schedulingLabel(item)}</option>)}</select>{!eligibleTemplates.length&&<span className="block py-2">{isTrial?"尚無可安排的體驗課，請確認課程已啟用體驗與上架。":"尚無可安排的課程，請確認教學項目已啟用、課程已上架。"}<a className="inline-flex min-h-11 items-center underline" href="/dashboard/courses?view=catalog" target="_blank" rel="noopener noreferrer">開啟課程與教學項目設定</a></span>}</label>}
      {canChooseCourse&&template&&<section aria-label="合格老師與可用教室"><label>可教這門課的老師<select aria-label="授課老師" className={field} value={selectedCoachId} onChange={e=>setCoachId(e.target.value)}><option value="">請選擇老師</option>{coachId&&!teacherIds.includes(coachId)&&<option value={coachId} disabled>{coaches.find(c=>c.id===coachId)?.displayName??"原選老師"}（此時段不可安排）</option>}{teacherIds.map(id=><option key={id} value={id}>{coaches.find(c=>c.id===id)?.displayName??"老師"}</option>)}</select></label>{!slots&&!slotError&&<p role="status" className="py-2 text-earth-600">正在確認可授課老師，其他欄位仍可操作…</p>}{slots&&!teacherIds.length&&<p role="status" className="py-2 text-amber-800">{date} · {unavailableReason||"此課程在所選時段與教室沒有可授課老師，請調整時間、教室或課程。"}{fixTarget==="teacher"&&<a className="flex min-h-11 items-center underline" href="/dashboard/teachers" target="_blank" rel="noopener noreferrer">設定老師授課資格與可授課時間</a>}</p>}</section>}
      {canChooseCourse&&template&&isTrial&&<p role="status" className="text-earth-600">體驗費用依所選課程設定；每位學員個別計費。</p>}
      {canChooseCourse&&template&&enrollmentMode==="OPEN"&&<label className="block">名額<input aria-label="名額" className={field} type="number" min={1} max={500} value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>}
      {template&&positionReady&&<details aria-label="新增前確認" className="col-span-2 rounded-lg bg-earth-50 px-3 py-1 text-earth-700">
        <summary className="min-h-11 cursor-pointer content-center">安排摘要 · {repeat ? (frequency === "BIWEEKLY" ? "隔週" : "每週") : `${dates.length} 次`} · {enrollmentMode === "ASSIGNED" ? `${learners.length} 位學員` : `${capacity} 個名額`}</summary>
        <p className="break-words">{schedulingLabel(template)} · {rooms.find(room=>room.id===roomId)?.name} · {coaches.find(coach=>coach.id===selectedCoachId)?.displayName??"尚未選老師"}</p>
        <p>{date} {weekday} {time}–{endLabel}</p>
        <p>{repeat?`${frequency==="BIWEEKLY"?"每隔一週":"每週"}・持續至取消後續`:`共 ${dates.length} 次` } · {enrollmentMode==="ASSIGNED"?`指定 ${learners.length} 位學員，各自使用個人方案或繳費`:`開放報名 ${capacity} 人`}</p>
        {!repeat&&dates.length>1&&<details><summary className="min-h-11 cursor-pointer">查看安排日期（每週同一天、同時間）</summary><ul className="grid grid-cols-2 gap-1">{dates.map(day=><li key={day}>{day}</li>)}</ul></details>}
      </details>}
      {(slotError||checkError)&&<p role="alert" className="col-span-2 text-red-700">{slotError||checkError}<button type="button" className="ml-2 min-h-11 underline" onClick={refresh}>重試</button></p>}
      {checkPending&&<p role="status" className="text-earth-600">正在確認各日期的衝突…</p>}
      {conflicts.length>0&&<section aria-label="排課衝突日期" className="col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800"><strong>請調整以下日期，尚未建立</strong><ul className="mt-1 space-y-1">{conflicts.map((issue,index)=><li key={`${issue.date}:${index}`}>{issue.date} · {issue.reason}</li>)}</ul></section>}
      {error&&<p role="alert" className="col-span-2 text-red-700">{error}</p>}
    </div>
    <footer className="shrink-0 border-t border-earth-100 bg-white pt-3">
      {saveReason&&<p role="status" className="mb-2 text-earth-600">下一步：{saveReason}</p>}
      <div className="flex justify-end gap-2">{onCancel&&<button type="button" className="min-h-11 rounded-lg border px-4" disabled={enrollmentPending} onClick={onCancel}>取消</button>}<button type="button" disabled={pending||enrollmentPending||checkPending||!!checkError||!!saveReason||conflicts.length>0} onClick={create} className={`min-h-11 rounded-lg px-6 font-medium text-white disabled:opacity-50 ${isTrial?"bg-orange-600":repeat?frequency==="BIWEEKLY"?"bg-violet-700":"bg-blue-700":"bg-emerald-700"}`}>{pending?"新增中…":"新增"}</button></div>
    </footer>
  </div>;
}
