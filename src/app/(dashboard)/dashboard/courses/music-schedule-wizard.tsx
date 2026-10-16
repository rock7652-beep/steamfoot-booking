"use client";

import { useEffect, useState, useTransition } from "react";
import { courseClassPresentation } from "@/lib/course-class-presentation";
import { addTaiwanDuration } from "@/lib/date-utils";
import { getMusicSlotMatches, type MusicSlotMatch, type MusicUnavailableSlot } from "@/server/actions/course-slot-matches";
import { CourseOptionSelect } from "@/components/admin/course-option-select";
import { createCourseSchedule } from "@/server/actions/course";

type Template = { classType?:string|null;musicTrialMode?:string|null; musicSubjectId?:string|null;musicSubject?:{id:string;name:string;isActive:boolean}|null; id:string; name:string; durationMinutes:number; capacity:number; musicTermLessons?:number|null; musicScheduleMode?:string|null; defaultRoomId:string|null };
type Room = { id:string; name:string; capacity?:number|null };
type Coach = { id:string; displayName:string };

export function MusicScheduleWizard({templates,rooms,coaches,initialDate,initialTime,initialRoomId,initialCoachId,requestKey,sourceSessionId,initialTemplateId,onCreated}:{
  templates:Template[];rooms:Room[];coaches:Coach[];initialDate:string;initialTime?:string;initialRoomId?:string;initialCoachId?:string;requestKey:string;sourceSessionId?:string;initialTemplateId?:string;
  onCreated:(sessionId:string,date:string)=>void;
}) {
  const [templateId,setTemplateId]=useState(initialTemplateId ?? templates[0]?.id ?? "");
  const template=templates.find(t=>t.id===templateId);
  const subjectId=template?.musicSubjectId??templateId;
  const typeOf=(t:Template)=>t.musicTrialMode?"TRIAL":t.classType??"unset";
  const [classType,setClassType]=useState(typeOf(templates.find(t=>t.id===initialTemplateId)??templates[0]??{id:"",name:"",durationMinutes:60,capacity:1,defaultRoomId:null}));
  const typeOptions=[...new Set(templates.map(typeOf))];
  const presentation=courseClassPresentation(template?.classType,!!template?.musicTrialMode);
  const subjects=[...new Map(templates.filter(t=>typeOf(t)===classType).map(t=>[t.musicSubjectId??t.id,{id:t.musicSubjectId??t.id,name:t.musicSubject?.name??t.name}])).values()];
  const [capacity,setCapacity]=useState(templates.find(t=>t.id===(initialTemplateId??templates[0]?.id))?.capacity??1);
  function chooseTemplate(id:string){setTemplateId(id);const t=templates.find(t=>t.id===id);setCapacity(t?.capacity??1);const n=t?.durationMinutes??60;setDuration(([30,60,90,120] as number[]).includes(n)?n as 30|60|90|120:60);resetSlot();}

  const [duration,setDuration]=useState<30|60|90|120>(()=>{
    const n=templates.find(t=>t.id===(initialTemplateId ?? templates[0]?.id))?.durationMinutes ?? 60;
    return ([30,60,90,120] as number[]).includes(n) ? n as 30|60|90|120 : 60;
  });
  const [date,setDate]=useState(initialDate);
  const [slots,setSlots]=useState<MusicSlotMatch[]|null>(null);
  const [unavailable,setUnavailable]=useState<MusicUnavailableSlot[]>([]);
  const [time,setTime]=useState(initialTime??"");
  const [coachId,setCoachId]=useState(initialCoachId??"");
  const [roomId,setRoomId]=useState(initialRoomId??"");
  const [repeat,setRepeat]=useState(false);
  const [repeatCount,setRepeatCount]=useState(4);
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  function resetSlot(){setSlots(null);setUnavailable([]);setRepeat(false);setError("");}
  useEffect(()=>{
    if(!templateId || !date) return;
    let active=true;
    getMusicSlotMatches({date,templateId,durationMinutes:duration}).then(result=>{
      if(!active)return;
      if(result.success){setSlots(result.data);setUnavailable("unavailable" in result ? result.unavailable??[] : []);}
      else setError(result.error ?? "空位讀取失敗");
    }).catch(()=>{if(active)setError("空位讀取失敗，請重新選擇日期");});
    return()=>{active=false;};
  },[date,templateId,duration]);
  const times=[...new Set(slots?.map(s=>s.time) ?? [])].sort();
  const pairs=slots?.filter(s=>s.time===time).flatMap(s=>s.coachIds.map(coachId=>({roomId:s.roomId,coachId,fixedOrigin:s.fixedOriginCoachIds?.includes(coachId)??false}))) ?? [];
  const roomPairs=roomId?pairs.filter(option=>option.roomId===roomId):pairs;
  const teacherIds=[...new Set(roomPairs.map(option=>option.coachId))];
  const selectedCoachId=teacherIds.includes(coachId)?coachId:teacherIds.length===1?teacherIds[0]:"";
  const availableRooms=pairs.filter(option=>option.coachId===selectedCoachId && !(option.fixedOrigin && template?.musicScheduleMode==="FIXED") && (rooms.find(r=>r.id===option.roomId)?.capacity??capacity)>=capacity);
  const selectedRoomId=roomId || (availableRooms.length===1?availableRooms[0].roomId:"");
  const pair=availableRooms.find(r=>r.roomId===selectedRoomId)??null;
  const roomOptions=rooms.filter(r=>(r.capacity??capacity)>=capacity && pairs.some(p=>p.roomId===r.id && (!selectedCoachId || p.coachId===selectedCoachId)));
  function create(){
    if(!template || !pair || !time || pending)return;
    if(!Number.isInteger(capacity)||capacity<1||capacity>500){setError("人數上限請填 1–500 人");return;}
    if(repeat&&(!Number.isInteger(repeatCount)||repeatCount<2||repeatCount>52)){setError("連續排課請填 2–52 堂");return;}
    setError("");
    startTransition(async()=>{
      try{
        const result=await createCourseSchedule({
          templateId,sourceSessionId:templateId===initialTemplateId?sourceSessionId:undefined,roomId:pair.roomId,coachId:pair.coachId,date,time,
          durationMinutes:duration,capacity,
          repeatUntil:repeat?addTaiwanDuration(date,(repeatCount-1)*7,"DAY"):undefined,
          requestKey,
        });
        if(!result.success){setError(result.error ?? "排課失敗，請重新選擇空位");return;}
        if(!result.data.sessionId){setError("課程已建立，請重新整理課表選學員");return;}
        onCreated(result.data.sessionId,date);
      }catch{setError("連線失敗，請重試");}
    });
  }
  const selectClass="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-base";
  return <div className="space-y-3 text-sm">
    <label className="block">課程型態<select aria-label="課程型態" className={selectClass} value={classType} onChange={e=>{setClassType(e.target.value);chooseTemplate(templates.find(t=>typeOf(t)===e.target.value)?.id??"");}}>{typeOptions.map(type=><option key={type} value={type}>{courseClassPresentation(type,type==="TRIAL").label}</option>)}</select></label>
    
    <label className="block">教學項目（大類）<CourseOptionSelect label="教學項目（大類）" options={subjects.map(s=>({id:s.id,label:s.name}))} value={subjectId} onChange={id=>chooseTemplate(templates.find(t=>typeOf(t)===classType&&(t.musicSubjectId??t.id)===id)?.id??"")} required/></label>
    <p className="flex items-center gap-2 text-earth-600"><span aria-hidden="true" className={`h-3 w-3 rounded-full ${presentation.dot}`}/>{presentation.label} · {duration} 分鐘 · 上限 {capacity} 人</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="min-w-0">上課日期<input aria-label="找空位日期" className={selectClass} type="date" value={date} onChange={e=>{setDate(e.target.value);resetSlot();}}/></label>
      <label className="min-w-0">上課時間<select aria-label="上課時間" className={selectClass} disabled={!slots || !times.length} value={time} onChange={e=>{setTime(e.target.value);setRepeat(false);}}><option value="">{!slots?"核對空位中…":times.length?"請選擇時間":"沒有可排時段"}</option>{time&&!times.includes(time)&&<option value={time} disabled>{time} · 此項目無可排空位</option>}{times.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
      <label className="min-w-0">老師<select aria-label="老師" className={selectClass} disabled={!time} value={selectedCoachId} onChange={e=>{setCoachId(e.target.value);setRepeat(false);}}><option value="">{time?"請選擇老師":"先選上課時間"}</option>{teacherIds.map(id=><option key={id} value={id}>{coaches.find(c=>c.id===id)?.displayName??"老師"}</option>)}</select></label>
      <label className="min-w-0">教室<select aria-label="教室" className={selectClass} disabled={!slots || !time} value={selectedRoomId} onChange={e=>{setRoomId(e.target.value);setRepeat(false);}}><option value="">{roomOptions.length?"請選擇教室":"沒有可排教室"}</option>{roomId&&!roomOptions.some(r=>r.id===roomId)&&<option value={roomId} disabled>{rooms.find(r=>r.id===roomId)?.name??"原教室"} · 此項目無可排空位</option>}{roomOptions.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
    </div>
    {!slots&&!error&&<p role="status" className="text-earth-600">正在核對老師、教室與營業時間…</p>}
    {slots&&time&&roomId&&!roomPairs.some(p=>!(p.fixedOrigin&&template?.musicScheduleMode==="FIXED")&&(rooms.find(r=>r.id===p.roomId)?.capacity??capacity)>=capacity)&&<p role="status" className="text-amber-800">此教學項目在所選教室、時段沒有符合資格的可用老師或容量。請調整項目、教室或時段。</p>}
    {slots?.length===0&&<p className="text-earth-600">這天沒有合適空位，請換日期。</p>}
    {!!unavailable.length&&<details className="border-t border-earth-100 pt-2"><summary className="min-h-11 cursor-pointer py-2">查看不可排時段原因</summary><div className="max-h-36 overflow-auto">{unavailable.map(s=><p key={s.time}>{s.time} · {s.reason}</p>)}</div></details>}
    {pair&&<div className="space-y-3 border-t border-earth-100 pt-3">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={repeat} disabled={pair.fixedOrigin} onChange={e=>setRepeat(e.target.checked)}/>每週固定排課</label>
      {repeat&&<label className="flex items-center gap-2">連續堂數<input aria-label="連續排課堂數" className="min-h-11 w-24 rounded-lg border px-3" type="number" min={2} max={52} value={repeatCount} onChange={e=>setRepeatCount(Number(e.target.value))}/></label>}
      <p className="text-earth-600">{date} {time} · {coaches.find(c=>c.id===selectedCoachId)?.displayName} · {rooms.find(r=>r.id===selectedRoomId)?.name}</p>
      <button type="button" disabled={pending} onClick={create} className="min-h-11 w-full rounded-xl bg-primary-700 px-4 font-medium text-white disabled:opacity-50">{pending?"建立中…":"建立課程，接著選學員"}</button>
    </div>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p>}
  </div>;
}
