"use client";

import {fitnessEditorSave} from "@/components/admin/course-editor-styles";
import { CourseConflicts, type ConflictItem } from "@/components/admin/course-conflicts";
import { useEffect, useState, useTransition } from "react";
import {
  getCourseStaffAvailability,
  saveCourseStaffAvailabilityException,
  saveCourseStaffWeeklyAvailability,
} from "@/server/actions/course-availability";

type Period={openTime:string;closeTime:string};
type Day={dayOfWeek:number;periods:Period[]};
const names=["日","一","二","三","四","五","六"];
const field="min-h-10 rounded-lg border border-earth-200 bg-white px-2 text-sm";
const button="min-h-9 rounded-lg border border-earth-200 bg-white px-2 text-xs text-primary-800";

function PeriodRows({periods,onChange,fitness=false,compact=false}:{compact?:boolean;fitness?:boolean;periods:Period[];onChange:(value:Period[])=>void}) {
  return <div className="flex flex-wrap items-center gap-1">
    {periods.map((period,index)=><div key={index} className={compact?"flex min-w-0 items-center gap-1":"flex flex-wrap items-center gap-1"}>
      <input className={fitness?`${field} min-w-0 ${compact?"w-36 shrink-0":"w-32"}`:field} type="time" step={1800} value={period.openTime} onChange={e=>onChange(periods.map((p,i)=>i===index?{...p,openTime:e.target.value}:p))}/>
      <span className="text-xs text-earth-500">{compact?"–":"至"}</span>
      <input className={fitness?`${field} min-w-0 ${compact?"w-36 shrink-0":"w-32"}`:field} type="time" step={1800} value={period.closeTime} onChange={e=>onChange(periods.map((p,i)=>i===index?{...p,closeTime:e.target.value}:p))}/>
      {periods.length>1&&<button type="button" aria-label="移除時段" className={button} onClick={()=>onChange(periods.filter((_,i)=>i!==index))}>×</button>}
    </div>)}
    {periods.length<8&&<button type="button" aria-label="新增時段" title="新增時段" className={compact?`${button} min-w-8 px-1`:button} onClick={()=>onChange([...periods,{openTime:"18:00",closeTime:"21:00"}])}>{compact?"＋":"＋ 時段"}</button>}
  </div>;
}

