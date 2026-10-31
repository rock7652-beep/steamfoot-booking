"use client";
import {sportsScheduleReceipt} from "@/lib/sports-schedule-receipt";
import type {Session} from "./workspace";
import {normalizePhone} from "@/lib/normalize";
import {CourseChargeSelect,type ScheduleCharge} from "@/components/admin/course-charge-select";
import {useCoursePersonnelText} from "@/components/course-personnel-label";

import {ServiceReservationForm,type ServiceReservationSource} from "@/components/admin/service-reservation-form";
import {courseSchedulingModeAllowed,type CourseSchedulingModes} from "@/lib/course-scheduling-modes";
import {useEffect,useRef,useState,useTransition} from "react";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import {CourseOptionSelect,CourseMultiOptionSelect} from "@/components/admin/course-option-select";
import {sportsScheduleKinds} from "@/lib/sports-calendar-presentation";
import {createRentalCustomer} from "@/server/actions/course-rental";
import {sportsStagingCommand} from "@/server/actions/sports-staging";
import {DashboardLink} from "@/components/dashboard-link";
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2";
/** Data/action ports only. The complete original scheduling form is shared. */
export type SportsScheduleSource = {
 reservation?:ServiceReservationSource;
 command: typeof sportsStagingCommand;
 createCustomer: typeof createRentalCustomer;
 catalogHref: string;
};
function SportsLessonFields({source,schedulingModes,metadataPending=false,initial,date,seed={},requestKey,onGuard,onCreated,onCustomerAdded,waitlistEnabled=false,waitlistDefaultLimit=5,waitlistDefaultStopMinutes=240}: {metadataPending?:boolean;source?:SportsScheduleSource;schedulingModes?:CourseSchedulingModes;initial:SportsSnapshot;date:string;seed?:{templateId?:string;single?:boolean;time?:string;roomId?:string;customerId?:string;coachId?:string;durationMinutes?:number};requestKey:string;onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string,sessions?:Session[])=>void;onCustomerAdded?:(customer:SportsSnapshot["customers"][number])=>void;waitlistEnabled?:boolean;waitlistDefaultLimit?:number;waitlistDefaultStopMinutes?:number}){
 const personnelText = useCoursePersonnelText();
 const live=initial;
 const [selectedCharge,setSelectedCharge]=useState<ScheduleCharge|null>(null),[chargeReady,setChargeReady]=useState(false);
 const [customers,setCustomers]=useState(initial.customers),[rentalMode,setRentalMode]=useState("existing"),[rentalCustomerId,setRentalCustomerId]=useState(""),[customerNotice,setCustomerNotice]=useState(""),[newRentalName,setNewRentalName]=useState(""),[newRentalPhone,setNewRentalPhone]=useState("");const [error,setError]=useState("");
 const [kind,setKind]=useState(seed.single?"單次":"每週固定"),[selectedEnrollment,setEnrollment]=useState(schedulingModes?.assignedSchedulingEnabled===false?"開放選課":"指定學員");
 const ready=!metadataPending&&(!!source||kind!=="體驗"||chargeReady);
 const enrollment=courseSchedulingModeAllowed(schedulingModes,selectedEnrollment==="指定學員"?"ASSIGNED":"OPEN")?selectedEnrollment:courseSchedulingModeAllowed(schedulingModes,"ASSIGNED")?"指定學員":courseSchedulingModeAllowed(schedulingModes,"OPEN")?"開放選課":"";
 const [subject,setSubject]=useState(initial.subjects.find(s=>s.templateId===seed.templateId)?.id??initial.subjects[0]?.id??"");
 const [day,setDay]=useState(date),[time,setTime]=useState(seed.time??"09:00"),[duration,setDuration]=useState(seed.durationMinutes??60),[capacity,setCapacity]=useState(8);
 const [coach,setCoach]=useState(initial.coaches.find(c=>c.id===seed.coachId)?.id??""),[room,setRoom]=useState(initial.rooms.find(r=>r.id===seed.roomId)?.name??initial.rooms[0]?.name??""),[students,setStudents]=useState<string[]>((metadataPending&&seed.customerId||initial.customers.some(c=>c.id===seed.customerId))?[seed.customerId!]:[]);
 useEffect(()=>{if(!metadataPending){setCustomers(initial.customers);setStudents(current=>current.filter(id=>initial.customers.some(c=>c.id===id)));}},[metadataPending,initial.customers]);
 const [price,setPrice]=useState(0),[customer,setCustomer]=useState(""),[phone,setPhone]=useState("");
 const [trialCustomerMode,setTrialCustomerMode]=useState("new"),[trialName,setTrialName]=useState(""),[trialPhone,setTrialPhone]=useState(""),[trialCustomerId,setTrialCustomerId]=useState(seed.customerId??"");
 const [trialParticipantKey]=useState(()=>crypto.randomUUID());
 const normalizedTrialPhone=normalizePhone(trialPhone);
 const errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(error){errorRef.current?.focus({preventScroll:true});errorRef.current?.scrollIntoView?.({block:"nearest"});}},[error]);
 const [pending,start]=useTransition();const lock=useRef(false),[dirty,setDirty]=useState(false);
 const [waitlistLimit,setWaitlistLimit]=useState(waitlistEnabled?waitlistDefaultLimit:0);
 const endMinute=Number(time.slice(0,2))*60+Number(time.slice(3))+duration;
 const endsLabel=`${String(Math.floor(endMinute/60)%24).padStart(2,"0")}:${String(endMinute%60).padStart(2,"0")}${endMinute>=1440?"（次日）":""}`;
 const rental=kind==="空間出租",trial=kind==="體驗",fixed=kind==="每週固定"||kind==="隔週固定";
 const templateId=live.subjects.find(s=>s.id===subject)?.templateId;
 useEffect(()=>{if(!trial||enrollment==='開放選課'){setDuration(live.subjects.find(s=>s.id===subject)?.durationMinutes??60);return;}if(!selectedCharge)return;setDuration(trial?selectedCharge.settings.trialDuration??selectedCharge.settings.durationMinutes:selectedCharge.settings.durationMinutes);},[selectedCharge,trial,enrollment,live.subjects,subject]);
 useEffect(()=>{if(trial&&selectedCharge?.trialPrice!=null)setPrice(selectedCharge.trialPrice);},[selectedCharge,trial]);
 const trialStudents=trialCustomerMode==="existing"&&trialCustomerId?[trialCustomerId]:[];
 const trialValid=trialCustomerMode==="new"?!!trialName.trim()&&/^09\d{8}$/.test(normalizedTrialPhone):!!trialCustomerId;


 useEffect(()=>{onGuard(dirty,pending);return()=>onGuard(false,false);},[dirty,pending,onGuard]);
 return <form data-course-entry className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3" onChange={()=>{setDirty(true);setError("");}} onSubmit={e=>{
  e.preventDefault();if(lock.current||pending||metadataPending||!ready&&!rental)return;if(trial&&!trialValid){setError("請填寫體驗學員姓名與有效手機，或選擇既有學員");return;}if(!rental&&!enrollment){setError("目前未開放新增排課");return;}lock.current=true;setError("");
  start(async()=>{try{const result=await (source?.command??sportsStagingCommand)({operation:"schedule",payload:{...(trial&&selectedCharge?{fee:selectedCharge.id}:{}),subject,kind,mode:enrollment||"指定學員",date:day,time,duration,waitlistLimit:enrollment==="開放選課"&&waitlistEnabled?waitlistLimit:0,waitlistStopMinutes:waitlistDefaultStopMinutes,count:1,coach:live.coaches.find(c=>c.id===coach)?.name??"",coachId:coach,room,capacity:enrollment==="指定學員"?trial?1:Math.max(1,students.length):capacity,students:trial?trialStudents:enrollment==="指定學員"?students:[],...(trial&&trialCustomerMode==="new"?{trialLearner:{participantKey:trialParticipantKey,name:trialName.trim(),phone:normalizedTrialPhone}}:{}),price,customer,phone,customerId:rentalCustomerId||null,requestKey}});if(!result.success){setError(result.error??"排課失敗");return;}setDirty(false);onCreated(day,sportsScheduleReceipt("data" in result?result.data:undefined,enrollment==="指定學員"?"ASSIGNED":"OPEN"));}catch{setError("連線失敗，輸入已保留，請重試");}finally{lock.current=false;}});
 }}>
 {error&&<p ref={errorRef} role="alert" tabIndex={-1} className="col-span-full rounded-lg border border-red-300 bg-red-50 px-3 py-3 font-medium text-red-800">{error}</p>}
 {pending&&<p role="status" className="col-span-full rounded-lg bg-primary-50 px-3 py-2 text-primary-900">正在新增排課，請稍候，勿重複送出。</p>}
 <fieldset disabled={pending} className="contents">
 <fieldset className="col-span-full"><legend className="sr-only">排課類型</legend><div className="flex flex-wrap gap-1.5" aria-label="排課類型">{sportsScheduleKinds.map((item,index)=>{const value=["每週固定","隔週固定","單次","體驗","空間出租"][index];return <button key={item.kind} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)} className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${kind===value?`${item.card} ring-1 ring-current`:"border-earth-200 bg-white text-earth-600"}`}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true"/>{item.label}</button>;})}</div></fieldset>
 <label>日期<input aria-label="排課日期" className={field} required type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
 <label>時間<input aria-label="排課時間" className={field} required type="time" step="300" value={time} onChange={e=>setTime(e.target.value)}/></label>
 <label>時長（分鐘）<input aria-label="排課時長" readOnly={trial&&!!selectedCharge&&enrollment!=="開放選課"} className={field} type="number" min="5" max="480" step="1" list="sports-duration-options" required value={duration} onChange={e=>setDuration(Number(e.target.value))}/><datalist id="sports-duration-options">{[30,40,45,50,60,90].map(n=><option key={n} value={n}/>)}</datalist><span className="text-earth-600">結束 {endsLabel}</span></label>
 {!source&&trial&&templateId&&<CourseChargeSelect sports templateId={templateId} trial={trial} open={enrollment==='開放選課'} onDefaultPrice={setPrice} onChange={setSelectedCharge} onReady={setChargeReady}/>}
 {fixed&&<p className="col-span-full text-earth-600">此時段持續保留，直到停課或異動；指定學員完成點名後才扣堂／點。</p>}
 {!rental&&<><label>教學項目<CourseOptionSelect searchable label="排課教學項目" required value={subject} onChange={value=>{setSubject(value);if(enrollment==='開放選課')setDuration(live.subjects.find(s=>s.id===value)?.durationMinutes??60);setCoach("");setStudents([]);}} options={live.subjects.filter(s=>s.active).map(s=>({id:s.id,label:s.name}))}/></label>
 <label>{personnelText("授課教練")}<CourseOptionSelect searchable label={personnelText("排課教練")} required value={coach} onChange={setCoach} options={live.coaches.filter(c=>!!templateId&&c.templates.includes(templateId)&&(!trial||!selectedCharge||selectedCharge.settings.providerIds.includes(c.id))).map(c=>({id:c.id,label:c.name}))}/></label>
 {!trial&&<fieldset className="col-span-full"><legend>學員安排</legend>{!courseSchedulingModeAllowed(schedulingModes,"OPEN")&&!courseSchedulingModeAllowed(schedulingModes,"ASSIGNED")&&<p className="text-earth-600">目前未開放新增排課</p>}<div className="flex flex-wrap gap-1.5">{["指定學員","開放選課"].filter(m=>courseSchedulingModeAllowed(schedulingModes,m==="指定學員"?"ASSIGNED":"OPEN")).map(m=><label key={m} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 ${enrollment===m?"border-primary-700 bg-primary-50 text-primary-900":"border-earth-200"}`}><input className="sr-only" type="radio" name="enrollment" checked={enrollment===m} onChange={()=>setEnrollment(m)}/>{m}</label>)}</div></fieldset>}
 {!trial&&enrollment==="指定學員"&&<fieldset className="col-span-full"><legend>指定學員 · 已選 {students.length} 人</legend><CourseMultiOptionSelect label="搜尋學員" value={students} onChange={setStudents} options={customers.map(c=>({id:c.id,label:`${c.name} · ${c.phone}`}))}/><p className="text-earth-500">可先安排學員；點名前須有適用方案，無方案可在名單內繳費。</p></fieldset>}
 {enrollment==="開放選課"&&<><label>人數上限<input aria-label="排課人數" className={field} type="number" min="1" max="50" required value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label><label>候補人數<input aria-label="候補人數" className={field} type="number" min="0" max="100" required disabled={!waitlistEnabled} value={waitlistEnabled?waitlistLimit:0} onChange={e=>setWaitlistLimit(Number(e.target.value))}/>{!waitlistEnabled&&<span className="text-earth-600">候補未啟用</span>}</label></>}</>}
 {trial&&<fieldset className="col-span-full grid gap-2 sm:grid-cols-2"><legend>體驗學員</legend><div className="col-span-full flex flex-wrap gap-2">{[["new","新增體驗學員"],["existing","既有學員"]].map(([value,label])=><button key={value} type="button" aria-pressed={trialCustomerMode===value} className={`min-h-11 rounded-lg border px-3 ${trialCustomerMode===value?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>setTrialCustomerMode(value)}>{label}</button>)}</div>{trialCustomerMode==="new"?<><label>姓名<input aria-label="體驗學員姓名" className={field} required maxLength={80} autoComplete="name" value={trialName} onChange={e=>setTrialName(e.target.value)}/></label><label>手機<input aria-label="體驗學員手機" className={field} required type="tel" inputMode="tel" autoComplete="tel" value={trialPhone} onChange={e=>setTrialPhone(e.target.value)}/></label><p className="col-span-full text-earth-600">排課成功時一併建立學員資料；同手機已有資料時沿用，避免重複建檔。</p></>:<label className="col-span-full">選擇體驗學員<CourseOptionSelect searchable label="選擇體驗學員" required value={trialCustomerId} onChange={setTrialCustomerId} options={customers.map(c=>({id:c.id,label:`${c.name} · ${c.phone}`}))}/></label>}</fieldset>}
 <label>空間<CourseOptionSelect searchable label="排課空間" required value={room} onChange={setRoom} options={live.rooms.filter(r=>!rental||r.rental).map(r=>({id:r.name,label:r.name}))}/></label>
 {(rental||trial)&&<label>{rental?"租金":"每位體驗費"}<input aria-label="排課費用" readOnly={trial&&(enrollment==='開放選課'||!!selectedCharge)} className={field} required type="number" min="0" max="1000000" value={price} onChange={e=>setPrice(Number(e.target.value))}/></label>}
 {rental&&<><fieldset className="col-span-full"><legend>租借顧客</legend><div className="flex gap-1.5">{[["existing","既有顧客"],["new","新增顧客"]].map(([value,label])=><button key={value} type="button" aria-pressed={rentalMode===value} className={`min-h-11 rounded-lg border px-3 ${rentalMode===value?"border-primary-700 bg-primary-50":"border-earth-200"}`} onClick={()=>{setRentalMode(value);setCustomerNotice("");}}>{label}</button>)}</div></fieldset>
 {rentalMode==="existing"?<label className="sm:col-span-2">搜尋租借顧客<CourseOptionSelect searchable label="搜尋租借顧客" required value={rentalCustomerId} onChange={id=>{const c=customers.find(c=>c.id===id);setRentalCustomerId(id);if(c){setCustomer(c.name);setPhone(c.phone);}}} options={customers.map(c=>({id:c.id,label:`${c.name} · ${c.phone}`}))}/>{rentalCustomerId&&<span className="text-earth-600">{customer} · {phone}</span>}</label>:<><label>顧客姓名<input aria-label="新增租借顧客姓名" className={field} value={newRentalName} onChange={e=>setNewRentalName(e.target.value)}/></label><label>電話<input aria-label="新增租借顧客電話" type="tel" className={field} value={newRentalPhone} onChange={e=>setNewRentalPhone(e.target.value)}/></label><button type="button" className="min-h-11 self-end rounded-lg border border-primary-300 px-3" disabled={metadataPending||!newRentalName.trim()||!newRentalPhone.trim()} onClick={()=>{if(lock.current)return;lock.current=true;setError("");start(async()=>{try{const r=await (source?.createCustomer??createRentalCustomer)({name:newRentalName,phone:newRentalPhone});if(!r.success){setError(r.error);return;}setCustomers(old=>[...old.filter(c=>c.id!==r.customer.id),r.customer]);onCustomerAdded?.(r.customer);setRentalCustomerId(r.customer.id);setCustomer(r.customer.name);setPhone(r.customer.phone);setRentalMode("existing");setCustomerNotice(r.customer.existing?"此電話已有顧客，已帶入既有資料。":"已新增顧客並帶入。");}catch{setError("新增結果待確認，請用電話搜尋核對後再試。");}finally{lock.current=false;}});}}>建立並帶入</button></>}{customerNotice&&<p role="status" className="col-span-full text-primary-700">{customerNotice}</p>}</>}
 {!rental&&!templateId&&<DashboardLink href={source?.catalogHref??"/dashboard/courses?view=catalog"} className="col-span-full underline">先設定教學項目的課程規則與教練</DashboardLink>}
 </fieldset>
 <div className="sm:sticky sm:bottom-0 flex justify-end border-t border-earth-100 bg-white py-3 col-span-full"><button className="min-h-11 rounded-lg bg-primary-700 px-6 text-white disabled:opacity-50" disabled={!ready||pending||(!rental&&!courseSchedulingModeAllowed(schedulingModes,enrollment==="指定學員"?"ASSIGNED":"OPEN"))||(rental&&(!rentalCustomerId||rentalMode!=="existing"))||(!rental&&(!templateId||!coach||(trial?!trialValid:enrollment==="指定學員"&&!students.length)))}>{pending?"新增中…":"新增"}</button></div>
 </form>;
}


export function SportsScheduleFields(props:Parameters<typeof SportsLessonFields>[0]){
 if(props.source?.reservation)return <ServiceReservationForm source={props.source.reservation} date={props.date} seed={props.seed} onGuard={props.onGuard} onCreated={props.onCreated}/>;
 return <SportsLessonFields {...props}/>;
}
