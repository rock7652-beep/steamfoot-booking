"use client";
import { COURSE_SELF_BOOKING_DISABLED_MESSAGE } from "@/lib/course-self-booking";
import { useEffect, useState, useTransition, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { loadCourseBookingNotification, confirmMemberCourseTrial, rescheduleMemberCourseBooking } from "@/server/actions/course-booking-notification";
import { updateCourseBookingStatus } from "@/server/actions/course-members";
import { formatTWDateTime } from "@/lib/date-utils";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { ModalPanel } from "@/components/admin/modal-panel";

type Data = Extract<Awaited<ReturnType<typeof loadCourseBookingNotification>>, { success: true }>;
type Props = {
  bookingId: string;
  action: "confirm" | "reschedule" | "cancel";
  close: () => void;
  readOnly?: boolean;
  selfBookingEnabled?: boolean;
};

export function CourseBookingNotificationDialog({ bookingId, action, close, readOnly = false, selfBookingEnabled = true }: Props) {
  const reader = usePanelReader("course-booking-notification", loadCourseBookingNotification, bookingId);
  const [loaded, setLoaded] = useState<{ bookingId: string; data: Data } | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const labelId = useId();
  const busy = useRef(false);
  const data = loaded?.bookingId === bookingId ? loaded.data : null;

  useEffect(() => {
    let active = true;
    void reader.read(bookingId).then(result => {
      if (!active) return;
      if (result.success) setLoaded({ bookingId, data: result });
      else setError(result.error);
    }).catch(() => { if (active) setError("讀取失敗，請關閉後重試。"); });
    return () => { active = false; };
  }, [bookingId, reader]);

  // The fresh loader protects deep links; the parent flag also blocks an already-open dialog.
  const reschedulingBlocked = action === "reschedule" && (!selfBookingEnabled || data?.selfBookingEnabled === false);
  const allowed = !reschedulingBlocked && !!data?.booking.active && (action === "confirm"
    ? data.booking.trial && Date.parse(data.booking.startsAt) > Date.now()
    : Date.parse(data.booking.cutoff) > Date.now());

  function submit() {
    if (busy.current || readOnly || !allowed || (action === "reschedule" && !sessionId)) return;
    busy.current = true;
    start(async () => {
      setError("");
      try {
        const result = action === "confirm"
          ? await confirmMemberCourseTrial(bookingId)
          : action === "reschedule"
            ? await rescheduleMemberCourseBooking({ bookingId, sessionId })
            : await updateCourseBookingStatus({ bookingId, status: "CANCELLED", member: true });
        if (result.success) {
          reader.invalidate(bookingId);
          setReceipt(action === "confirm" ? "已記錄您會到" : action === "reschedule" ? "已改期，請回我的預約查看新時段" : "已取消預約");
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("操作結果尚未確認，請重新查看預約後再試。");
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <ModalPanel open onClose={() => { if (!pending) close(); }} pending={pending} labelledById={labelId}>
      <h2 id={labelId} className="px-4 pt-4 text-lg font-semibold">{action === "confirm" ? "確認體驗會到" : action === "reschedule" ? "更改上課時段" : "取消預約"}</h2>
      <div className="space-y-4 p-4">
        {!data && !error && <p role="status">讀取預約中…</p>}
        {data && <>
          <p className="font-semibold">{data.booking.customerName} · {data.booking.name}</p>
          <p>{formatTWDateTime(new Date(data.booking.startsAt))}</p>
          {action !== "confirm" && <p className="text-sm">自行{selfBookingEnabled && data.selfBookingEnabled !== false ? "改期／" : ""}取消截止：{formatTWDateTime(new Date(data.booking.cutoff))}</p>}
          {reschedulingBlocked ? <p>{COURSE_SELF_BOOKING_DISABLED_MESSAGE}</p> : !allowed && <p>此預約已結束、取消或超過操作期限，請聯絡店家。</p>}
          {action === "confirm" && <p>只確認您會到，不會報到、扣堂或登記收款。</p>}
          {action === "reschedule" && allowed && <>
            <label className="block">新時段<select className="mt-2 min-h-11 w-full rounded-lg border p-2" value={sessionId} onChange={event => setSessionId(event.target.value)} disabled={pending}>
              <option value="">請選擇</option>
              {data.sessions.map(session => <option key={session.id} value={session.id}>{formatTWDateTime(new Date(session.startsAt))} · {session.room}</option>)}
            </select></label>
            <p className="text-sm">若新時段已滿或不符合方案，原預約會保留。{!data.sessions.length && "目前沒有可自行更換的時段，請聯絡店家。"}</p>
          </>}
          {action === "cancel" && <p>確認後將取消這位學員的預約；體驗費退款請另洽店家。</p>}
        </>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {receipt && <p role="status">{receipt}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="min-h-11 rounded-lg border px-4" disabled={pending} onClick={close}>{receipt ? "完成" : "返回"}</button>
          {!receipt && !reschedulingBlocked && <button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-50" disabled={readOnly || pending || !allowed || (action === "reschedule" && !sessionId)} onClick={submit}>
            {pending ? "處理中…" : action === "confirm" ? "確認會到" : action === "reschedule" ? "確認改期" : "確認取消"}
          </button>}
        </div>
      </div>
    </ModalPanel>
  );
}