export function CourseStaffAvailabilityEditor({staffId,fitness=false,onGuard}:{staffId:string;fitness?:boolean;onGuard?:(value:{dirty:boolean;pending:boolean})=>void}) {
  const [dirtyWeekly,setDirtyWeekly]=useState(false);
  const [dirtyException,setDirtyException]=useState(false);
  const [ready,setReady]=useState(false);
  const [inherit,setInherit]=useState(true);
  const [days,setDays]=useState<Day[]>(names.map((_,dayOfWeek)=>({dayOfWeek,periods:[{openTime:"09:00",closeTime:"21:00"}]})));
  const [exceptionDate,setExceptionDate]=useState("");
  const [exceptionType,setExceptionType]=useState<"INHERIT"|"UNAVAILABLE"|"CUSTOM">("UNAVAILABLE");
  const [exceptionReason,setExceptionReason]=useState("");
  const [exceptionPeriods,setExceptionPeriods]=useState<Period[]>([{openTime:"09:00",closeTime:"12:00"}]);
  const [exceptions,setExceptions]=useState<{date:string;type:string;reason:string;periods:Period[]}[]>([]);
  const [conflicts,setConflicts]=useState<ConflictItem[]>([]);
  const [message,setMessage]=useState("");
  const [pending,start]=useTransition();

  useEffect(()=>{onGuard?.({dirty:dirtyWeekly||dirtyException,pending});},[dirtyWeekly,dirtyException,pending,onGuard]);
  useEffect(()=>{
    let active=true;
    getCourseStaffAvailability(staffId).then(value=>{
      if(!active)return;
      setInherit(value.inheritStoreHours);
      if(value.weekly.length){
        setDays(names.map((_,dayOfWeek)=>({
          dayOfWeek,
          periods:value.weekly.find(row=>row.dayOfWeek===dayOfWeek)?.periods ?? [],
        })));
      }
      setExceptions(value.exceptions);setReady(true);
    }).catch(()=>active&&setMessage("可授課時間讀取失敗，請重試"));
    return()=>{active=false};
  },[staffId]);

  function saveWeekly(){
    setMessage("");setConflicts([]);
    start(async()=>{
      const result=await saveCourseStaffWeeklyAvailability({staffId,inheritStoreHours:inherit,days:inherit?[]:days});
      if(!result.success)setConflicts(result.conflicts??[]);else setDirtyWeekly(false);
      setMessage(result.success?"可授課時間已儲存":result.error??"儲存失敗");
    });
  }
  function saveException(){
    if(!exceptionDate){setMessage("請先選擇例外日期");return;}
    setMessage("");setConflicts([]);
    start(async()=>{
      const result=await saveCourseStaffAvailabilityException({
        staffId,date:exceptionDate,type:exceptionType,reason:exceptionReason,
        periods:exceptionType==="CUSTOM"?exceptionPeriods:[],
      });
      if(!result.success){setConflicts(result.conflicts??[]);setMessage(result.error??"儲存失敗");return;}
      const value=await getCourseStaffAvailability(staffId);
      setExceptions(value.exceptions);setReady(true);
      setDirtyException(false);setMessage("單日例外已儲存");
    });
  }

  return <section className={fitness?"space-y-3":"space-y-3 rounded-xl border border-earth-200 bg-earth-50/40 p-3"}>
    <CourseConflicts items={conflicts}/>
    <div>
      <h3 className="font-medium text-primary-900">可授課時間</h3>{fitness&&<p className="mt-1 text-sm text-earth-600">每週規則與單日例外分別儲存。</p>}
    </div>
    <fieldset disabled={pending || !ready} onChangeCapture={()=>setDirtyWeekly(true)} className="space-y-3"><div className={fitness?"flex flex-wrap items-center justify-between gap-3":"contents"}><label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={inherit} onChange={e=>setInherit(e.target.checked)}/>
      沿用店家授課時間
    </label>{fitness&&<button type="button" disabled={pending} className={`${fitnessEditorSave} bg-primary-700 text-white disabled:opacity-50`} onClick={saveWeekly}>儲存時間</button>}</div>
    {!inherit&&<div className={fitness?"grid grid-cols-[repeat(auto-fit,minmax(min(100%,432px),1fr))] items-start gap-x-4 gap-y-2":"space-y-2"}>
      {days.map(day=>{
        const toggle=day.periods.length?<button type="button" className={fitness?"col-start-2 row-start-1 min-h-9 justify-self-start rounded-lg whitespace-nowrap text-sm text-primary-700 hover:text-primary-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 min-[600px]:col-start-3":"text-xs text-earth-500"} onClick={()=>{setDirtyWeekly(true);setDays(current=>current.map(item=>item.dayOfWeek===day.dayOfWeek?{...item,periods:[]}:item));}}>{fitness?"設為休息":"不授課"}</button>:<button type="button" className={fitness?`${button} col-start-2 row-start-1 justify-self-end min-[600px]:col-start-3`:button} onClick={()=>{setDirtyWeekly(true);setDays(current=>current.map(item=>item.dayOfWeek===day.dayOfWeek?{...item,periods:[{openTime:"09:00",closeTime:"21:00"}]}:item));}}>{fitness?"開放授課":"＋ 開放"}</button>;
        const periods=<PeriodRows fitness={fitness} compact={fitness} periods={day.periods} onChange={periods=>{setDirtyWeekly(true);setDays(current=>current.map(item=>item.dayOfWeek===day.dayOfWeek?{...item,periods}:item));}}/>;
        return <div key={day.dayOfWeek} className={fitness?"grid min-w-0 max-w-[436px] grid-cols-[1.75rem_minmax(0,1fr)] items-center min-[600px]:grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-1 border-b border-earth-100 bg-white pb-2":"grid items-center gap-2 border-b border-earth-100 bg-white px-2 py-1.5 sm:grid-cols-[48px_1fr_auto]"}>
          {fitness?<><strong className="text-sm">週{names[day.dayOfWeek]}</strong><div className="col-span-2 row-start-2 min-w-0 min-[600px]:col-span-1 min-[600px]:row-start-auto">{day.periods.length>0?periods:<span className="text-sm text-earth-500">休息</span>}</div>{toggle}</>:<><strong className="text-sm">週{names[day.dayOfWeek]}</strong><div className="min-w-0">{periods}</div>{toggle}</>}
        </div>;
      })}
    </div>}
    {!fitness&&<button type="button" disabled={pending} className={button} onClick={saveWeekly}>儲存每週可授課時間</button>}</fieldset>

    <details className="rounded-lg border border-earth-200 bg-white p-2">
      <summary className="cursor-pointer text-sm font-medium text-primary-900">單日例外／請假／臨時加開</summary>
      <fieldset disabled={pending || !ready} onChangeCapture={()=>setDirtyException(true)} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className={field} type="date" value={exceptionDate} onChange={e=>setExceptionDate(e.target.value)}/>
        <select className={field} value={exceptionType} onChange={e=>setExceptionType(e.target.value as typeof exceptionType)}>
          <option value="UNAVAILABLE">當日不可授課／請假</option>
          <option value="CUSTOM">當日自訂可授課時間</option>
          <option value="INHERIT">取消例外，恢復固定規則</option>
        </select>
        {exceptionType==="CUSTOM"&&<div className="sm:col-span-2"><PeriodRows periods={exceptionPeriods} onChange={periods=>{setDirtyException(true);setExceptionPeriods(periods);}}/></div>}
        <input className={field+" sm:col-span-2"} placeholder="原因（選填）" value={exceptionReason} onChange={e=>setExceptionReason(e.target.value)}/>
        <button type="button" disabled={pending} className={fitness?`${fitnessEditorSave} sm:col-span-2 justify-self-end bg-primary-700 text-white disabled:opacity-50`:button} onClick={saveException}>儲存單日例外</button>
      </fieldset>
      {!!exceptions.length&&<div className="mt-3 space-y-1 text-xs text-earth-600">
        {exceptions.slice(0,6).map(item=><p key={item.date}>{item.date} · {item.type==="UNAVAILABLE"?"不可授課":item.type==="CUSTOM"?"自訂時段":"固定規則"}{item.reason?" · "+item.reason:""}</p>)}
      </div>}
    </details>
    {message&&<p role="status" className="text-sm text-primary-800">{message}</p>}
  </section>;
}
