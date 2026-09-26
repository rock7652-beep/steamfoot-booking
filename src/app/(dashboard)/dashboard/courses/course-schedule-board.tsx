"use client";

import React from "react";

import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import { normalizeAvailabilityPeriods, periodContains, minuteOfDay } from "@/lib/course-availability";
import { getMusicSlotMatches, type MusicSlotMatch } from "@/server/actions/course-slot-matches";
import { courseAttendanceProgress } from "@/lib/course-attendance-visual";

export type CourseScheduleMode = "month" | "week" | "day";

type Booking = {
  customerId: string;
  customerName: string;
  status: string;
  bookingKind: string;
  checkedInAt?: string | null;
};

type Session = {
  id: string;
  templateId: string;
  nameSnapshot: string;
  startsAt: string;
  endsAt: string;
  coachId: string;
  roomId: string;
  capacity: number;
  pointCost: number;
  requestKey?: string;
  isFixed?: boolean;
  isBiweekly?: boolean;
  rescheduledFromStartsAt?: string | null;
  rescheduledFromEndsAt?: string | null;
  rescheduledFromRoomId?: string | null;
  rescheduledFromCoachId?: string | null;
  rescheduleKind?: string | null;
  rescheduledAt?: string | null;
  bookings: Booking[];
};

type Room = {
  id: string;
  name: string;
  isActive: boolean;
};

type Coach = {
  id: string;
  displayName: string;
  status: string;
  courseCoachEnabled: boolean;
  courseQualificationsConfirmed?: boolean;
  courseQualifiedTemplateIds?: string[];
};

type Template = {
  id: string;
  name: string;
  classType?: string | null;
};

export type CourseMoveClipboard = {
  sessionId: string;
  templateId: string;
  coachId: string;
  roomId: string;
  durationMinutes: number;
  scope: "SINGLE" | "WEEKS" | "FUTURE";
  weeks?: number;
  label: string;
};

type Props = {
  businessProfile: "FITNESS" | "MUSIC";
  mode: Exclude<CourseScheduleMode, "month">;
  selectedDate: string;
  today: string;
  sessions: Session[];
  leaveCounts?: Record<string, number>;
  rooms: Room[];
  coaches: Coach[];
  templates: Template[];
  pending?: boolean;
  storePeriods: {openTime:string;closeTime:string}[];
  staffAvailability: {staffId:string;dayOfWeek:number;segments:unknown}[];
  staffAvailabilityExceptions: {staffId:string;date:string;type:string;segments:unknown;reason:string|null}[];
  onOpenEmpty: (value:{time:string;roomId?:string;coachId?:string;durationMinutes?:number})=>void;
  moveClipboard?: CourseMoveClipboard | null;
  onPasteMove?: (value:{time:string;roomId:string;coachId:string})=>void;
  onSelectDate: (date: string) => void;
  onOpenSession: (sessionId: string, date: string) => void;
  readOnly?: boolean;
};

type ResourceView = "room" | "coach";
type QuickFilter = "all" | "trial" | "near-full" | "full" | "pending";

const tab =
  "min-h-8 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50";

function hhmm(iso: string) {
  return formatTWDateTime(new Date(iso)).slice(11);
}

function sessionDate(session: Session) {
  return toLocalDateStr(new Date(session.startsAt));
}

function sessionDurationMinutes(session: Session) {
  return Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000));
}

function firstCustomer(session: Session) {
  return session.bookings.find((booking) => booking.customerName.trim())?.customerName.trim() ?? "";
}

function isTrial(session: Session) {
  return session.bookings.some((booking) => booking.bookingKind === "TRIAL");
}

function pendingCheckins(session: Session) {
  return session.bookings.filter(
    (booking) => !["CHECKED_IN", "ATTENDED", "NO_SHOW", "CANCELLED"].includes(booking.status),
  ).length;
}

function openSeats(session: Session) {
  return Math.max(0, session.capacity - session.bookings.length);
}

function isFull(session: Session) {
  return session.bookings.length >= session.capacity;
}

function isNearFull(session: Session) {
  const remaining = openSeats(session);
  return remaining > 0 && remaining <= 2;
}

function filterSession(session: Session, filter: QuickFilter) {
  if (filter === "trial") return isTrial(session);
  if (filter === "near-full") return isNearFull(session);
  if (filter === "full") return isFull(session);
  if (filter === "pending") return pendingCheckins(session) > 0;
  return true;
}

function weekStart(date: string) {
  const day = parseLocalDate(date).getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addTaiwanDuration(date, offset, "DAY");
}

function shortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function adaptiveCopy(
  session: Session,
  templates: Template[],
  coaches: Coach[],
  rooms: Room[],
  businessProfile: "FITNESS" | "MUSIC",
) {
  const template = templates.find((item) => item.id === session.templateId);
  const coach =
    coaches.find((item) => item.id === session.coachId)?.displayName ?? (businessProfile === "MUSIC" ? "未指定老師" : "未指定教練");
  const room = rooms.find((item) => item.id === session.roomId)?.name ?? "未指定教室";
  const privateClass = template?.classType === "PRIVATE";
  const customer = firstCustomer(session);

  return {
    privateClass,
    primary: privateClass && customer ? customer : session.nameSnapshot,
    secondary: privateClass
      ? session.nameSnapshot
      : `${session.bookings.length} / ${session.capacity} 人`,
    coach,
    room,
  };
}

