"use client";

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

function PeriodRows({periods,onChange}:{periods:Period[];onChange:(value:Period[])=>void}) {
  return <div className="space-y-1">
    {periods.map((period,index)=><div key={index} className="flex flex-wrap items-center gap-1">
      <input className={field} type="time" step={1800} value={period.openTime} onChange={e=>onChange(periods.map((p,i)=>i===index?{...p,openTime:e.target.value}:p))}/>
      <span className="text-xs text-earth-500">至</span>
      <input className={field} type="time" step={1800} value={period.closeTime} onChange={e=>onChange(periods.map((p,i)=>i===index?{...p,closeTime:e.target.value}:p))}/>
      {periods.length>1&&<button type="button" className={button} onClick={()=>onChange(periods.filter((_,i)=>i!==index))}>移除</button>}
    </div>)}
    {periods.length<8&&<button type="button" className={button} onClick={()=>onChange([...periods,{openTime:"18:00",closeTime:"21:00"}])}>＋ 時段</button>}
  </div>;
}

export function CourseStaffAvailabilityEditor({staffId}:{staffId:string}) {
  const [inherit,setInherit]=useState(true);
  const [days,setDays]=useState<Day[]>(names.map((_,dayOfWeek)=>({dayOfWeek,periods:[{openTime:"09:00",closeTime:"21:00"}]})));
  const [exceptionDate,setExceptionDate]=useState("");
  const [exceptionType,setExceptionType]=useState<"INHERIT"|"UNAVAILABLE"|"CUSTOM">("UNAVAILABLE");
  const [exceptionReason,setExceptionReason]=useState("");
  const [exceptionPeriods,setExceptionPeriods]=useState<Period[]>([{openTime:"09:00",closeTime:"12:00"}]);
  const [exceptions,setExceptions]=useState<{date:string;type:string;reason:string;periods:Period[]}[]>([]);
  const [message,setMessage]=useState("");
  const [pending,start]=useTransition();

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
      setExceptions(value.exceptions);
    }).catch(()=>active&&setMessage("可授課時間讀取失敗，請重試"));
    return()=>{active=false};
  },[staffId]);

  function saveWeekly(){
    setMessage("");
    start(async()=>{
      const result=await saveCourseStaffWeeklyAvailability({staffId,inheritStoreHours:inherit,days:inherit?[]:days});
      setMessage(result.success?"可授課時間已儲存":result.error??"儲存失敗");
    });
  }
  function saveException(){
    if(!exceptionDate){setMessage("請先選擇例外日期");return;}
    setMessage("");
    start(async()=>{
      const result=await saveCourseStaffAvailabilityException({
        staffId,date:exceptionDate,type:exceptionType,reason:exceptionReason,
        periods:exceptionType==="CUSTOM"?exceptionPeriods:[],
      });
      if(!result.success){setMessage(result.error??"儲存失敗");return;}
      const value=await getCourseStaffAvailability(staffId);
      setExceptions(value.exceptions);
      setMessage("單日例外已儲存");
    });
  }

  return <section className="space-y-3 rounded-xl border border-earth-200 bg-earth-50/40 p-3">
    <div>
      <h3 className="font-medium text-primary-900">可授課時間</h3>
      <p className="text-xs text-earth-600">白色空格代表可排；非授課時段在老師視角反灰。開始時間以 30 分鐘為單位。</p>
    </div>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={inherit} onChange={e=>setInherit(e.target.checked)}/>
      沿用店家授課時間
    </label>
    {!inherit&&<div className="space-y-2">
      {days.map(day=><div key={day.dayOfWeek} className="grid gap-2 rounded-lg bg-white p-2 sm:grid-cols-[56px_1fr]">
        <strong className="pt-2 text-sm">週{names[day.dayOfWeek]}</strong>
        <div>
          <PeriodRows periods={day.periods} onChange={periods=>setDays(current=>current.map(item=>item.dayOfWeek===day.dayOfWeek?{...item,periods}:item))}/>
          {!!day.periods.length&&<button type="button" className="mt-1 text-xs text-earth-500 underline" onClick={()=>setDays(current=>current.map(item=>item.dayOfWeek===day.dayOfWeek?{...item,periods:[]}:item))}>本日不授課</button>}
          {!day.periods.length&&<button type="button" className={button} onClick={()=>setDays(current=>current.map(item=>item.dayOfWeek===day.dayOfWeek?{...item,periods:[{openTime:"09:00",closeTime:"21:00"}]}:item))}>＋ 開放授課</button>}
        </div>
      </div>)}
    </div>}
    <button type="button" disabled={pending} className={button} onClick={saveWeekly}>儲存每週可授課時間</button>

    <details className="rounded-lg border border-earth-200 bg-white p-2">
      <summary className="cursor-pointer text-sm font-medium text-primary-900">單日例外／請假／臨時加開</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className={field} type="date" value={exceptionDate} onChange={e=>setExceptionDate(e.target.value)}/>
        <select className={field} value={exceptionType} onChange={e=>setExceptionType(e.target.value as typeof exceptionType)}>
          <option value="UNAVAILABLE">當日不可授課／請假</option>
          <option value="CUSTOM">當日自訂可授課時間</option>
          <option value="INHERIT">取消例外，恢復固定規則</option>
        </select>
        {exceptionType==="CUSTOM"&&<div className="sm:col-span-2"><PeriodRows periods={exceptionPeriods} onChange={setExceptionPeriods}/></div>}
        <input className={field+" sm:col-span-2"} placeholder="原因（選填）" value={exceptionReason} onChange={e=>setExceptionReason(e.target.value)}/>
        <button type="button" disabled={pending} className={button} onClick={saveException}>儲存單日例外</button>
      </div>
      {!!exceptions.length&&<div className="mt-3 space-y-1 text-xs text-earth-600">
        {exceptions.slice(0,6).map(item=><p key={item.date}>{item.date} · {item.type==="UNAVAILABLE"?"不可授課":item.type==="CUSTOM"?"自訂時段":"固定規則"}{item.reason?" · "+item.reason:""}</p>)}
      </div>}
    </details>
    {message&&<p role="status" className="text-sm text-primary-800">{message}</p>}
  </section>;
}
