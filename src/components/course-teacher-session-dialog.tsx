"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadCourseTeacherSession, changeCourseTeacherSession } from "@/server/actions/course-teacher-session";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { ModalPanel } from "@/components/admin/modal-panel";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";

type Data = Extract<Awaited<ReturnType<typeof loadCourseTeacherSession>>, {success:true}>["data"];
export function CourseTeacherSessionDialog({sessionId,mode,name,close}:{sessionId:string;mode:"leave"|"reschedule";name:string;close:()=>void}) {
  const reader = usePanelReader("course-teacher-session",loadCourseTeacherSession);
  const [data,setData] = useState<Data|null>(null);
  const [reason,setReason] = useState("");
  const [date,setDate] = useState("");
  const [time,setTime] = useState("");
  const [error,setError] = useState("");
  const [saved,setSaved] = useState(false);
  const [uncertain,setUncertain] = useState(false);
  const [pending,start] = useTransition();
  const busy = useRef(false);
  const label = useId();
  const router = useRouter();
  useEffect(()=>{
    let active=true;
    void reader.read(sessionId,mode).then(r=>{if(active){if(r.success)setData(r.data);else setError(r.error);}}).catch(()=>{if(active)setError("讀取失敗，請返回後重試");});
    return ()=>{active=false;};
  },[reader,sessionId,mode]);
  function leave() {
    if (pending || busy.current) return;
    if (!saved&&!uncertain&&(reason||date||time)&&!window.confirm("放棄尚未送出的修改？")) return;
    close();
  }
  function submit() {
    if (!data||pending||busy.current||uncertain||!reason.trim()||(mode==="reschedule"&&(!date||!time))) return;
    busy.current=true;
    start(async()=>{
      setError("");
      try {
        const r=await changeCourseTeacherSession({sessionId,mode,reason,revision:data.revision,...(mode==="reschedule"?{date,time}:{})});
        if(r.success){reader.invalidate(sessionId,mode);setSaved(true);router.refresh();}
        else setError(r.error);
      } catch {setUncertain(true);setError("結果尚未確認，請返回課表核對後再操作");}
      finally {busy.current=false;}
    });
  }
  return <ModalPanel open onClose={leave} pending={pending} labelledById={label} width={620}>
    <header className="border-b border-earth-200 px-4 py-3"><h2 id={label} className="font-semibold">{mode==="leave"?"自己請假・整堂停課":"自己調課・整堂改時間"}</h2><p className="mt-1 break-words text-sm">{data?.name??name}</p></header>
    <div className="max-h-[65dvh] space-y-3 overflow-y-auto p-4">
      {!data&&!error&&<p role="status">核對課程與學員中…</p>}
      {data&&<><p>{formatTWDateTime(new Date(data.startsAt))} · {data.room}</p>
        {!saved&&<>
          {mode==="reschedule"&&<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3"><label>新日期<input aria-label="新日期" className="mt-1 min-h-11 w-full min-w-0 rounded-lg border p-2" type="date" min={toLocalDateStr()} value={date} disabled={pending||uncertain} onChange={e=>setDate(e.target.value)}/></label><label>新時間<select aria-label="新時間" className="mt-1 min-h-11 w-full rounded-lg border p-2" value={time} disabled={pending||uncertain} onChange={e=>setTime(e.target.value)}><option value="">請選擇</option>{Array.from({length:48},(_,i)=>`${String(Math.floor(i/2)).padStart(2,"0")}:${i%2?"30":"00"}`).map(t=><option key={t}>{t}</option>)}</select></label></div>}
          <label className="block">原因<textarea className="mt-1 min-h-20 w-full rounded-lg border p-2" maxLength={500} value={reason} disabled={pending||uncertain} onChange={e=>setReason(e.target.value)}/></label>
          <section className="rounded-lg bg-earth-50 p-3"><h3 className="font-medium">影響 {data.students.length} 位學員・僅這一堂</h3><ul className="mt-2 max-h-40 overflow-y-auto">{data.students.map(s=><li className="break-words py-1" key={s.id}>{s.name}</li>)}</ul>{!data.students.length&&<p>尚無學員</p>}{data.waiting.length>0&&<><h3 className="mt-2 font-medium">候補 {data.waiting.length} 位{mode==="leave"?"・將取消候補":"・隨課程改時間"}</h3><ul>{data.waiting.map(w=><li key={w.id} className="break-words py-1">{w.name}</li>)}</ul></>}</section>
          <p className="text-sm text-earth-600">{mode==="leave"?"整堂停課，釋放預留並依既有規則返還額度；體驗收款保留，退款由門市處理。":"全班移到新時間，原教室與課程時長保留；衝突或超過方案期限時不會修改。"}門市會收到異動紀錄。</p>
        </>}
      </>}
      {error&&<p role="alert" className="text-red-700">{error}</p>}
      {saved&&<p role="status">{mode==="leave"?"已請假，這一堂已停課":"已調課，課表已更新"}</p>}
    </div>
    <footer className="flex flex-wrap justify-end gap-2 border-t border-earth-200 p-3"><button className="min-h-11 rounded-lg border px-4" disabled={pending} onClick={leave}>{saved?"完成":"返回"}</button>{!saved&&<button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50" disabled={!data||pending||uncertain||!reason.trim()||(mode==="reschedule"&&(!date||!time))} onClick={submit}>{pending?"處理中…":mode==="leave"?"確認整堂停課":"確認整堂調課"}</button>}</footer>
  </ModalPanel>;
}
