"use client";
import {useRef,useState,useTransition} from "react";
import {RightSheet} from "@/components/admin/right-sheet";
import {CourseOptionSelect} from "@/components/admin/course-option-select";
import {moveCourseSessions} from "@/server/actions/course";
import type {CourseMoveClipboard} from "./course-schedule-board";
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-sm";
export function SportsMoveConfirm({clipboard,seed,rooms,coaches,onClose,onSaved}:{clipboard:CourseMoveClipboard;seed:{date:string;time:string;roomId:string;coachId:string};rooms:{id:string;name:string}[];coaches:{id:string;displayName:string}[];onClose:()=>void;onSaved:(date:string)=>void}){
 const [date,setDate]=useState(seed.date),[time,setTime]=useState(seed.time),[duration,setDuration]=useState(clipboard.durationMinutes),[roomId,setRoom]=useState(seed.roomId),[coachId,setCoach]=useState(seed.coachId),[error,setError]=useState("");
 const [pending,start]=useTransition(),lock=useRef(false);
 const end=Number(time.slice(0,2))*60+Number(time.slice(3))+duration;
 return <RightSheet open presentation="centered" width={760} labelledById="sports-move-title" onClose={()=>!pending&&onClose()}><header className="flex items-center justify-between border-b p-3"><h2 id="sports-move-title" className="font-semibold">貼上／確認調課</h2><button type="button" disabled={pending} className="min-h-11 px-3" onClick={onClose}>返回課表</button></header><form className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(lock.current)return;lock.current=true;setError("");start(async()=>{try{const result=await moveCourseSessions({id:clipboard.sessionId,scope:clipboard.scope,weeks:clipboard.weeks,...(clipboard.startsAt?{expectedStartsAt:clipboard.startsAt}:{}),date,time,durationMinutes:duration,roomId,coachId});if(!result.success){setError(result.error??"尚未調課");return;}onSaved(date);}catch{setError("連線失敗，請核對原課後重試；輸入已保留。");}finally{lock.current=false;}});}}>
 <p className="col-span-full font-medium">✂ {clipboard.label}</p><fieldset disabled={pending} className="contents">
 <label>新日期<input aria-label="調課日期" type="date" required className={field} value={date} onChange={e=>setDate(e.target.value)}/></label><label>開始時間<input aria-label="調課時間" type="time" step="300" required className={field} value={time} onChange={e=>setTime(e.target.value)}/></label>
 <label>時長（分鐘）<input aria-label="調課時長" type="number" min="5" max="480" required className={field} value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label><p className="self-end py-3 text-sm">結束 {String(Math.floor(end/60)%24).padStart(2,"0")}:{String(end%60).padStart(2,"0")}{end>=1440?"（次日）":""}</p>
 <label>空間<CourseOptionSelect searchable label="調課空間" required value={roomId} onChange={setRoom} options={rooms.map(r=>({id:r.id,label:r.name}))}/></label><label>教練<CourseOptionSelect searchable label="調課教練" required value={coachId} onChange={setCoach} options={coaches.map(c=>({id:c.id,label:c.displayName}))}/></label></fieldset>
 {error&&<p role="alert" className="col-span-full text-sm text-red-700">{error}</p>}<div className="col-span-full flex items-center justify-between gap-3 border-t pt-3"><span className="text-sm text-earth-600">{clipboard.scope==="SINGLE"?"只調整這一次":"依所選範圍調整"}</span><button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm text-white">{pending?"確認中…":"確認調課"}</button></div>
 </form></RightSheet>;
}
