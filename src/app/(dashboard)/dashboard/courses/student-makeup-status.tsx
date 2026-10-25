"use client";
import {useEffect,useId,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {ModalPanel} from "@/components/admin/modal-panel";
import {loadMusicStudentMakeups} from "@/server/actions/music-student-makeups";
import {createCourseBooking} from "@/server/actions/course-members";
import {formatTWDateTime} from "@/lib/date-utils";
import type {MusicLeaveWorkspace} from "@/server/queries/music-leave-workspace";

type Data=NonNullable<Extract<Awaited<ReturnType<typeof loadMusicStudentMakeups>>,{success:true}>["data"]>;
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
 const pending=value.rows.filter(r=>r.state==="待安排").length;
 const scheduled=value.rows.filter(r=>r.state==="已安排");
 const earliestScheduled=scheduled.flatMap(r=>r.booking?[r.booking.date]:[]).sort()[0];
 const completed=value.rows.every(r=>r.state==="已補課");
 const tone=completed?"text-earth-500":"text-primary-700";
 const issues=value.rows.filter(r=>r.state==="需處理"||r.state==="補課曠課").length;
 const summary=[pending?`待補課 ${pending} 堂`:"",scheduled.length?`已安排 ${scheduled.length} 堂${earliestScheduled?`・${scheduled.length>1?"最早 ":""}${formatTWDateTime(new Date(earliestScheduled))}`:""}`:"",issues?`補課待核對 ${issues} 堂`:""].filter(Boolean).join("・")||(completed?`已補課 ${value.rows.length} 堂`:"查看補課紀錄");
 const records=<StudentMakeupRecords data={value} onPending={setBusy} onUpdated={()=>{setTick(n=>n+1);onUpdated?.();router.refresh();}}/>;
 return compact?<>
  <button type="button" className={`min-h-11 break-words text-left text-sm ${tone} underline`} onClick={()=>setOpen(true)} aria-label={`${value.customerName}：${summary}`}>{summary}</button>
  <ModalPanel open={open} onClose={()=>setOpen(false)} pending={busy} labelledById={title} width={880}><header className="flex items-center justify-between gap-3 border-b border-earth-100 p-3"><h3 id={title} className="font-semibold">{value.customerName}・請假與補課</h3><button type="button" className={field} disabled={busy} onClick={()=>setOpen(false)}>關閉</button></header><div className="min-h-0 overflow-y-auto p-3">{records}</div></ModalPanel>
 </>:<section aria-label="學員請假與補課" className="space-y-2 border-t border-earth-100 pt-3"><h3 className="font-semibold">請假與補課 <span className={`font-normal ${tone}`}>{summary}</span></h3>{records}</section>;
}
function StudentMakeupRecords({data,onPending,onUpdated}:{data:Data;onPending:(value:boolean)=>void;onUpdated:()=>void}){
 const [locked,setLocked]=useState(false);
 return <div className="space-y-2">{data.truncated&&<p role="status">紀錄未完整載入，請先核對。</p>}{data.rows.map(row=><StudentMakeupRow key={row.id} row={row} canArrange={data.canArrange} locked={locked} onPending={value=>{setLocked(value);onPending(value);}} onUpdated={onUpdated}/>)}</div>;
}
function StudentMakeupRow({row,canArrange,locked,onPending,onUpdated}:{locked:boolean;row:MusicLeaveWorkspace["rows"][number];canArrange:boolean;onPending:(value:boolean)=>void;onUpdated:()=>void}){
 const [editing,setEditing]=useState(false),[sessionId,setSessionId]=useState(""),[requestKey,setRequestKey]=useState(""),[pending,setPending]=useState(false),[error,setError]=useState("");
 return <div className="rounded-lg border border-earth-200 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>{formatTWDateTime(new Date(row.date))}・{row.name}</span><strong className={row.state==="已補課"?"font-normal text-earth-500":"text-primary-700"}>{row.state==="待安排"?"待補課":row.state}</strong></div>{row.booking&&<p className="py-1">補課：{formatTWDateTime(new Date(row.booking.date))}</p>}{row.issue&&<p className="py-1 text-amber-800">{row.issue}</p>}{canArrange&&row.state==="待安排"&&!row.issue&&!editing&&<button type="button" className={`${field} mt-2`} disabled={locked} onClick={()=>{setEditing(true);setRequestKey(crypto.randomUUID());}}>安排補課</button>}
 {editing&&<form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async event=>{event.preventDefault();if(pending||locked||!sessionId||!row.cardId)return;setPending(true);onPending(true);setError("");try{const r=await createCourseBooking({sessionId,customerId:row.customerId,cardId:row.cardId,makeupForBookingId:row.separate?null:row.id,requestKey});if(!r.success){setError(r.error??"補課未完成，請重試");return;}setEditing(false);onUpdated();}catch{setError("連線未完成，請重試核對同一筆安排。");}finally{setPending(false);onPending(false);}}}><label className="min-w-0 flex-1">補課時段<select required aria-label="補課時段" className={`${field} mt-1 w-full`} disabled={pending||locked} value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">選擇補課時段</option>{row.sessions.map(s=><option key={s.id} value={s.id}>{formatTWDateTime(new Date(s.date))}・{s.name}</option>)}</select></label><button className={field} disabled={pending||locked||!sessionId}>{pending?"安排中…":"確認安排"}</button><button type="button" className={field} disabled={pending||locked} onClick={()=>setEditing(false)}>取消</button>{!row.sessions.length&&<p className="basis-full">沒有可用時段，請先在課表新增同教學項目時段。</p>}{error&&<p role="alert" className="basis-full text-red-700">{error}</p>}</form>}
 </div>;
}
