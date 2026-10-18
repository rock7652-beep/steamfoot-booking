"use client";
import {useEffect,useRef,useState,useTransition} from "react";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import {loadSportsStaging,sportsStagingCommand} from "@/server/actions/sports-staging";
import {DashboardLink} from "@/components/dashboard-link";
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2";
/** Music's scheduling arrangement inside the existing course sheet, backed by sports transactions. */
export function SportsScheduleFields({initial,date,requestKey,onGuard,onCreated}:{initial:SportsSnapshot;date:string;requestKey:string;onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void}){
 const [live,setLive]=useState(initial),[ready,setReady]=useState(false),[error,setError]=useState("");
 const [kind,setKind]=useState("每週固定"),[enrollment,setEnrollment]=useState("指定學員");
 const [subject,setSubject]=useState(initial.subjects[0]?.id??""),[feeId,setFeeId]=useState("");
 const [day,setDay]=useState(date),[time,setTime]=useState("09:00"),[duration,setDuration]=useState(60),[count,setCount]=useState(4),[capacity,setCapacity]=useState(8);
 const [coach,setCoach]=useState(""),[room,setRoom]=useState(""),[students,setStudents]=useState<string[]>([]);
 const [price,setPrice]=useState(0),[customer,setCustomer]=useState(""),[phone,setPhone]=useState("");
 const [pending,start]=useTransition();const lock=useRef(false),[dirty,setDirty]=useState(false);
 const rental=kind==="空間出租",trial=kind==="體驗",fixed=kind==="每週固定"||kind==="隔週固定";
 const fees=live.fees.filter(f=>f.subject===subject),fee=fees.find(f=>f.id===feeId);
 useEffect(()=>{let active=true;loadSportsStaging().then(r=>{if(!active)return;if(r.success){setLive(r.data);setReady(true);}else setError(r.error);}).catch(()=>{if(active)setError("排課資料讀取失敗，請重新開啟");});return()=>{active=false;};},[]);
 useEffect(()=>{onGuard(dirty,pending);return()=>onGuard(false,false);},[dirty,pending,onGuard]);
 return <form className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2" onChange={()=>setDirty(true)} onSubmit={e=>{
  e.preventDefault();if(lock.current||pending||!ready)return;lock.current=true;setError("");
  start(async()=>{try{const result=await sportsStagingCommand({operation:"schedule",payload:{subject,fee:feeId||undefined,kind,mode:enrollment,date:day,time,duration,count:fixed?count:1,coach,room,capacity,students:enrollment==="指定學員"?students:[],price,customer,phone,requestKey}});if(!result.success){setError(result.error??"排課失敗");return;}setDirty(false);onCreated(day);}catch{setError("連線失敗，輸入已保留，請重試");}finally{lock.current=false;}});
 }}>
 <fieldset disabled={pending} className="contents">
 <label>排課類型<select aria-label="排課類型" className={field} value={kind} onChange={e=>setKind(e.target.value)}>{["每週固定","隔週固定","單次","體驗","空間出租"].map(k=><option key={k}>{k}</option>)}</select></label>
 <label>日期<input aria-label="排課日期" className={field} required type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
 <label>時間<input aria-label="排課時間" className={field} required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
 <label>時長（分鐘）<select aria-label="排課時長" className={field} value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[30,60,90,120].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
 {fixed&&<label>本次安排堂數<input aria-label="安排堂數" className={field} required type="number" min="1" max="24" value={count} onChange={e=>setCount(Number(e.target.value))}/></label>}
 {!rental&&<><label>教學項目<select aria-label="排課教學項目" className={field} required value={subject} onChange={e=>{setSubject(e.target.value);setFeeId("");setStudents([]);}}><option value="">請選擇</option>{live.subjects.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>收費方式<select aria-label="排課收費方式" className={field} required value={feeId} onChange={e=>{setFeeId(e.target.value);setStudents([]);setCoach("");}}><option value="">請選擇</option>{fees.map(f=><option key={f.id} value={f.id}>{f.name} · 每堂 {f.unit==="點數"?f.cost:1}{f.unit==="點數"?"點":"堂"}</option>)}</select></label>
 <label>授課教練<select aria-label="排課教練" className={field} required value={coach} onChange={e=>setCoach(e.target.value)}><option value="">請選擇</option>{live.coaches.filter(c=>!fee||c.templates.includes(fee.templateId)).map(c=><option key={c.id}>{c.name}</option>)}</select></label>
 <fieldset className="sm:col-span-2"><legend>學員安排</legend><div className="flex flex-wrap gap-4">{["指定學員","開放選課"].map(m=><label key={m} className="flex min-h-11 items-center gap-2"><input type="radio" name="enrollment" checked={enrollment===m} onChange={()=>{setEnrollment(m);setStudents([]);}}/>{m}</label>)}</div></fieldset>
 {enrollment==="指定學員"&&<fieldset className="sm:col-span-2"><legend>指定學員</legend><div className="max-h-40 overflow-y-auto">{live.customers.filter(c=>trial||live.students.some(s=>s.id===c.id&&s.fee===feeId)).map(c=><label key={c.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={students.includes(c.id)} onChange={e=>setStudents(v=>e.target.checked?[...v,c.id]:v.filter(id=>id!==c.id))}/>{c.name}</label>)}</div><p className="text-earth-500">一般課僅列出持有此收費方式課卡的學員；送出時再次核對額度、期限與預約。</p></fieldset>}
 <label>人數上限<input aria-label="排課人數" className={field} type="number" min="1" max="50" required value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label></>}
 <label>空間<select aria-label="排課空間" className={field} required value={room} onChange={e=>setRoom(e.target.value)}><option value="">請選擇</option>{live.rooms.filter(r=>!rental||r.rental).map(r=><option key={r.id}>{r.name}</option>)}</select></label>
 {(rental||trial)&&<label>{rental?"租金":"每位體驗費"}<input aria-label="排課費用" className={field} required type="number" min="0" max="1000000" value={price} onChange={e=>setPrice(Number(e.target.value))}/></label>}
 {rental&&<><label>租借人<input className={field} required value={customer} onChange={e=>setCustomer(e.target.value)}/></label><label>電話<input className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label></>}
 {!rental&&!fees.length&&<DashboardLink href="/dashboard/courses?view=plans" className="sm:col-span-2 underline">先建立收費方式</DashboardLink>}
 </fieldset>
 {error&&<p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}
 <div className="sticky bottom-0 flex justify-end border-t border-earth-100 bg-white py-3 sm:col-span-2"><button className="min-h-11 rounded-lg bg-primary-700 px-6 text-white disabled:opacity-50" disabled={!ready||pending||(!rental&&(!fee||enrollment==="指定學員"&&!students.length))}>{pending?"新增中…":"新增"}</button></div>
 </form>;
}
