"use client";
import {useEffect,useId,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {ModalPanel} from "@/components/admin/modal-panel";
import {loadMusicStudentMakeups,loadMusicMakeupScheduleOptions,createMusicStudentMakeupSchedule} from "@/server/actions/music-student-makeups";
import {createCourseBooking} from "@/server/actions/course-members";
import {formatTWDateTime,toLocalDateStr} from "@/lib/date-utils";
import type {MusicLeaveWorkspace} from "@/server/queries/music-leave-workspace";

type Data=NonNullable<Extract<Awaited<ReturnType<typeof loadMusicStudentMakeups>>,{success:true}>["data"]>;
type Options=Extract<Awaited<ReturnType<typeof loadMusicMakeupScheduleOptions>>,{success:true}>["data"];
const field="min-h-11 min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-sm";
export function StudentMakeupStatus({customerId,revision="",compact=false,onUpdated,onPendingChange}:{customerId:string;revision?:string;compact?:boolean;onUpdated?:()=>void;onPendingChange?:(value:boolean)=>void}){
 const title=useId(),params=useSearchParams(),router=useRouter();
 const scope=params.get("dataScope")==="legacy"?"legacy":"operational";
 const reader=usePanelReader("music-student-makeups",loadMusicStudentMakeups);
 const [data,setData]=useState<{customerId:string;value:Data|null}|null>(null),[error,setError]=useState(""),[tick,setTick]=useState(0),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;reader.invalidate(customerId,scope);void reader.read(customerId,scope).then(r=>{if(!active)return;if(r.success){setData({customerId,value:r.data??null});setError("");}else setError(r.error??"補課紀錄讀取失敗");}).catch(()=>{if(active)setError("補課紀錄讀取失敗");});return()=>{active=false;};},[customerId,scope,revision,tick,reader]);
 useEffect(()=>{onPendingChange?.(busy);return()=>onPendingChange?.(false);},[busy,onPendingChange]);
 const value=data?.customerId===customerId?data.value:null;
 if(error)return <button type="button" className="min-h-11 text-sm text-amber-800" onClick={()=>setTick(n=>n+1)}>補課紀錄：重試</button>;
 if(!value?.rows.length)return null;
 const pending=value.rows.filter(r=>r.state==="待安排").length,scheduled=value.rows.filter(r=>r.state==="已安排").length,issues=value.rows.filter(r=>r.state==="需處理"||r.state==="補課曠課").length;
 const summary=[pending?`待補 ${pending}`:"",scheduled?`已排補 ${scheduled}`:"",issues?`待核對 ${issues}`:""].filter(Boolean).join("・");
 const records=<StudentMakeupRecords data={value} scope={scope} onPending={setBusy} onUpdated={()=>{setTick(n=>n+1);onUpdated?.();router.refresh();}}/>;
 if(compact&&!summary)return null;
 return <>
  {compact?<button type="button" className="inline-flex min-h-11 items-center text-left text-sm text-primary-700" onClick={()=>setOpen(true)} aria-label={`${value.customerName}：${summary}`}><span className="rounded bg-primary-50 px-1.5 py-0.5">{summary}</span></button>:<section aria-label="學員請假與補課" className="flex flex-wrap items-center gap-x-3 border-y border-earth-100 py-1 text-sm"><h3 className="font-semibold">補課</h3><span className={summary?"text-primary-700":"text-earth-500"}>{summary||"歷史紀錄"}</span><button type="button" className="ml-auto min-h-11 text-primary-700" onClick={()=>setOpen(true)} aria-label={`${value.customerName}：查看補課`}>查看</button></section>}
  <ModalPanel open={open} onClose={()=>setOpen(false)} pending={busy} labelledById={title} width={880}><header className="flex items-center justify-between gap-3 border-b border-earth-100 p-3"><h3 id={title} className="font-semibold">{value.customerName}・請假與補課</h3><button type="button" className={field} disabled={busy} onClick={()=>setOpen(false)}>關閉</button></header><div className="min-h-0 overflow-y-auto p-3">{records}</div></ModalPanel>
 </>;
}
function StudentMakeupRecords({data,scope,onPending,onUpdated}:{data:Data;scope:"operational"|"legacy";onPending:(value:boolean)=>void;onUpdated:()=>void}){
 const [locked,setLocked]=useState(false);
 return <div className="space-y-2">{data.truncated&&<p role="status">紀錄未完整載入，請先核對。</p>}{data.rows.map(row=><StudentMakeupRow key={row.id} row={row} scope={scope} canArrange={data.canArrange} locked={locked} onPending={value=>{setLocked(value);onPending(value);}} onUpdated={onUpdated}/>)}</div>;
}
function StudentMakeupRow({row,scope,canArrange,locked,onPending,onUpdated}:{locked:boolean;row:MusicLeaveWorkspace["rows"][number];scope:"operational"|"legacy";canArrange:boolean;onPending:(value:boolean)=>void;onUpdated:()=>void}){
 const [editing,setEditing]=useState(false),[mode,setMode]=useState<"existing"|"new">("existing"),[sessionId,setSessionId]=useState(""),[requestKey,setRequestKey]=useState(""),[pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState("");
 const [options,setOptions]=useState<Options|null>(null),[optionsError,setOptionsError]=useState(""),[retry,setRetry]=useState(0);
 const [date,setDate]=useState(""),[time,setTime]=useState(""),[roomId,setRoomId]=useState(""),[coachId,setCoachId]=useState("");
 const optionsReader=usePanelReader("music-makeup-schedule-options",loadMusicMakeupScheduleOptions);
 useEffect(()=>{if(!editing||mode!=="new")return;let active=true;setOptionsError("");void optionsReader.read(row.customerId,row.id,scope).then(result=>{if(!active)return;if(result.success)setOptions(result.data);else setOptionsError(result.error??"無法載入補課選項");}).catch(()=>{if(active)setOptionsError("無法載入補課選項");});return()=>{active=false;};},[editing,mode,row.customerId,row.id,scope,optionsReader,retry]);
 const blocked=pending||locked&&!uncertain;
 return <div className="rounded-lg border border-earth-200 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>{formatTWDateTime(new Date(row.date))}・{row.name}</span><strong className={row.state==="已補課"?"font-normal text-earth-500":"text-primary-700"}>{row.state==="待安排"?"待補課":row.state}</strong></div>{row.booking&&<p className="py-1">補課：{formatTWDateTime(new Date(row.booking.date))}</p>}{row.issue&&<p className="py-1 text-amber-800">{row.issue}</p>}{canArrange&&row.state==="待安排"&&!row.issue&&!editing&&<button type="button" className={`${field} mt-2`} disabled={locked} onClick={()=>{setEditing(true);setRequestKey(crypto.randomUUID());}}>安排補課</button>}
 {editing&&<form className="mt-2 space-y-3" onSubmit={async event=>{event.preventDefault();if(blocked||!row.cardId||mode==="existing"&&!sessionId)return;setPending(true);onPending(true);setError("");let unknown=false;try{const result=mode==="existing"?await createCourseBooking({sessionId,customerId:row.customerId,cardId:row.cardId,makeupForBookingId:row.separate?null:row.id,requestKey}):await createMusicStudentMakeupSchedule({sourceId:row.id,customerId:row.customerId,date,time,roomId,coachId,requestKey,dataScope:scope});setUncertain(false);if(!result.success){setError(result.error??"補課未完成，請重試");return;}setEditing(false);onUpdated();}catch{unknown=true;setUncertain(true);setError("結果尚未確認，請重試核對同一筆安排。");}finally{setPending(false);onPending(unknown);}}}>
 <div className="flex flex-wrap gap-2" role="group" aria-label="補課安排方式">{([["existing","選現有課程"],["new","新增補課時段"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} disabled={blocked||uncertain} className={`${field} ${mode===value?"!bg-primary-50 text-primary-800":""}`} onClick={()=>{setMode(value);setError("");}}>{label}</button>)}</div>
 {mode==="existing"?<label className="block">補課時段<select required aria-label="補課時段" className={`${field} mt-1 w-full`} disabled={blocked||uncertain} value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">選擇補課時段</option>{row.sessions.map(s=><option key={s.id} value={s.id}>{formatTWDateTime(new Date(s.date))}・{s.name}</option>)}</select>{!row.sessions.length&&<span className="mt-1 block text-earth-600">目前沒有可用課程，可改選「新增補課時段」。</span>}</label>:<>
 {!options&& !optionsError&&<p role="status">讀取可用教師與教室…</p>}{optionsError&&<div role="alert">{optionsError}<button type="button" className={field} onClick={()=>{optionsReader.invalidate(row.customerId,row.id,scope);setRetry(n=>n+1);}}>重試</button></div>}
 {options&&<><p>{options.name}・{options.durationMinutes} 分鐘</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label>日期<input required type="date" aria-label="補課日期" min={toLocalDateStr()} value={date} disabled={blocked||uncertain} className={`${field} mt-1 w-full`} onChange={e=>setDate(e.target.value)}/></label><label>時間<input required type="time" aria-label="補課時間" step={1800} value={time} disabled={blocked||uncertain} className={`${field} mt-1 w-full`} onChange={e=>setTime(e.target.value)}/></label><label>教師<select required aria-label="補課教師" className={`${field} mt-1 w-full`} value={coachId} disabled={blocked||uncertain} onChange={e=>setCoachId(e.target.value)}><option value="">選擇教師</option>{options.teachers.map(t=><option key={t.id} value={t.id}>{t.displayName}</option>)}</select></label><label>教室<select required aria-label="補課教室" className={`${field} mt-1 w-full`} value={roomId} disabled={blocked||uncertain} onChange={e=>setRoomId(e.target.value)}><option value="">選擇教室</option>{options.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div></>}
 </>}
 <div className="flex flex-wrap justify-end gap-2"><button type="button" className={field} disabled={blocked||uncertain} onClick={()=>{setEditing(false);setError("");}}>取消</button><button className={`${field} !bg-primary-700 !text-white`} disabled={blocked||(mode==="existing"?!sessionId:!options||!date||!time||!roomId||!coachId)}>{pending?"安排中…":uncertain?"重試同一筆安排":"確認安排"}</button></div>{error&&<p role="alert" className="text-red-700">{error}</p>}
 </form>}
 </div>;
}
