"use client";
import { useEffect, useState, useTransition, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { loadCourseBookingNotification, confirmMemberCourseTrial, rescheduleMemberCourseBooking } from "@/server/actions/course-booking-notification";
import { updateCourseBookingStatus } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { ModalPanel } from "@/components/admin/modal-panel";
type Data = Extract<Awaited<ReturnType<typeof loadCourseBookingNotification>>, {success:true}>;
export function CourseBookingNotificationDialog({bookingId,action,close,readOnly=false}:{bookingId:string;action:"confirm"|"reschedule"|"cancel";close:()=>void;readOnly?:boolean}) {
  const reader = usePanelReader("course-booking-notification", loadCourseBookingNotification, bookingId);
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[receipt,setReceipt]=useState(""),[sessionId,setSessionId]=useState("");
  const [pending,start]=useTransition();const router=useRouter();const labelId=useId();const busy=useRef(false);
  useEffect(()=>{let active=true;void reader.read(bookingId).then(r=>{if(!active)return;if(r.success)setData(r);else setError(r.error);}).catch(()=>{if(active)setError("讀取失敗，請關閉後重試。");});return()=>{active=false;};},[bookingId,reader]);
  const allowed=!!data?.booking.active && (action==="confirm" ? data.booking.trial&&Date.parse(data.booking.startsAt)>Date.now() : Date.parse(data.booking.cutoff)>Date.now());
  return <ModalPanel open onClose={()=>{if(!pending)close();}} pending={pending} labelledById={labelId}>
    <h2 id={labelId} className="px-4 pt-4 text-lg font-semibold">{action==="confirm"?"確認體驗會到":action==="reschedule"?"更改上課時段":"取消預約"}</h2>
    <div className="space-y-4 p-4">
      {!data&&!error&&<p role="status">讀取預約中…</p>}
      {data&&<><p className="font-semibold">{data.booking.customerName} · {data.booking.name}</p><p>{formatTWDateTime(new Date(data.booking.startsAt))}</p>
        {action!=="confirm"&&<p className="text-sm">自行改期／取消截止：{formatTWDateTime(new Date(data.booking.cutoff))}</p>}
        {!allowed&&<p>此預約已結束、取消或超過操作期限，請聯絡店家。</p>}
        {action==="confirm"&&<p>只確認您會到，不會報到、扣堂或登記收款。</p>}
        {action==="reschedule"&&allowed&&<><label className="block">新時段<select className="mt-2 min-h-11 w-full rounded-lg border p-2" value={sessionId} onChange={e=>setSessionId(e.target.value)} disabled={pending}><option value="">請選擇</option>{data.sessions.map(s=><option key={s.id} value={s.id}>{formatTWDateTime(new Date(s.startsAt))} · {s.room}</option>)}</select></label><p className="text-sm">若新時段已滿或不符合方案，原預約會保留。{!data.sessions.length&&"目前沒有可自行更換的時段，請聯絡店家。"}</p></>}
        {action==="cancel"&&<p>確認後將取消這位學員的預約；體驗費退款請另洽店家。</p>}
      </>}
      {error&&<p role="alert" className="text-red-700">{error}</p>}{receipt&&<p role="status">{receipt}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button className="min-h-11 rounded-lg border px-4" disabled={pending} onClick={close}>{receipt?"完成":"返回"}</button>
      {!receipt&&<button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50" disabled={readOnly||pending||!allowed||(action==="reschedule"&&!sessionId)} onClick={()=>{if(busy.current)return;busy.current=true;start(async()=>{setError("");try{const result=action==="confirm"?await confirmMemberCourseTrial(bookingId):action==="reschedule"?await rescheduleMemberCourseBooking({bookingId,sessionId}):await updateCourseBookingStatus({bookingId,status:"CANCELLED",member:true});if(result.success){reader.invalidate(bookingId);setReceipt(action==="confirm"?"已記錄您會到":action==="reschedule"?"已改期，請回我的預約查看新時段":"已取消預約");router.refresh();}else setError(result.error);}catch{setError("操作結果尚未確認，請重新查看預約後再試。");}finally{busy.current=false;}});}}>{pending?"處理中…":action==="confirm"?"確認會到":action==="reschedule"?"確認改期":"確認取消"}</button>}</div>
    </div>
  </ModalPanel>;
}