function SessionCard({
  session,
  templates,
  coaches,
  rooms,
  compact = false,
  dense = false,
  resourceView,
  businessProfile,
  fixed = false,
  leaveCount = 0,
  onOpen,
  readOnly = false,
}: {
  session: Session;
  templates: Template[];
  coaches: Coach[];
  rooms: Room[];
  compact?: boolean;
  dense?: boolean;
  resourceView?: ResourceView;
  businessProfile: "FITNESS" | "MUSIC";
  fixed?: boolean;
  leaveCount?: number;
  onOpen: () => void;
  readOnly?: boolean;
}) {
  const copy = adaptiveCopy(session, templates, coaches, rooms, businessProfile);
  const seats = openSeats(session);
  const musicDense = dense && businessProfile === "MUSIC";
  const moved = Boolean(session.rescheduledFromStartsAt);
  const substitute = !moved && Boolean(session.rescheduledFromCoachId && session.rescheduledFromCoachId !== session.coachId);
  const scheduleType = fixed ? (session.isBiweekly ? "隔週固定" : "每週固定") : "約課";
  const primaryType = isTrial(session) ? "體驗" : substitute ? "代課" : moved ? "調課" : !copy.privateClass ? "團體" : fixed ? session.isBiweekly ? "隔週" : "每週" : "約課";
  const typeBadge = isTrial(session) ? "bg-orange-100 text-orange-900" : substitute || moved ? "bg-amber-100 text-amber-900" : !copy.privateClass ? "bg-purple-100 text-purple-900" : fixed ? session.isBiweekly ? "bg-blue-100 text-blue-900" : "bg-teal-100 text-teal-900" : "bg-amber-100 text-amber-900";
  const secondaryType = ["體驗", "代課", "調課", "團體"].includes(primaryType) ? scheduleType : "";
  const activeBookings = session.bookings.filter((booking) => booking.status !== "CANCELLED");
  const attendance = courseAttendanceProgress(session.bookings, leaveCount);
  const attendanceComplete = businessProfile === "MUSIC"
    ? attendance.complete
    : activeBookings.length > 0 && activeBookings.every((booking) => booking.status === "ATTENDED");
  const attendanceLabel = attendance.total > 0 ? `已處理 ${attendance.processed}/${attendance.total}` : "尚無學員";
  const musicColor = isTrial(session)
    ? attendanceComplete ? "border-orange-200 border-l-[3px] border-l-orange-700 bg-orange-50/70" : "border-orange-200 border-l-[3px] border-l-orange-400 bg-orange-50/70"
    : substitute || moved
      ? attendanceComplete ? "border-amber-200 border-l-[3px] border-l-amber-700 bg-amber-50/70" : "border-amber-200 border-l-[3px] border-l-amber-400 bg-amber-50/70"
      : !copy.privateClass
        ? attendanceComplete ? "border-purple-200 border-l-[3px] border-l-purple-700 bg-purple-50/70" : "border-purple-200 border-l-[3px] border-l-purple-400 bg-purple-50/70"
        : fixed
          ? session.isBiweekly
            ? attendanceComplete ? "border-blue-200 border-l-[3px] border-l-blue-700 bg-blue-50/70" : "border-blue-200 border-l-[3px] border-l-blue-400 bg-blue-50/70"
            : attendanceComplete ? "border-teal-200 border-l-[3px] border-l-teal-700 bg-teal-50/70" : "border-teal-200 border-l-[3px] border-l-teal-400 bg-teal-50/70"
          : attendanceComplete ? "border-amber-200 border-l-[3px] border-l-amber-700 bg-amber-50/70" : "border-amber-200 border-l-[3px] border-l-amber-400 bg-amber-50/70";
  const showCapacityState = !musicDense || !copy.privateClass;
  const brief = sessionDurationMinutes(session) <= 30;
  const studentLabel = copy.privateClass ? copy.primary : `${copy.primary} · ${attendance.total} 人`;
  const originalCoach = substitute ? coaches.find((coach) => coach.id === session.rescheduledFromCoachId)?.displayName : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={readOnly}
      className={`w-full rounded-md border text-left transition ${dense ? "h-full overflow-hidden px-1.5 py-0.5" : "p-2"} hover:border-primary-300 hover:bg-primary-50/40 focus:outline-none focus:ring-2 focus:ring-primary-200 ${businessProfile === "MUSIC" ? musicColor : moved ? "border-indigo-200 bg-indigo-50/80" : "border-earth-200 bg-white"} ${attendanceComplete && businessProfile !== "MUSIC" && !musicDense ? "border-l-4 border-l-emerald-500" : ""}`}
      title={`${hhmm(session.startsAt)} ${businessProfile === "MUSIC" ? studentLabel : copy.primary} · ${copy.coach}${businessProfile === "MUSIC" && originalCoach ? `（代替 ${originalCoach}）` : ""} · ${copy.room}${businessProfile === "MUSIC" ? ` · ${primaryType}${secondaryType ? ` · ${secondaryType}` : ""} · ${attendanceLabel}` : fixed ? ` · ${session.isBiweekly ? "隔週固定" : "每週固定"}` : ""}`}
      aria-label={`${businessProfile === "MUSIC" ? studentLabel : copy.primary}，${hhmm(session.startsAt)}，${copy.coach}${businessProfile === "MUSIC" && originalCoach ? `代替 ${originalCoach}` : ""}${businessProfile === "MUSIC" ? `，${primaryType}${secondaryType ? `，${secondaryType}` : ""}，${attendanceLabel}` : fixed ? `，${session.isBiweekly ? "隔週固定" : "每週固定"}` : ""}`}
    >
      {musicDense ? (
        <>
          <div className="flex min-w-0 items-center gap-1 text-[11px] leading-4">
            <span className="flex min-w-0 flex-1 items-center gap-1">
              {brief && <span className={`shrink-0 rounded px-1 text-[9px] font-bold ${typeBadge}`}>{primaryType}</span>}
              <strong className="min-w-0 truncate text-earth-900">{studentLabel}</strong>
            </span>
            <span className="max-w-[36%] min-w-0 shrink-0 truncate rounded bg-earth-700 px-1.5 text-right text-[10px] font-bold text-white">{resourceView === "coach" ? copy.room : copy.coach}</span>
          </div>
          {!brief && <div className="flex min-w-0 items-center justify-between gap-1 leading-4">
            <span className="min-w-0 truncate text-[10px] font-medium text-earth-700">{copy.privateClass ? session.nameSnapshot : secondaryType || `${attendance.total}/${session.capacity} 人`}{copy.privateClass && secondaryType ? ` · ${secondaryType}` : ""}{!copy.privateClass && attendance.processed > 0 && !attendanceComplete ? ` · ${attendanceLabel}` : ""}</span>
            <span className={`shrink-0 rounded px-1 text-[9px] font-bold ${typeBadge}`}>{primaryType}</span>
          </div>}
          {sessionDurationMinutes(session) >= 90 && <p className="truncate text-[10px] leading-4 text-earth-600">{attendanceComplete ? "點名完成 · " : ""}{copy.privateClass ? session.nameSnapshot : `${attendance.total}/${session.capacity} 人`}</p>}
        </>
      ) : (
      <>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate font-semibold text-earth-900 ${dense ? "text-xs" : "text-sm"}`}>{copy.primary}</p>
          <p className={`truncate text-earth-600 ${dense ? "mt-0 text-[10px]" : "mt-0.5 text-xs"}`}>{copy.secondary}</p>
        </div>
        {!compact && (
          <span className="shrink-0 text-[11px] font-medium text-earth-500">
            {hhmm(session.startsAt)}
          </span>
        )}
      </div>
      <p className={`truncate text-earth-500 ${dense ? "mt-0.5 text-[10px]" : "mt-1 text-xs"}`}>
        {dense && resourceView === "room"
          ? copy.coach
          : dense && resourceView === "coach"
            ? copy.room
            : `${copy.coach} · ${copy.room}`}
      </p>
      <div className={`flex flex-wrap gap-1 ${dense ? "mt-1" : "mt-1.5"}`}>
        {moved && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">調課</span>
        )}
        {substitute && (
          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">代課</span>
        )}
        {attendanceComplete && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">{businessProfile === "MUSIC" ? "點名完成" : "已出席"}</span>}
        {fixed && businessProfile === "MUSIC" && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${session.isBiweekly ? "bg-blue-100 text-blue-900 ring-1 ring-blue-200" : "bg-teal-100 text-teal-900 ring-1 ring-teal-200"}`}>
            {session.isBiweekly ? "隔週固定" : "每週固定"}
          </span>
        )}
        {fixed && businessProfile !== "MUSIC" && (
          <span className="rounded-full bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-600">{session.isBiweekly ? "隔週" : "固定"}</span>
        )}
        {businessProfile === "MUSIC" && !fixed && (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">約課</span>
        )}
        {businessProfile === "MUSIC" && !copy.privateClass && (
          <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">團體</span>
        )}
        {isTrial(session) && (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            體驗
          </span>
        )}
        {showCapacityState && (isFull(session) ? (
          <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-900">
            滿班
          </span>
        ) : isNearFull(session) ? (
          <span className="rounded-full bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-700">
            剩 {seats} 位
          </span>
        ) : null)}
        {pendingCheckins(session) > 0 && (
          <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
            待報到 {pendingCheckins(session)}
          </span>
        )}
        {copy.privateClass && !musicDense && (
          <span className="rounded-full bg-earth-50 px-1.5 py-0.5 text-[10px] font-medium text-earth-600">
            {businessProfile === "MUSIC" ? "一對一" : "私教"}
          </span>
        )}
      </div>
      </>
      )}
    </button>
  );
}

