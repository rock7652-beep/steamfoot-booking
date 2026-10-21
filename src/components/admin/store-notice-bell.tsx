"use client";
import {useCallback,useEffect,useId,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {RightSheet} from "./right-sheet";
import {rosterStatusButtonClassName} from "./roster-primitives";
import {STORE_NOTICE_LABELS,type StoreNoticeItem,type StoreNoticeLoadResult,type StoreNoticeMarkResult} from "@/lib/store-notices";
import {formatTWDateTime} from "@/lib/date-utils";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {NotificationSwitch} from "./notification-switch";
function noticeTime(value:string){return formatTWDateTime(new Date(value));}
export function StoreNoticeBell({storeId,namespace,initialEnabled=false,loadNotices,markNotice,onViewTarget,targetLabel="查看預約",refreshKey=0,labels=STORE_NOTICE_LABELS}:{
 storeId:string;namespace:"course"|"steamfoot";initialEnabled?:boolean;
 loadNotices:(input:{storeId:string;handled:boolean;offset:number;summaryOnly?:boolean})=>Promise<StoreNoticeLoadResult>;
 markNotice:(input:{storeId:string;id:string;handled:boolean;revision:number})=>Promise<StoreNoticeMarkResult>;
 labels?:Partial<Record<StoreNoticeItem["kind"],string>>;
 onViewTarget?:(notice:StoreNoticeItem,canHandle:boolean)=>void;targetLabel?:string;refreshKey?:number;
}) {
 const [enabled,setEnabled]=useState(initialEnabled),[open,setOpen]=useState(false),[handled,setHandled]=useState(false);
 const [items,setItems]=useState<StoreNoticeItem[]>([]),[count,setCount]=useState(0),[canHandle,setCanHandle]=useState(false),[more,setMore]=useState(false);
 const [offset,setOffset]=useState(0),[expanded,setExpanded]=useState<string|null>(null),[error,setError]=useState("");
 const [rowError,setRowError]=useState<Record<string,string>>({}),[pending,setPending]=useState<string|null>(null),[sound,setSound]=useState(false),[loading,setLoading]=useState(true);
 const [undo,setUndo]=useState<StoreNoticeItem|null>(null);const heading=useId();
 const reader=usePanelReader(`${namespace}-store-notices`,loadNotices,storeId,0);
 const [countKnown,setCountKnown]=useState(false);
 const generation=useRef(0),busy=useRef(false),mounted=useRef(true),seen=useRef<number|null>(null),soundRef=useRef(false);
 const audio=useRef<AudioContext|null>(null);const soundKey=`${namespace}-notice-sound:${storeId}`;
 const load=useCallback(async()=>{
  if(busy.current)return;const seq=++generation.current;setLoading(true);
  try{const r=await reader.read({storeId,handled:open?handled:false,offset:open?offset:0,summaryOnly:!open});if(!mounted.current||seq!==generation.current)return;
   if(!r.success){setError(r.error);return;}if(r.storeId!==storeId)return;
   setEnabled(r.enabled);if(!r.enabled)setOpen(false);
   setCount(r.count);setCountKnown(true);setError("");
   if(open){setItems(r.items);setCanHandle(r.canHandle);setMore(r.more);}
   if(seen.current!==null&&r.count>seen.current&&soundRef.current&&audio.current?.state==="running"){
    const oscillator=audio.current.createOscillator(),gain=audio.current.createGain();oscillator.connect(gain);gain.connect(audio.current.destination);gain.gain.value=.06;oscillator.frequency.value=660;oscillator.start();oscillator.stop(audio.current.currentTime+.12);
   }seen.current=r.count;
  }catch{if(mounted.current&&seq===generation.current)setError("通知更新失敗，請重試");}finally{if(mounted.current&&seq===generation.current)setLoading(false);}
 },[storeId,handled,offset,open,reader]);
 useEffect(()=>{mounted.current=true;const requestGeneration=generation;return()=>{mounted.current=false;requestGeneration.current++;void audio.current?.close();};},[]);
 useEffect(()=>{try{const s=localStorage.getItem(soundKey)==="on";soundRef.current=s;setSound(s);}catch{}},[soundKey]);
 useEffect(()=>{
  const requestGeneration=generation;void load();const refresh=()=>{if(document.visibilityState==="visible")void load();};
  const timer=setInterval(refresh,60000);document.addEventListener("visibilitychange",refresh);window.addEventListener("focus",refresh);window.addEventListener(`${namespace}-notices-setting`,refresh);
  return()=>{requestGeneration.current++;clearInterval(timer);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("focus",refresh);window.removeEventListener(`${namespace}-notices-setting`,refresh);};
 },[load,namespace,refreshKey]);
 async function toggle(n:StoreNoticeItem) {
  if(busy.current||!canHandle)return;busy.current=true;generation.current++;reader.clear();setPending(n.id);setRowError({});setError("");
  const previous=items,oldCount=count;const target=!n.handledAt;
  setItems(list=>list.filter(i=>i.id!==n.id));setCount(c=>Math.max(0,c+(target?-1:1)));
  try{const r=await markNotice({storeId,id:n.id,handled:target,revision:n.revision});if(!mounted.current)return;
   if(!r.success){setItems(previous);setCount(oldCount);setRowError({[n.id]:r.error});if(!previous.some(i=>i.id===n.id))setError(r.error);}
   else{setUndo(target?{...n,...r.data}:null);}
  }catch{if(mounted.current){setItems(previous);setCount(oldCount);setRowError({[n.id]:"儲存結果未確認，請重試核對"});}}
  finally{busy.current=false;if(mounted.current){setPending(null);void load();}}
 }
 useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),7000);return()=>clearTimeout(timer);},[undo]);
 if(!enabled)return null;
 return <>
  <button type="button" className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-primary-800 hover:bg-earth-50" aria-label={countKnown?`門市通知，${count} 筆待處理`:"門市通知"} aria-expanded={open} onClick={()=>{if(open)void load();else setOpen(true);if(sound){audio.current??=new AudioContext();void audio.current.resume();}}}>
   <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
   {count>0&&<span className="absolute right-0 top-0 rounded-full bg-amber-600 px-1.5 text-sm text-white">{count>99?"99+":count}</span>}
  </button>
  {open&&createPortal(<RightSheet open compact fixedHeight width={560} labelledById={heading} onClose={()=>setOpen(false)}>
   <div className="flex h-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center justify-between border-b border-earth-200 px-3 py-1"><h2 id={heading} className="text-base font-semibold text-primary-900">門市通知</h2><button className="min-h-11 min-w-11 text-xl" aria-label="關閉通知" onClick={()=>setOpen(false)}>×</button></div>
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-earth-200 px-3"><div role="tablist" aria-label="處理狀態" className="flex">
     {[false,true].map(h=><button key={String(h)} role="tab" aria-selected={handled===h} disabled={!!pending} className={`min-h-11 border-b-2 px-3 text-sm ${handled===h?"border-primary-700 font-semibold text-primary-800":"border-transparent text-earth-600"}`} onClick={()=>{if(h===handled)return;generation.current++;setItems([]);setLoading(true);setError("");setRowError({});setHandled(h);setOffset(0);setExpanded(null);}}>{h?"已處理":`待處理 ${count}`}</button>)}
    </div><label className="ml-auto flex min-h-11 items-center gap-2 text-sm">提示音<NotificationSwitch aria-label="此裝置提示音" checked={sound} onChange={e=>{const s=e.target.checked;setSound(s);soundRef.current=s;try{localStorage.setItem(soundKey,s?"on":"off");}catch{}if(s){audio.current??=new AudioContext();void audio.current.resume();}}}/></label></div>
    <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
     {error&&<div role="alert" className="flex items-center justify-between px-3 py-2 text-sm text-red-700">{error}<button className="min-h-11 px-2" onClick={()=>void load()}>重試</button></div>}
     {loading&&!items.length&&<p className="p-3 text-sm text-earth-500" role="status">讀取中…</p>}
     {!loading&&!items.length&&!error&&<p className="p-3 text-sm text-earth-500">{handled?"尚無已處理通知":"沒有待處理通知"}</p>}
     {items.map(n=><div key={n.id} className="border-b border-earth-100 text-sm">
      <div className="flex items-center gap-1 px-2 py-1 hover:bg-earth-50">
       <button type="button" className={`${rosterStatusButtonClassName} ${n.handledAt?"text-primary-700":"text-earth-400"}`} disabled={!canHandle||!!pending} aria-label={`${n.handledAt?"恢復待處理":"標記已處理"}：${n.customerName}`} aria-pressed={!!n.handledAt} onClick={()=>void toggle(n)}><span className="text-lg font-semibold" aria-hidden="true">{n.handledAt?"O":"○"}</span></button>
       <button className="min-h-11 min-w-0 flex-1 text-left" aria-expanded={expanded===n.id} onClick={()=>setExpanded(expanded===n.id?null:n.id)}>
        <span className="flex flex-wrap gap-x-2"><strong className="break-words text-earth-900">{n.customerName}</strong><span className="text-primary-700">{labels[n.kind]??STORE_NOTICE_LABELS[n.kind]}</span>{n.affectedCount>1&&<span className="text-earth-500">{n.affectedCount} 人</span>}</span>
        <span className="block break-words text-earth-600">{n.previousStartsAt?`${noticeTime(n.previousStartsAt)} → `:""}{noticeTime(n.startsAt)}・{n.previousCoachName&&n.previousCoachName!==n.coachName?`${n.previousCoachName} → `:""}{n.coachName}</span>
       </button>
      </div>
      {rowError[n.id]&&<p role="alert" className="px-3 pb-2 text-red-700">{rowError[n.id]}</p>}
      {expanded===n.id&&<div className="space-y-1 bg-earth-50 px-4 py-2 pl-14 text-earth-600"><p>{n.courseName}</p><p>異動：{noticeTime(n.updatedAt)}</p>{n.handledAt&&<p>{n.handledByName}・{noticeTime(n.handledAt)} 已處理</p>}{!!n.details&&typeof n.details==="object"&&"students" in n.details&&Array.isArray(n.details.students)&&<p className="break-words">{n.details.students.filter(s=>typeof s==="string").join("、")}</p>}{n.canViewCourse&&onViewTarget&&<button type="button" className="min-h-11 px-2 font-semibold text-primary-700 underline" onClick={()=>onViewTarget(n,canHandle)}>{targetLabel}</button>}</div>}
     </div>)}
     {(offset>0||more)&&<div className="flex justify-between p-2"><button disabled={offset===0||!!pending} className="min-h-11 px-3 disabled:opacity-30" onClick={()=>setOffset(v=>Math.max(0,v-50))}>上一頁</button><button disabled={!more||!!pending} className="min-h-11 px-3 disabled:opacity-30" onClick={()=>setOffset(v=>v+50)}>下一頁</button></div>}
    </div>
    {undo&&<div role="status" className="flex shrink-0 items-center justify-between border-t border-earth-200 px-3 text-sm">已處理<button disabled={!!pending} className="min-h-11 px-3 font-semibold text-primary-700" onClick={()=>void toggle(undo)}>復原</button></div>}
   </div>
  </RightSheet>,document.body)}

 </>;
}
