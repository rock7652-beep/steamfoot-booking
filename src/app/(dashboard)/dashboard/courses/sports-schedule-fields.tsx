"use client";
import {useEffect,useRef,useState,useTransition} from "react";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import {CourseOptionSelect} from "@/components/admin/course-option-select";
import {sportsScheduleKinds} from "@/lib/sports-calendar-presentation";
import {sportsStagingCommand} from "@/server/actions/sports-staging";
import {DashboardLink} from "@/components/dashboard-link";
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2";
/** Music's scheduling arrangement inside the existing course sheet, backed by sports transactions. */
export function SportsScheduleFields({initial,date,seed={},requestKey,onGuard,onCreated}:{initial:SportsSnapshot;date:string;seed?:{time?:string;roomId?:string;coachId?:string;durationMinutes?:number};requestKey:string;onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void}){
 const live=initial,ready=true;const [error,setError]=useState("");
 const [kind,setKind]=useState("每週固定"),[enrollment,setEnrollment]=useState("指定學員");
 const [subject,setSubject]=useState(initial.subjects[0]?.id??""),[feeId,setFeeId]=useState("");
 const [day,setDay]=useState(date),[time,setTime]=useState(seed.time??"09:00"),[duration,setDuration]=useState(seed.durationMinutes??60),[capacity,setCapacity]=useState(8);
 const [coach,setCoach]=useState(initial.coaches.find(c=>c.id===seed.coachId)?.name??""),[room,setRoom]=useState(initial.rooms.find(r=>r.id===seed.roomId)?.name??initial.rooms[0]?.name??""),[students,setStudents]=useState<string[]>([]);
 const [price,setPrice]=useState(0),[customer,setCustomer]=useState(""),[phone,setPhone]=useState("");
 const [pending,start]=useTransition();const lock=useRef(false),[dirty,setDirty]=useState(false);
 const rental=kind==="空間出租",trial=kind==="體驗",fixed=kind==="每週固定"||kind==="隔週固定";
 const fees=live.fees.filter(f=>f.subject===subject),fee=fees.find(f=>f.id===feeId);

 useEffect(()=>{onGuard(dirty,pending);return()=>onGuard(false,false);},[dirty,pending,onGuard]);
 return <form data-course-entry className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3" onChange={()=>setDirty(true)} onSubmit={e=>{
  e.preventDefault();if(lock.current||pending||!ready)return;lock.current=true;setError("");
  start(async()=>{try{const result=await sportsStagingCommand({operation:"schedule",payload:{subject,fee:feeId||undefined,kind,mode:enrollment,date:day,time,duration,count:1,coach,room,capacity:enrollment==="指定學員"?Math.max(1,students.length):capacity,students:enrollment==="指定學員"?students:[],price,customer,phone,requestKey}});if(!result.success){setError(result.error??"排課失敗");return;}setDirty(false);onCreated(day);}catch{setError("連線失敗，輸入已保留，請重試");}finally{lock.current=false;}});
 }}>
 <fieldset disabled={pending} className="contents">
 <fieldset className="col-span-full"><legend className="sr-only">排課類型</legend><div className="flex flex-wrap gap-1.5" aria-label="排課類型">{sportsScheduleKinds.map((item,index)=>{const value=["每週固定","隔週固定","單次","體驗","空間出租"][index];return <button key={item.kind} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)} className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${kind===value?`${item.card} ring-1 ring-current`:"border-earth-200 bg-white text-earth-600"}`}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true"/>{item.label}</button>;})}</div></fieldset>
 <label>日期<input aria-label="排課日期" className={field} required type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
 <label>時間<input aria-label="排課時間" className={field} required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
 <label>時長（分鐘）<select aria-label="排課時長" className={field} value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[30,60,90,120].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
 {fixed&&<p className="col-span-full text-earth-600">此時段持續保留，直到停課或異動；指定學員完成點名後才扣堂／點。</p>}
 {!rental&&<><label>教學項目<CourseOptionSelect searchable label="排課教學項目" required value={subject} onChange={value=>{setSubject(value);setFeeId("");setStudents([]);}} options={live.subjects.filter(s=>s.active).map(s=>({id:s.id,label:s.name}))}/></label>
 <label>收費方式<CourseOptionSelect searchable label="排課收費方式" required value={feeId} onChange={value=>{setFeeId(value);setStudents([]);const selected=fees.find(f=>f.id===value);if(selected&&!live.coaches.some(c=>c.name===coach&&c.templates.includes(selected.templateId)))setCoach("");}} options={fees.map(f=>({id:f.id,label:`${f.name} · 每堂 ${f.unit==="點數"?f.cost:1}${f.unit==="點數"?"點":"堂"}`}))}/></label>
 <label>授課教練<CourseOptionSelect searchable label="排課教練" required value={coach} onChange={setCoach} options={live.coaches.filter(c=>!fee||c.templates.includes(fee.templateId)).map(c=>({id:c.name,label:c.name}))}/></label>
 <fieldset className="col-span-full"><legend>學員安排</legend><div className="flex flex-wrap gap-4">{["指定學員","開放選課"].map(m=><label key={m} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 ${enrollment===m?"border-primary-700 bg-primary-50 text-primary-900":"border-earth-200"}`}><input className="h-4 w-4 shrink-0 accent-primary-700" type="radio" name="enrollment" checked={enrollment===m} onChange={()=>{setEnrollment(m);setStudents([]);}}/>{m}</label>)}</div></fieldset>
 {enrollment==="指定學員"&&<fieldset className="col-span-full"><legend>指定學員</legend><div className="max-h-40 overflow-y-auto">{live.customers.filter(c=>trial||fixed||live.students.some(s=>s.id===c.id&&s.fee===feeId)).map(c=><label key={c.id} className="flex min-h-11 items-center gap-2"><input className="h-4 w-4 shrink-0 accent-primary-700" type="checkbox" checked={students.includes(c.id)} onChange={e=>setStudents(v=>e.target.checked?[...v,c.id]:v.filter(id=>id!==c.id))}/>{c.name}</label>)}</div><p className="text-earth-500">固定課可先指定學員，不保留或預扣額度；點名時核對有效方案。單次課沿用課卡預約規則。</p></fieldset>}
 {enrollment==="開放選課"&&<label>人數上限<input aria-label="排課人數" className={field} type="number" min="1" max="50" required value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>}</>}
 <label>空間<CourseOptionSelect searchable label="排課空間" required value={room} onChange={setRoom} options={live.rooms.filter(r=>!rental||r.rental).map(r=>({id:r.name,label:r.name}))}/></label>
 {(rental||trial)&&<label>{rental?"租金":"每位體驗費"}<input aria-label="排課費用" className={field} required type="number" min="0" max="1000000" value={price} onChange={e=>setPrice(Number(e.target.value))}/></label>}
 {rental&&<><label>租借人<input className={field} required value={customer} onChange={e=>setCustomer(e.target.value)}/></label><label>電話<input className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label></>}
 {!rental&&!fees.length&&<DashboardLink href="/dashboard/courses?view=plans" className="col-span-full underline">先建立收費方式</DashboardLink>}
 </fieldset>
 {error&&<p role="alert" className="col-span-full text-red-700">{error}</p>}
 <div className="sticky bottom-0 flex justify-end border-t border-earth-100 bg-white py-3 col-span-full"><button className="min-h-11 rounded-lg bg-primary-700 px-6 text-white disabled:opacity-50" disabled={!ready||pending||(!rental&&(!fee||enrollment==="指定學員"&&!students.length))}>{pending?"新增中…":"新增"}</button></div>
 </form>;
}