export function CourseScheduleBoard({
  businessProfile,
  mode,
  selectedDate,
  today,
  sessions,
  leaveCounts = {},
  rooms,
  coaches,
  templates,
  pending = false,
  storePeriods,
  staffAvailability,
  staffAvailabilityExceptions,
  onOpenEmpty,
  moveClipboard = null,
  onPasteMove,
  onSelectDate,
  onOpenSession,
  readOnly = false,
}: Props) {
  const activeRooms = rooms.filter((room) => room.isActive);
  const activeCoaches = coaches.filter(
    (coach) => coach.status === "ACTIVE" && coach.courseCoachEnabled,
  );
  const [resourceView, setResourceView] = React.useState<ResourceView>(businessProfile === "MUSIC" ? "coach" : "room");
  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>("all");
  const [availabilityDuration, setAvailabilityDuration] = React.useState<30 | 60 | 90 | 120>(60);
  const [matchedSlots, setMatchedSlots] = React.useState<MusicSlotMatch[] | null>(null);
  const [matchError, setMatchError] = React.useState("");
  const [teacherChoice, setTeacherChoice] = React.useState<{time:string;roomId:string;coachIds:string[]} | null>(null);
  React.useEffect(() => {
    if (businessProfile !== "MUSIC" || mode !== "day" || !moveClipboard) {
      setMatchedSlots(null);
      setTeacherChoice(null);
      return;
    }
    let current = true;
    setMatchedSlots(null);
    setTeacherChoice(null);
    setMatchError("");
    getMusicSlotMatches({
      date: selectedDate,
      templateId: moveClipboard.templateId,
      durationMinutes: moveClipboard.durationMinutes,
      moveSessionId: moveClipboard.sessionId,
      scope: moveClipboard.scope,
      weeks: moveClipboard.weeks,
    }).then(result => {
      if (!current) return;
      if (result.success) setMatchedSlots(result.data);
      else setMatchError(result.error ?? "空位暫時無法讀取");
    }).catch(() => { if (current) setMatchError("空位暫時無法讀取，請重試"); });
    return () => { current = false; };
  }, [businessProfile, mode, selectedDate, moveClipboard]);
  const dayScrollRef = React.useRef<HTMLDivElement>(null);
  const [dayScrollLeft, setDayScrollLeft] = React.useState(0);

  const snapResourceCount = resourceView === "room" ? activeRooms.length : activeCoaches.length;
  function snapDayScroll() {
    const element = dayScrollRef.current;
    if (!element || businessProfile !== "MUSIC") return;
    const resourceWidth = snapResourceCount
      ? Math.max(124, (element.scrollWidth - 64) / snapResourceCount)
      : 132;
    const target = Math.min(
      element.scrollWidth - element.clientWidth,
      Math.max(0, Math.round(element.scrollLeft / resourceWidth) * resourceWidth),
    );
    element.scrollTo({ left: target, behavior: "smooth" });
  }

  if (mode === "week") {
    const start = weekStart(selectedDate);
    const dates = Array.from({ length: 7 }, (_, index) =>
      addTaiwanDuration(start, index, "DAY"),
    );
    return (
      <section className="space-y-2" aria-label="週課表">
        <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
          <div className="grid min-w-[900px] grid-cols-7 divide-x divide-earth-100">
            {dates.map((date) => {
              const list = sessions
                .filter((session) => sessionDate(session) === date)
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              return (
                <div key={date} className={date === selectedDate ? "bg-primary-50/40" : ""}>
                  <button
                    type="button"
                    className={`sticky top-0 z-10 w-full border-b border-earth-100 bg-white px-3 py-2 text-left ${date === today ? "text-primary-800" : "text-earth-700"}`}
                    onClick={() => onSelectDate(date)}
                  >
                    <span className="block text-xs">{date === today ? "今天 · " : ""}{shortDate(date)}</span>
                    <strong className="text-sm">{list.length} 堂</strong>
                  </button>
                  <div className="space-y-2 p-2">
                    {list.length ? (
                      list.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          templates={templates}
                          coaches={coaches}
                          rooms={rooms}
                          compact
                          businessProfile={businessProfile}
                          fixed={session.isFixed}
                          leaveCount={leaveCounts[session.id] ?? 0}
                          readOnly={readOnly}
                          onOpen={() => onOpenSession(session.id, date)}
                        />
                      ))
                    ) : (
                      <p className="py-8 text-center text-xs text-earth-400">無課程</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  const daySessions = sessions
    .filter((session) => sessionDate(session) === selectedDate)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const filtered = daySessions.filter((session) => filterSession(session, quickFilter));
  const resources =
    resourceView === "room"
      ? activeRooms.map((room) => ({ id: room.id, name: room.name }))
      : activeCoaches.map((coach) => ({ id: coach.id, name: coach.displayName }));
  const normalizedStorePeriods = normalizeAvailabilityPeriods(storePeriods);
  const boundaryMinutes = normalizedStorePeriods.flatMap((period)=>[minuteOfDay(period.openTime),minuteOfDay(period.closeTime)]);
  const sessionMinutes = filtered.flatMap((session)=>[minuteOfDay(hhmm(session.startsAt)),minuteOfDay(hhmm(session.endsAt))]);
  const minMinute = Math.min(...(boundaryMinutes.length ? boundaryMinutes : sessionMinutes.length ? sessionMinutes : [9*60]));
  const maxMinute = Math.max(...(boundaryMinutes.length ? boundaryMinutes : sessionMinutes.length ? sessionMinutes : [22*60]));
  const firstHour = Math.floor(minMinute/60);
  const lastHour = Math.max(firstHour,Math.ceil(maxMinute/60)-1);
  const times = Array.from({length:lastHour-firstHour+1},(_,index)=>`${String(firstHour+index).padStart(2,"0")}:00`);
  const selectedDayOfWeek=parseLocalDate(selectedDate).getDay();
  const coachPeriods=(staffId:string)=>{
    const exception=staffAvailabilityExceptions.find(item=>item.staffId===staffId&&item.date===selectedDate);
    if(exception?.type==="UNAVAILABLE") return [];
    if(exception?.type==="CUSTOM") return normalizeAvailabilityPeriods(exception.segments);
    const rows=staffAvailability.filter(item=>item.staffId===staffId);
    if(!rows.length) return normalizedStorePeriods;
    return normalizeAvailabilityPeriods(rows.find(item=>item.dayOfWeek===selectedDayOfWeek)?.segments);
  };
  const resourcePeriods=(resourceId:string)=>resourceView==="room"
    ? normalizedStorePeriods
    : coachPeriods(resourceId);
  const slotConflict=(resourceId:string,startTime:string,durationMinutes:number=availabilityDuration)=>{
    const start=minuteOfDay(startTime),end=start+durationMinutes;
    return daySessions.some(session=>{
      const same=resourceView==="room"?session.roomId===resourceId:session.coachId===resourceId;
      if(!same) return false;
      const sessionStart=minuteOfDay(hhmm(session.startsAt)),sessionEnd=minuteOfDay(hhmm(session.endsAt));
      return start<sessionEnd&&end>sessionStart;
    });
  };
  const pairConflict=(roomId:string,coachId:string,startTime:string,durationMinutes:number)=>{
    const start=minuteOfDay(startTime),end=start+durationMinutes;
    return daySessions.some(session=>{
      if(session.id===moveClipboard?.sessionId) return false;
      if(session.roomId!==roomId&&session.coachId!==coachId) return false;
      const sessionStart=minuteOfDay(hhmm(session.startsAt)),sessionEnd=minuteOfDay(hhmm(session.endsAt));
      return start<sessionEnd&&end>sessionStart;
    });
  };
  const matchedPair = (roomId:string,time:string) => matchedSlots?.find(s => s.roomId === roomId && s.time === time);
  const resourceCount = Math.max(resources.length, 1);
  const musicDense = businessProfile === "MUSIC";
  const timetableWidth = musicDense
    ? "100%"
    : resourceCount === 1
      ? "44%"
      : resourceCount === 2
        ? "64%"
        : resourceCount === 3
          ? "80%"
          : "100%";
  const timetableMinWidth = musicDense
    ? 64 + resourceCount * 132
    : resourceCount === 1
      ? 420
      : resourceCount === 2
        ? 620
        : resourceCount === 3
          ? 780
          : 72 + resourceCount * 220;

  const booked = daySessions.reduce((sum, session) => sum + session.bookings.length, 0);
  const trials = daySessions.reduce(
    (sum, session) => sum + session.bookings.filter((booking) => booking.bookingKind === "TRIAL").length,
    0,
  );
  const groupOnly=(session:Session)=>templates.find(item=>item.id===session.templateId)?.classType!=="PRIVATE";
  const capacitySessions=businessProfile==="MUSIC"?daySessions.filter(groupOnly):daySessions;
  const nearFull = capacitySessions.filter(isNearFull).length;
  const full = capacitySessions.filter(isFull).length;
  const pendingCount = daySessions.reduce(
    (sum, session) => sum + pendingCheckins(session),
    0,
  );

  const filters: Array<{ id: QuickFilter; label: string; value: number }> = [
    { id: "all", label: "今日課程", value: daySessions.length },
    { id: "trial", label: "體驗", value: trials },
    { id: "near-full", label: "快滿", value: nearFull },
    { id: "full", label: "滿班", value: full },
    { id: "pending", label: "待報到", value: pendingCount },
  ];

  return (
    <section className="space-y-2" aria-label="日課表">
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <div
          className="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-earth-200 bg-white px-2 py-1.5"
          aria-label="今日狀態快速篩選"
        >
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              disabled={pending}
              onClick={() => setQuickFilter(filter.id)}
              className={`${tab} ${quickFilter === filter.id ? "bg-primary-50 text-primary-900" : "text-earth-600 hover:bg-earth-50"}`}
            >
              <span>{filter.label}</span>
              <strong className="ml-1">{filter.value}</strong>
            </button>
          ))}
          <span className="px-2 text-xs text-earth-300">｜</span>
          <span className="px-1 text-xs text-earth-600">
            {musicDense ? "預約學員" : "預約"} <strong className="text-earth-800">{booked}</strong> {musicDense ? "位" : "人"}
          </span>
        </div>

        {musicDense && !moveClipboard && (
          <label className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-earth-200 bg-white px-2 text-xs text-earth-600">
            <span>找空位</span>
            <select
              aria-label="找空位所需時長"
              className="bg-transparent font-medium text-earth-800 outline-none"
              value={availabilityDuration}
              onChange={(event) => setAvailabilityDuration(Number(event.target.value) as 30 | 60 | 90 | 120)}
            >
              {[30, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分</option>)}
            </select>
          </label>
        )}

        {musicDense && (
          <div className="inline-flex min-h-9 items-center gap-3 rounded-lg border border-earth-200 bg-white px-2.5 text-[11px] text-earth-600" aria-label="課表可排狀態圖例">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-earth-200 bg-white" aria-hidden="true" />可排</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-earth-200 bg-earth-100" aria-hidden="true" />不可排</span>
          </div>
        )}
        {moveClipboard && <span role={matchError ? "alert" : "status"} className={`text-xs ${matchError ? "text-red-700" : "text-earth-600"}`}>
          {matchError || (matchedSlots ? `可貼空位 ${matchedSlots.length} 格` : "正在核對老師與教室…")}
        </span>}

        <div className="inline-flex rounded-lg border border-earth-200 bg-white p-0.5" aria-label="課表資源視角">
          <button
            type="button"
            className={`min-h-8 rounded-md px-3 text-xs ${resourceView === "room" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("room")}
          >
            教室視角
          </button>
          <button
            type="button"
            className={`min-h-8 rounded-md px-3 text-xs ${resourceView === "coach" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("coach")}
          >
            {businessProfile === "MUSIC" ? "老師視角" : "教練視角"}
          </button>
        </div>
      </div>

      {musicDense && (
        <div className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-[11px] text-earth-700" aria-label="課程型態圖例">
          {[
            ["每週", "border-teal-500 bg-teal-50"],
            ["隔週", "border-blue-500 bg-blue-50"],
            ["約課／調課／代課", "border-amber-500 bg-amber-50"],
            ["團體", "border-purple-500 bg-purple-50"],
            ["體驗", "border-orange-500 bg-orange-50"],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className={`h-3 w-3 rounded-sm border-l-[3px] ${color}`} aria-hidden="true" />{label}
            </span>
          ))}
          <span className="text-earth-500">卡片左側學員／團班，右側當天授課老師；調課、代課仍保留原排課週期</span>
          <span className="text-earth-600">色條淺＝有人待點名；同色深＝全員已處理（含請假、曠課）</span>
        </div>
      )}

      {!daySessions.length && !musicDense ? (
        <div className="rounded-xl border border-dashed border-earth-200 bg-white p-10 text-center text-earth-500">
          當日尚無課程
        </div>
      ) : !filtered.length && !(musicDense && quickFilter === "all") ? (
        <div className="rounded-xl border border-dashed border-earth-200 bg-white p-8 text-center text-earth-500">
          此篩選目前沒有課程
        </div>
      ) : (
        <div className={musicDense ? "relative max-w-full rounded-xl border border-earth-200 bg-white" : "max-w-full pb-1"}>
          {musicDense && (
            <div className="sticky top-14 z-40 max-w-full overflow-hidden border-b border-earth-200 bg-earth-50/95 backdrop-blur-sm">
              <div className="absolute inset-y-0 left-0 z-50 flex w-16 items-center border-r border-earth-200 bg-earth-50 px-2 text-xs font-medium text-earth-500">
                時間
              </div>
              <div
                className="grid w-full will-change-transform"
                style={{
                  width: timetableWidth,
                  minWidth: timetableMinWidth,
                  gridTemplateColumns: `64px repeat(${resourceCount}, minmax(124px, 1fr))`,
                  transform: `translateX(-${dayScrollLeft}px)`,
                }}
              >
                <div aria-hidden="true" />
                {resources.length ? resources.map((resource) => (
                  <div key={resource.id} className="border-r border-earth-200 bg-earth-50 px-2 py-2 text-xs font-semibold text-earth-800">
                    {resource.name}
                  </div>
                )) : (
                  <div className="border-r border-earth-200 bg-earth-50 px-3 py-2 text-xs text-earth-500">
                    尚無可用{resourceView === "room" ? "教室" : "老師"}
                  </div>
                )}
              </div>
            </div>
          )}
          <div
            ref={musicDense ? dayScrollRef : undefined}
            onScroll={musicDense ? (event) => setDayScrollLeft(event.currentTarget.scrollLeft) : undefined}
            onPointerUp={musicDense ? snapDayScroll : undefined}
            onTouchEnd={musicDense ? snapDayScroll : undefined}
            className={musicDense ? "max-w-full overflow-x-auto overscroll-x-contain scroll-smooth pb-1" : "max-w-full overflow-x-auto pb-1"}
          >
            <div
              className={musicDense ? "bg-white" : "overflow-hidden rounded-xl border border-earth-200 bg-white"}
              style={{
                width: timetableWidth,
                minWidth: timetableMinWidth,
              }}
            >
              <div
                className="grid w-full"
                style={{
                  gridTemplateColumns: musicDense
                    ? `64px repeat(${resourceCount}, minmax(124px, 1fr))`
                    : `72px repeat(${resourceCount}, minmax(180px, 1fr))`,
                }}
              >
                {!musicDense && (
                  <>
                    <div className="sticky left-0 top-0 z-50 border-b border-r border-earth-200 bg-earth-50 px-2 py-3 text-xs font-medium text-earth-500">
                      時間
                    </div>
                    {resources.length ? resources.map((resource) => (
                      <div key={resource.id} className="sticky top-0 z-40 border-b border-r border-earth-200 bg-earth-50 px-3 py-3 text-sm font-semibold text-earth-800">
                        {resource.name}
                      </div>
                    )) : (
                      <div className="sticky top-0 z-20 border-b border-earth-200 bg-earth-50 px-3 py-3 text-sm text-earth-500">
                        尚無可用{resourceView === "room" ? "教室" : "教練"}
                      </div>
                    )}
                  </>
                )}

                {times.map((time) => (
              <React.Fragment key={time}>
                <div className={`sticky left-0 z-30 border-b border-r border-earth-100 bg-white px-2 text-xs font-medium text-earth-600 ${musicDense ? "py-2" : "py-3"}`}>
                  {time}
                </div>
                {(resources.length ? resources : [{ id: "__none", name: "" }]).map((resource) => {
                  const list = filtered.filter(
                    (session) =>
                      hhmm(session.startsAt).slice(0,2) === time.slice(0,2) &&
                      (resourceView === "room"
                        ? session.roomId === resource.id
                        : session.coachId === resource.id),
                  );
                   const movedShadows = sessions.filter((session) => {
                     if (!session.rescheduledFromStartsAt) return false;
                     if (toLocalDateStr(new Date(session.rescheduledFromStartsAt)) !== selectedDate) return false;
                     if (hhmm(session.rescheduledFromStartsAt).slice(0,2) !== time.slice(0,2)) return false;
                     return resourceView === "room"
                       ? session.rescheduledFromRoomId === resource.id
                       : session.rescheduledFromCoachId === resource.id;
                   });
                  return (
                    <div
                      key={`${time}:${resource.id}`}
                      className={`relative border-b border-r border-earth-100 ${musicDense ? "h-[50px]" : "min-h-20 space-y-2 p-2"}`}
                    >
                      {musicDense && resource.id !== "__none" && (
                        <div className="absolute inset-0 grid grid-rows-2">
                          {["00","30"].map((minute)=>{
                            const startTime=`${time.slice(0,2)}:${minute}`;
                             const duration=moveClipboard?.durationMinutes ?? availabilityDuration;
                             const targetRoomId=moveClipboard
                               ? resourceView==="room" ? resource.id : moveClipboard.roomId
                               : resourceView==="room" ? resource.id : "";
                             const targetCoachId=moveClipboard
                               ? resourceView==="coach" ? resource.id : moveClipboard.coachId
                               : resourceView==="coach" ? resource.id : "";
                             const storeOpen=periodContains(normalizedStorePeriods,startTime,duration);
                             const resourceOpen=moveClipboard
                               ? periodContains(coachPeriods(targetCoachId),startTime,duration)
                               : periodContains(resourcePeriods(resource.id),startTime,duration);
                             const targetCoach=coaches.find((coach)=>coach.id===targetCoachId);
                             const qualified=!moveClipboard || (
                               targetCoach?.courseQualificationsConfirmed !== false &&
                               (!targetCoach?.courseQualifiedTemplateIds?.length || targetCoach.courseQualifiedTemplateIds.includes(moveClipboard.templateId))
                             );
                             const hasConflict=moveClipboard
                               ? pairConflict(targetRoomId,targetCoachId,startTime,duration)
                               : slotConflict(resource.id,startTime,duration);
                             const serverMatch = moveClipboard ? resourceView === "room"
                               ? matchedPair(resource.id,startTime)
                               : matchedSlots?.find(s => s.time === startTime && s.coachIds.includes(resource.id))
                               : null;
                             const available=moveClipboard
                               ? Boolean(serverMatch) && !matchError
                               : storeOpen&&resourceOpen&&qualified&&!hasConflict;
                             const reason=moveClipboard
                               ? matchError || (!matchedSlots ? "正在核對空位" : "這裡沒有可排的合格老師或教室")
                               : !storeOpen?"店家未開放":!resourceOpen?"老師未排班":!qualified?"老師未授此課":hasConflict?"已有課":"";
                             const coachIds = serverMatch?.coachIds ?? [];
                             const matches = resourceView === "coach" ? matchedSlots?.filter(s => s.time === startTime && s.coachIds.includes(resource.id)) ?? [] : [];
                             const choiceLabel = resourceView === "room" ? `${coachIds.length} 位老師可排` : `${matches.length} 間教室可排`;
                            return (
                              <button
                                key={minute}
                                type="button"
                                disabled={!available||pending||readOnly}
                                title={available?(moveClipboard?`${startTime} ${choiceLabel}`:`${startTime} 可排 ${availabilityDuration} 分鐘`):reason}
                                 aria-label={available?(moveClipboard?`${startTime} ${choiceLabel}`:`${startTime} 可排 ${availabilityDuration} 分鐘`):`${startTime} ${reason}`}
                                 onClick={()=>available&&(moveClipboard&&onPasteMove
                                   ? (resourceView === "room"
                                       ? coachIds.length === 1
                                         ? onPasteMove({time:startTime,roomId:resource.id,coachId:coachIds[0]})
                                         : setTeacherChoice({time:startTime,roomId:resource.id,coachIds})
                                       : matches.length === 1
                                         ? onPasteMove({time:startTime,roomId:matches[0].roomId,coachId:resource.id})
                                         : setTeacherChoice({time:startTime,roomId:"",coachIds:[resource.id]}))
                                   : onOpenEmpty({time:startTime,durationMinutes:availabilityDuration,...(resourceView==="room"?{roomId:resource.id}:{coachId:resource.id})}))}
                                 className={`group relative touch-manipulation border-b border-earth-200/80 text-left last:border-b-0 ${available?(moveClipboard?"bg-indigo-50/70 hover:bg-indigo-100 active:bg-indigo-100":"bg-white hover:bg-primary-50 active:bg-primary-50"):"cursor-not-allowed bg-earth-100"}`}
                               >
                                 {available&&<span className={`pointer-events-none absolute left-1 top-1 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium shadow-sm ${moveClipboard?"text-indigo-800":"hidden text-primary-800 group-hover:block group-focus-visible:block group-active:block"}`}>{moveClipboard ? choiceLabel : `＋ ${startTime} · ${availabilityDuration}分`}</span>}
                                 <span className="pointer-events-none absolute bottom-0.5 right-1 text-[9px] text-earth-300 opacity-0 [@media(pointer:coarse)]:opacity-100" aria-hidden="true">{minute}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {musicDense && movedShadows.map((session) => (
                        <button
                          type="button"
                          key={`moved:${session.id}`}
                          className="absolute left-1 right-1 z-[5] rounded border border-dashed border-indigo-200 bg-indigo-50/55 px-1 py-0.5 text-left text-[9px] text-indigo-700 hover:bg-indigo-100"
                          style={{ top: hhmm(session.rescheduledFromStartsAt!).endsWith(":30") ? 25 : 2 }}
                          title={`已移動 → ${toLocalDateStr(new Date(session.startsAt))} ${hhmm(session.startsAt)}`}
                          onClick={()=>onSelectDate(toLocalDateStr(new Date(session.startsAt)))}
                        >
                          已移動 → {toLocalDateStr(new Date(session.startsAt)).slice(5)} {hhmm(session.startsAt)}
                        </button>
                      ))}

                      <div className={musicDense?"relative z-10 p-1 pointer-events-none":"contents"}>
                        {list.map((session) => (
                          <div
                            key={session.id}
                            className={musicDense ? "absolute left-1 right-1 z-10 pointer-events-auto" : "pointer-events-auto"}
                            style={musicDense ? {
                              top: hhmm(session.startsAt).endsWith(":30") ? 25 : 2,
                              height: Math.max(21, sessionDurationMinutes(session) * (50 / 60) - 4),
                            } : undefined}
                          >
                            <SessionCard
                              session={session}
                              templates={templates}
                              coaches={coaches}
                              rooms={rooms}
                              businessProfile={businessProfile}
                              fixed={session.isFixed}
                              leaveCount={leaveCounts[session.id] ?? 0}
                              readOnly={readOnly}
                              dense={musicDense}
                              resourceView={resourceView}
                              onOpen={() => onOpenSession(session.id, selectedDate)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {teacherChoice && moveClipboard && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="選擇可排老師與教室" onClick={() => setTeacherChoice(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={event => event.stopPropagation()}>
            <h3 className="font-semibold text-primary-900">{selectedDate} {teacherChoice.time} · 選擇貼上位置</h3>
            <p className="mt-1 text-xs text-earth-600">已核對授課資格、老師排班、教室與方案期限。</p>
            <div className="mt-3 grid max-h-[55dvh] gap-2 overflow-y-auto">
              {(teacherChoice.roomId
                ? teacherChoice.coachIds.map(coachId => ({roomId:teacherChoice.roomId,coachId}))
                : matchedSlots?.filter(slot => slot.time === teacherChoice.time && slot.coachIds.includes(teacherChoice.coachIds[0]))
                    .map(slot => ({roomId:slot.roomId,coachId:teacherChoice.coachIds[0]})) ?? []
              ).map(pair => <button type="button" key={`${pair.roomId}:${pair.coachId}`} className="min-h-11 rounded-xl border border-earth-200 px-3 text-left hover:bg-primary-50" onClick={() => { setTeacherChoice(null); onPasteMove?.({time:teacherChoice.time,...pair}); }}>
                {coaches.find(coach => coach.id === pair.coachId)?.displayName} · 教室 {rooms.find(room => room.id === pair.roomId)?.name}
              </button>)}
            </div>
            <button type="button" className="mt-3 min-h-10 w-full rounded-lg border border-earth-200" onClick={() => setTeacherChoice(null)}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
