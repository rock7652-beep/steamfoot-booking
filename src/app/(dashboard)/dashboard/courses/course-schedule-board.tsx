"use client";
import { CourseScheduleToolbar } from "@/components/admin/course-schedule-toolbar";
import { courseClassPresentation } from "@/lib/course-class-presentation";

import React from "react";
import { scheduleLanes } from "@/lib/course-schedule-lanes";
import { courseCardContentOffset } from "@/lib/course-card-content-offset";

import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import { normalizeAvailabilityPeriods, periodContains, minuteOfDay } from "@/lib/course-availability";
import { getMusicSlotMatches, type MusicSlotMatch } from "@/server/actions/course-slot-matches";
import { courseAttendanceState } from "@/lib/course-attendance-visual";
import { scheduleRosterBookings } from "@/lib/course-schedule-counts";
import { scheduleOnDate, scheduleTotals } from "@/lib/music-schedule-audit";

export type CourseScheduleMode = "month" | "week" | "day";

type Booking = {
  customerId: string | null;
  customerName: string;
  status: string;
  absenceKind?: string | null;
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
  teacherAttendance?: string;
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
  displayBookings?: Booking[];
  // Display metadata for the read-only schedule replica; live sessions omit these fields.
  isTrial?:boolean;
  previewKind?: "CHANGED" | "RENTAL";
  previewFaded?: "異動／請假" | "已調課";
  previewDestinationStartsAt?: string;
  previewDestinationRoomId?: string;
  previewStudentNames?: string[];
  previewRosterUnknown?: boolean;
  previewAttendanceUnknown?: boolean;
  previewFrequencyUnknown?: boolean;
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
  musicTrialMode?: string | null;
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
  initialWeekRoomId?: string;
  legend?: React.ReactNode;
  initialResourceView?: "room" | "coach";
  onResourceChange?: (view:"room"|"coach",resourceId?:string)=>void;
  today: string;
  sessions: Session[];
  leaveCounts?: Record<string, number>;
  assignedFiltered?: boolean;
  rooms: Room[];
  coaches: Coach[];
  templates: Template[];
  pending?: boolean;
  canCreate?: boolean;
  occupiedSessions?: Session[];
  calendarDays?: Record<string, {status: string; periods: {openTime:string;closeTime:string}[]}>;
  storePeriods: {openTime:string;closeTime:string}[];
  staffAvailability: {staffId:string;dayOfWeek:number;segments:unknown}[];
  staffAvailabilityExceptions: {staffId:string;date:string;type:string;segments:unknown;reason:string|null}[];
  onOpenEmpty: (value:{date?:string;time:string;roomId?:string;coachId?:string;durationMinutes?:number})=>void;
  moveClipboard?: CourseMoveClipboard | null;
  onPasteMove?: (value:{time:string;roomId:string;coachId:string})=>void;
  onSelectDate: (date: string) => void;
  onOpenSession: (sessionId: string, date: string) => void;
  readOnly?: boolean;
  replica?: boolean;
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

function originalPlace(session: Session): Session | null {
  if (!session.rescheduledFromStartsAt || !session.rescheduledFromEndsAt || !session.rescheduledFromRoomId || !session.rescheduledFromCoachId) return null;
  return {
    ...session,
    startsAt: session.rescheduledFromStartsAt,
    endsAt: session.rescheduledFromEndsAt,
    roomId: session.rescheduledFromRoomId,
    coachId: session.rescheduledFromCoachId,
    previewFaded: "已調課",
    previewDestinationStartsAt: session.startsAt,
    previewDestinationRoomId: session.roomId,
    rescheduledFromStartsAt: null,
    rescheduledFromEndsAt: null,
    rescheduledFromRoomId: null,
    rescheduledFromCoachId: null,
  };
}

function firstCustomer(session: Session) {
  return session.bookings.find((booking) => booking.customerName.trim())?.customerName.trim() ?? "";
}

function isTrial(session: Session) {
  return (session.displayBookings ?? scheduleRosterBookings(session.bookings)).some((booking) => booking.bookingKind === "TRIAL");
}

function pendingCheckins(session: Session) {
  return (session.displayBookings ?? session.bookings).filter(
    (booking) => !["CHECKED_IN", "ATTENDED", "NO_SHOW", "CANCELLED"].includes(booking.status),
  ).length;
}

function openSeats(session: Session) {
  return Math.max(0, session.capacity - session.bookings.filter(booking => booking.status !== "CANCELLED").length);
}

function isFull(session: Session) {
  return session.bookings.filter(booking => booking.status !== "CANCELLED").length >= session.capacity;
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
  const groupClass = template?.classType === "GROUP";
  const customer = firstCustomer(session) || session.previewStudentNames?.join("、") || "";

  return {
    privateClass,
    groupClass,
    primary: privateClass && customer ? customer : session.previewFaded && customer ? `${session.nameSnapshot} · ${customer}` : session.nameSnapshot,
    secondary: privateClass
      ? session.nameSnapshot
      : `${session.bookings.filter(booking => booking.status !== "CANCELLED").length} / ${session.capacity} 人`,
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
  wide = false,
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
  wide?: boolean;
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
  const trialClass = session.isTrial || Boolean(templates.find(item=>item.id===session.templateId)?.musicTrialMode);
  const presentation = courseClassPresentation(templates.find(item=>item.id===session.templateId)?.classType, trialClass, session.previewKind === "RENTAL");
  const rental = session.previewKind === "RENTAL";
  const changed = session.previewKind === "CHANGED";
  const scheduleType = fixed ? session.previewFrequencyUnknown ? "固定" : session.isBiweekly ? "隔週固定" : "每週固定" : "約課";
  const destination = session.previewDestinationStartsAt
    ? `調至 ${hhmm(session.previewDestinationStartsAt)} · 教室 ${rooms.find(room=>room.id===session.previewDestinationRoomId)?.name??"待核對"}` : null;
  const primaryType = rental ? "租借" : copy.groupClass ? changed ? "團體異動" : substitute ? "團體代課" : moved ? "團體調課" : "團體" : trialClass ? "體驗" : changed ? "異動" : substitute ? "代課" : moved ? "調課" : fixed ? session.previewFrequencyUnknown ? "固定" : session.isBiweekly ? "隔週" : "每週" : "約課";
  const secondaryType = ["體驗", "代課", "調課", "團體"].includes(primaryType) ? scheduleType : "";
  const attendance = courseAttendanceState(session.displayBookings ?? session.bookings, 0, session.teacherAttendance);
  const studentNoShows=session.bookings.filter(booking=>booking.status==="NO_SHOW").length;
  const studentState=[leaveCount?`學員請假${leaveCount}人`:"",studentNoShows?`學員曠課${studentNoShows}人`:""].filter(Boolean).join(" · ");
  const teacherTitle = businessProfile === "MUSIC" ? "老師" : "教練";
  const teacherState=session.teacherAttendance==="LEAVE"?`${teacherTitle}請假`:session.teacherAttendance==="NO_SHOW"?`${teacherTitle}曠課`:"";
  const progressText = rental ? "" : attendance.teacherAbsent ? "免點名" : attendance.total ? `${attendance.complete ? "✓ " : ""}${attendance.processed}/${attendance.total}` : "";
  const progressColor = attendance.complete ? "text-emerald-700" : attendance.processed > 0 ? "text-amber-700" : "text-earth-500";
  const attendanceLabel = session.previewFaded ? `${session.previewFaded}（原課已釋出；${session.isFixed ? "僅可排單次臨時課" : "可核對後排固定課"}）`
    : session.previewRosterUnknown ? "截圖未顯示學員名單"
    : session.previewAttendanceUnknown ? "原圖未提供點名資料"
    : attendance.teacherAbsent ? "本堂已記錄 · 學員免點名"
    : attendance.total > 0 ? `已記錄 ${attendance.processed}/${attendance.total}` : "尚無學員";
  const detailStatus=[teacherState,studentState,attendanceLabel].filter(Boolean).join(" · ");
  const showCapacityState = !musicDense || !copy.privateClass;
  const brief = sessionDurationMinutes(session) <= 30;
  const studentLabel = rental || !copy.privateClass && !session.bookings.length
    ? copy.primary : copy.privateClass ? copy.primary : `${copy.primary} · ${attendance.total} 人`;
  const originalCoach = substitute ? coaches.find((coach) => coach.id === session.rescheduledFromCoachId)?.displayName : null;
  const resourceLabel = rental || resourceView === "coach" ? (/教室/.test(copy.room) ? copy.room : `教室 ${copy.room}`) : copy.coach;
  const musicContext = businessProfile === "MUSIC" ? [teacherState, substitute ? `代課${originalCoach ? ` · 原老師 ${originalCoach}` : ""}` : moved ? "調課" : changed ? "異動" : "", fixed && session.isBiweekly ? "隔週" : fixed && session.previewFrequencyUnknown ? "固定" : "", destination ? `→ ${hhmm(session.previewDestinationStartsAt!)}` : ""].filter(Boolean).join(" · ") : teacherState;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={readOnly}
      className={`w-full rounded-md border text-left transition ${dense ? "flex h-full items-start overflow-hidden px-1.5 py-0.5" : "p-2"} hover:border-primary-300 hover:bg-primary-50/40 focus:outline-none focus:ring-1 focus:ring-primary-300 border-earth-300 bg-white ${session.previewFaded ? "border-dashed bg-earth-50 [filter:saturate(.55)]" : ""}`}
      data-schedule-card={dense && !brief ? "tracking" : undefined}
      title={`${hhmm(session.startsAt)} ${businessProfile === "MUSIC" ? studentLabel : copy.primary} · ${rental ? copy.room : copy.coach}${businessProfile === "MUSIC" && originalCoach ? `（代替 ${originalCoach}）` : ""} · ${copy.room}${businessProfile === "MUSIC" ? ` · ${primaryType}${session.previewFaded ? ` · ${session.previewFaded}（原時段保留）` : ""}${destination ? ` · ${destination}` : ""}${moved ? ` · 原課 ${hhmm(session.rescheduledFromStartsAt!)}` : ""}${secondaryType ? ` · ${secondaryType}` : ""} · ${detailStatus}` : fixed ? ` · ${session.isBiweekly ? "隔週固定" : "每週固定"}` : ""}`}
      aria-label={`${businessProfile === "MUSIC" ? studentLabel : copy.primary}，${hhmm(session.startsAt)}，${rental ? copy.room : copy.coach}${businessProfile === "MUSIC" && originalCoach ? `代替 ${originalCoach}` : ""}${businessProfile === "MUSIC" ? `，${primaryType}${secondaryType ? `，${secondaryType}` : ""}，${detailStatus}` : fixed ? `，${session.isBiweekly ? "隔週固定" : "每週固定"}` : ""}`}
    >
      <div data-schedule-card-content className={`min-w-0 w-full ${dense && !brief ? "will-change-transform" : ""}`}>
      <span className="sr-only">{presentation.label}</span>
      {(!dense || businessProfile === "MUSIC") && <span aria-hidden="true" className={`float-left mr-1.5 mt-1 h-2 w-2 rounded-full ${presentation.dot}`} />}
      {dense && businessProfile !== "MUSIC" ? (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 whitespace-nowrap text-[13px] leading-4 tabular-nums">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${presentation.dot}`} />
            <span>{hhmm(session.startsAt)}–{hhmm(session.endsAt)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1 text-sm leading-5">
            <strong className="min-w-0 flex-1 truncate" title={copy.primary}>{copy.primary}</strong>
            {brief && progressText && <span className={`shrink-0 font-semibold tabular-nums ${progressColor}`} title={teacherState || "點名完成度"}>{progressText}</span>}
          </div>
          {!brief && <div className="flex min-w-0 items-center gap-1 text-[13px] leading-5">
            <span className="min-w-0 flex-1 truncate" title={teacherState || resourceLabel}>{teacherState || resourceLabel}</span>
            {progressText && <span className={`shrink-0 font-semibold tabular-nums ${progressColor}`} title={teacherState || "點名完成度"}>{progressText}</span>}
          </div>}
        </div>
      ) : dense ? <>
        <div className={wide ? "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm" : "contents"}>
          {businessProfile === "MUSIC" ? <div className="shrink-0 whitespace-nowrap text-sm leading-4 tabular-nums">{hhmm(session.startsAt)}–{hhmm(session.endsAt)}</div> : <div className="flex flex-wrap gap-x-0.5 text-sm leading-4 tabular-nums"><span className="whitespace-nowrap">{hhmm(session.startsAt)}</span><span className="whitespace-nowrap">–{hhmm(session.endsAt)}</span></div>}
          <div className={`flex min-w-0 items-center gap-1 text-sm leading-5 ${wide ? "max-w-[70%]" : ""}`}><strong className={`min-w-0 truncate ${wide ? "" : "flex-1"}`} title={copy.primary}>{copy.primary}</strong>{progressText && <span className={`shrink-0 font-semibold tabular-nums ${progressColor}`} title={teacherState || "點名完成度"}>{progressText}</span>}</div>
          {(!brief || wide) && <div className={`truncate text-sm leading-5 ${wide ? "ml-auto" : ""}`}>{resourceLabel}{businessProfile !== "MUSIC" && teacherState ? ` · ${teacherState}` : ""}</div>}
        </div>
        {!brief && businessProfile === "MUSIC" && musicContext && <div className="truncate text-xs leading-4 text-earth-600" title={musicContext}>{musicContext}</div>}
      </> : (
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
          <span className="text-xs font-medium text-earth-600">調課</span>
        )}
        {substitute && (
          <span className="text-xs font-medium text-earth-600">代課</span>
        )}
        {progressText && <span className={`text-xs font-semibold ${progressColor}`} title={teacherState || "點名完成度"}>{progressText}</span>}
        {fixed && businessProfile === "MUSIC" && (
          <span className={"text-xs font-medium text-earth-600"}>
            {session.isBiweekly ? "隔週固定" : "每週固定"}
          </span>
        )}
        {fixed && businessProfile !== "MUSIC" && (
          <span className="rounded-full bg-earth-100 px-1.5 py-0.5 text-[10px] font-medium text-earth-600">{session.isBiweekly ? "隔週" : "固定"}</span>
        )}
        {businessProfile === "MUSIC" && !fixed && (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">約課</span>
        )}
        {businessProfile === "MUSIC" && copy.groupClass && (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">團體課</span>
        )}
        {trialClass && (
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
      </div>
    </button>
  );
}

export function CourseScheduleBoard({
  legend,
  assignedFiltered = false,
  businessProfile,
  mode,
  selectedDate,
  initialWeekRoomId,
  initialResourceView,
  onResourceChange,
  today,
  sessions,
  leaveCounts = {},
  rooms,
  coaches,
  templates,
  pending = false,
  canCreate = true,
  occupiedSessions,
  calendarDays,
  storePeriods,
  staffAvailability,
  staffAvailabilityExceptions,
  onOpenEmpty,
  moveClipboard = null,
  onPasteMove,
  onSelectDate,
  onOpenSession,
  readOnly = false,
  replica = false,
}: Props) {
  const activeRooms = rooms.filter((room) => room.isActive || sessions.some(session => session.roomId === room.id));
  const knownRooms = new Set(activeRooms.map(room => room.id));
  for (const session of sessions) if (!knownRooms.has(session.roomId)) { activeRooms.push({id:session.roomId,name:"未建檔教室",isActive:false}); knownRooms.add(session.roomId); }
  const activeCoaches = coaches.filter(
    (coach) => coach.status === "ACTIVE" && coach.courseCoachEnabled || sessions.some(session => session.coachId === coach.id),
  );
  const knownCoaches = new Set(activeCoaches.map(coach=>coach.id));
  for(const session of sessions) if(!knownCoaches.has(session.coachId)) { activeCoaches.push({id:session.coachId,displayName:"未建檔老師",status:"INACTIVE",courseCoachEnabled:false}); knownCoaches.add(session.coachId); }
  const [resourceView, updateResourceView] = React.useState<ResourceView>(initialResourceView ?? (businessProfile === "MUSIC" && !replica ? "coach" : "room"));
  const [weekRoomId, setWeekRoomId] = React.useState(initialWeekRoomId ?? activeRooms[0]?.id ?? "");
  function setResourceView(view:ResourceView) { updateResourceView(view); onResourceChange?.(view); }
  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>("all");
  const [availabilityDuration, setAvailabilityDuration] = React.useState<30 | 60 | 90 | 120>(businessProfile === "MUSIC" ? 60 : 30);
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
  const boardRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    let frame = 0;
    function update() {
      frame = 0;
      const boundary = Math.max(0, ...Array.from(board!.querySelectorAll<HTMLElement>("[data-schedule-sticky-header]")).map(item => item.getBoundingClientRect().bottom));
      const updates = Array.from(board!.querySelectorAll<HTMLElement>('[data-schedule-card="tracking"]')).map(card => {
        const content = card.querySelector<HTMLElement>("[data-schedule-card-content]");
        if (!content) return null;
        const box = card.getBoundingClientRect();
        return {content, offset: courseCardContentOffset(box.top, card.clientHeight, content.offsetHeight, boundary)};
      });
      for (const item of updates) if (item) item.content.style.transform = `translateY(${item.offset}px)`;
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(update); }
    window.addEventListener("scroll", schedule, {capture:true, passive:true});
    board.addEventListener("scroll", schedule, {capture:true, passive:true});
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(board);
    schedule();
    return () => { window.removeEventListener("scroll", schedule, true); board.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); observer?.disconnect(); window.cancelAnimationFrame(frame); };
  }, [mode, selectedDate, weekRoomId, resourceView, sessions]);
  const dayScrollRef = React.useRef<HTMLDivElement>(null);
  const [dayScrollLeft, setDayScrollLeft] = React.useState(0);

  const hourHeight = 96;

  const Toolbar = businessProfile === "MUSIC" ? "div" : CourseScheduleToolbar;

  // Keep the all-room list when historical sessions have no active room.
  // A room-only grid must never silently hide those sessions.
  if (mode === "week" && (activeRooms.length > 0 || activeCoaches.length > 0)) {
    const start = weekStart(selectedDate);
    const dates = Array.from({ length: 7 }, (_, index) => addTaiwanDuration(start, index, "DAY"));
    const weekResources = resourceView === "room" ? activeRooms.map(room=>({id:room.id,name:room.name,enabled:room.isActive})) : activeCoaches.map(coach=>({id:coach.id,name:coach.displayName,enabled:coach.status === "ACTIVE" && coach.courseCoachEnabled}));
    const roomId = weekResources.some(resource=>resource.id===weekRoomId) ? weekRoomId : weekResources[0]?.id;
    const weekResource = weekResources.find(resource=>resource.id===roomId);
    const matchesResource = (session:Session) => (resourceView === "room" ? session.roomId : session.coachId) === roomId;
    const weekSessions = sessions.filter((session) => matchesResource(session) && dates.includes(sessionDate(session)));
    const weekTotals = scheduleTotals(weekSessions);
    const weekLanes = scheduleLanes(weekSessions,resourceView === "room" ? "roomId" : "coachId");
    const firstHour = Math.min(9, ...weekSessions.map(session => Number(hhmm(session.startsAt).slice(0, 2))));
    const lastHour = Math.max(22, ...weekSessions.map(session => Number(hhmm(session.endsAt).slice(0, 2)) + 1));
    const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
    return (
      <section ref={boardRef} className="space-y-1" aria-label="教室週課表">
        <Toolbar className={businessProfile === "MUSIC" ? "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-earth-700" : undefined}>
          <div className="inline-flex gap-1" aria-label="週表資源視角"><button type="button" className={`min-h-11 rounded px-2 ${resourceView === "room" ? "bg-primary-50 text-primary-900" : "text-earth-600"}`} onClick={()=>setResourceView("room")}>教室視角</button><button type="button" className={`min-h-11 rounded px-2 ${resourceView === "coach" ? "bg-primary-50 text-primary-900" : "text-earth-600"}`} onClick={()=>setResourceView("coach")}>{businessProfile === "MUSIC" ? "老師視角" : "教練視角"}</button></div>
          <label htmlFor="course-week-room" className="font-medium">{resourceView === "room" ? "教室" : businessProfile === "MUSIC" ? "老師" : "教練"}</label>
          {weekResources.length > 1 ? <select id="course-week-room" aria-label={resourceView === "room" ? "選擇週表教室" : "選擇週表老師"} value={roomId ?? ""} onChange={(event) => {setWeekRoomId(event.target.value);onResourceChange?.(resourceView,event.target.value);}} className="min-h-9 rounded-lg border border-earth-200 bg-white px-2 text-sm">
            {weekResources.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select> : <span className="font-medium text-primary-900">{weekResource?.name ?? "—"}</span>}
          <span className="text-sm font-medium">本週 {weekTotals.classes} 堂｜{(assignedFiltered || sessions.some(s=>s.displayBookings)) ? "所屬" : "名單"} {weekTotals.people} 人次｜租借 {weekTotals.rentals} 次</span>
          {legend && <div className="ml-auto [&>div]:flex-nowrap">{legend}</div>}
        </Toolbar>
        <div className="max-h-[calc(100dvh-16rem)] overflow-auto overscroll-contain rounded-lg border border-earth-200 bg-white">
          <div className="grid w-full" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
            <div data-schedule-sticky-header className="sticky left-0 top-0 z-30 border-b border-r border-earth-200 bg-earth-50 px-2 py-2 text-xs font-medium text-earth-600">時間</div>
            {dates.map((date, index) => {
              const total = scheduleTotals(scheduleOnDate(weekSessions, date));
              return <button data-schedule-sticky-header key={date} type="button" onClick={() => onSelectDate(date)} className={`sticky top-0 z-20 border-b border-r border-earth-200 px-1 py-1 text-center text-xs ${date === today ? "bg-primary-50 text-primary-900" : "bg-earth-50 text-earth-700"}`}>
                <strong className="block">{["一", "二", "三", "四", "五", "六", "日"][index]} {shortDate(date)}{date === today && <span className="ml-1 text-[10px] font-normal">今天</span>}</strong>
                {businessProfile === "MUSIC" ? (total.classes > 0 || total.people > 0 || total.rentals > 0) && <span>{total.classes > 0 ? `${total.classes} 堂` : ""}{total.rentals > 0 ? ` · 租借${total.rentals}` : ""}{total.people > 0 ? `｜${assignedFiltered ? "所屬 " : ""}${total.people} 人次` : ""}</span> : (total.classes > 0 || total.people > 0 || total.rentals > 0) && <span className="block whitespace-nowrap text-[11px] tabular-nums">{total.classes}堂・{total.people}人次{total.rentals > 0 && `・租借${total.rentals}`}</span>}
              </button>;
            })}
            {hours.map((hour) => <React.Fragment key={hour}>
              <div className="sticky left-0 z-20 h-[96px] border-b border-r border-earth-200 bg-white px-2 py-1 text-xs text-earth-600">
                {String(hour).padStart(2, "0")}:00
              </div>
              {dates.map((date) => {
                const list = weekSessions.filter((session) => sessionDate(session) === date && Number(hhmm(session.startsAt).slice(0, 2)) === hour);
                const shadows = sessions.filter((session) => session.rescheduledFromStartsAt &&
                  (resourceView === "room" ? session.rescheduledFromRoomId : session.rescheduledFromCoachId) === roomId &&
                  toLocalDateStr(new Date(session.rescheduledFromStartsAt)) === date &&
                  Number(hhmm(session.rescheduledFromStartsAt).slice(0, 2)) === hour);
                return <div key={`${date}:${hour}`} className="relative h-[96px] border-b border-r border-earth-100 bg-white">
                  <div className="absolute inset-0 grid grid-rows-2">{["00","30"].map(minute => {
                    const time = `${String(hour).padStart(2,"0")}:${minute}`;
                    const day = calendarDays?.[date];
                    const periods = normalizeAvailabilityPeriods(day ? day.periods : storePeriods);
                    const conflict = (occupiedSessions ?? sessions).some(session => !session.previewFaded && matchesResource(session) && sessionDate(session) === date && minuteOfDay(time) < minuteOfDay(hhmm(session.endsAt)) && minuteOfDay(time) + 30 > minuteOfDay(hhmm(session.startsAt)));
                    const exception = staffAvailabilityExceptions.find(item=>item.staffId===roomId && item.date===date);
                    const availability = staffAvailability.filter(item=>item.staffId===roomId);
                    const coachSegments = exception?.type === "UNAVAILABLE" ? [] : exception?.type === "CUSTOM" ? normalizeAvailabilityPeriods(exception.segments) : availability.length ? normalizeAvailabilityPeriods(availability.find(item=>item.dayOfWeek===parseLocalDate(date).getDay())?.segments) : periods;
                    const teacherOpen = resourceView === "room" || periodContains(coachSegments,time,30);
                    const available = weekResource?.enabled && periodContains(periods,time,30) && teacherOpen && !conflict && day?.status !== "closed" && day?.status !== "training";
                    const reason = conflict ? "已有課程" : !weekResource?.enabled ? "資源未啟用" : !teacherOpen ? "老師未開放" : "店家未開放";
                    return <button key={minute} type="button" disabled={!available || pending || readOnly || !canCreate} aria-label={`${date} ${time} ${available ? "排課" : reason}`} title={available ? `${date} ${time} · 排課 30 分鐘` : reason} onClick={() => onOpenEmpty({date,time,...(resourceView === "room" ? {roomId} : {coachId:roomId}),durationMinutes:30})} className={`group relative min-h-11 border-b border-earth-200 text-left last:border-b-0 ${available ? "bg-white hover:bg-primary-50 focus:bg-primary-50" : "bg-earth-100/60"}`}><span className="absolute left-1 top-1 text-xs text-primary-800 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">＋ {time}</span></button>;
                  })}</div>
                  {shadows.map((session) => {
                    const original = originalPlace(session);
                    return original && <div key={`shadow:${session.id}`} className="pointer-events-none absolute left-1 right-1 z-[5]" style={{ top: minuteOfDay(hhmm(original.startsAt)) % 60 * 96 / 60 + 2, height: Math.max(44, sessionDurationMinutes(original) * 96 / 60 - 4) }}>
                      <SessionCard session={original} templates={templates} coaches={coaches} rooms={rooms} dense resourceView={resourceView} businessProfile={businessProfile} fixed={session.isFixed} onOpen={() => {}} readOnly />
                    </div>;
                  })}
                  {list.map((session) => <div key={session.id} className={`absolute left-1 right-1 z-10 `} style={{ left: `calc(${(weekLanes.get(session.id)?.lane ?? 0) * 100 / (weekLanes.get(session.id)?.count ?? 1)}% + 4px)`, right: "auto", width:`calc(${100 / (weekLanes.get(session.id)?.count ?? 1)}% - 8px)`, top: Number(hhmm(session.startsAt).slice(3, 5)) * 96 / 60 + 2, height: Math.max(44, sessionDurationMinutes(session) * 96 / 60 - 4) }}>
                    <SessionCard session={session} templates={templates} coaches={coaches} rooms={rooms} dense resourceView={resourceView} businessProfile={businessProfile} fixed={session.isFixed} leaveCount={leaveCounts[session.id] ?? 0} readOnly={readOnly} onOpen={() => onOpenSession(session.id, date)} />
                  </div>)}
                </div>;
              })}
            </React.Fragment>)}
          </div>
        </div>
      </section>
    );
  }

  if (mode === "week") {
    const start = weekStart(selectedDate);
    const dates = Array.from({ length: 7 }, (_, index) =>
      addTaiwanDuration(start, index, "DAY"),
    );
    const weekSessions = sessions.filter((session) => dates.includes(sessionDate(session)));
    const weekTotals = scheduleTotals(weekSessions);
    return (
      <section className="space-y-2" aria-label="週課表">
        {businessProfile === "MUSIC" && <p className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm font-medium text-earth-800">本週 {weekTotals.classes} 堂｜{(assignedFiltered || sessions.some(s=>s.displayBookings)) ? "所屬" : "名單"} {weekTotals.people} 人次｜租借 {weekTotals.rentals} 次</p>}
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
                    <strong className="text-sm">{businessProfile === "MUSIC" ? `${scheduleTotals(list).classes} 堂｜${scheduleTotals(list).people} 人次` : `${list.length} 堂`}</strong>
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

  const daySessions = (occupiedSessions ?? sessions)
    .filter((session) => sessionDate(session) === selectedDate)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const dayTotals = scheduleTotals(scheduleOnDate(sessions, selectedDate));
  const filtered = sessions.filter(session => sessionDate(session) === selectedDate && filterSession(session, quickFilter));
  const resources =
    resourceView === "room"
      ? activeRooms.map((room) => ({ id: room.id, name: room.name }))
      : activeCoaches.map((coach) => ({ id: coach.id, name: coach.displayName }));
  const normalizedStorePeriods = normalizeAvailabilityPeriods(storePeriods);
  const boundaryMinutes = normalizedStorePeriods.flatMap((period)=>[minuteOfDay(period.openTime),minuteOfDay(period.closeTime)]);
  const sessionMinutes = filtered.flatMap((session)=>[minuteOfDay(hhmm(session.startsAt)),minuteOfDay(hhmm(session.endsAt))]);
  const minMinute = Math.min(...(boundaryMinutes.length ? boundaryMinutes : sessionMinutes.length ? sessionMinutes : [9*60]), ...[9*60]);
  const maxMinute = Math.max(...(boundaryMinutes.length ? boundaryMinutes : sessionMinutes.length ? sessionMinutes : [22*60]), ...[22*60]);
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
      if(session.previewFaded) return false;
      const same=resourceView==="room"?session.roomId===resourceId:session.coachId===resourceId;
      if(!same) return false;
      const sessionStart=minuteOfDay(hhmm(session.startsAt)),sessionEnd=minuteOfDay(hhmm(session.endsAt));
      return start<sessionEnd&&end>sessionStart;
    });
  };
  const pairConflict=(roomId:string,coachId:string,startTime:string,durationMinutes:number)=>{
    const start=minuteOfDay(startTime),end=start+durationMinutes;
    return daySessions.some(session=>{
      if(session.previewFaded) return false;
      if(session.id===moveClipboard?.sessionId) return false;
      if(session.roomId!==roomId&&session.coachId!==coachId) return false;
      const sessionStart=minuteOfDay(hhmm(session.startsAt)),sessionEnd=minuteOfDay(hhmm(session.endsAt));
      return start<sessionEnd&&end>sessionStart;
    });
  };
  const matchedPair = (roomId:string,time:string) => matchedSlots?.find(s => s.roomId === roomId && s.time === time);
  const resourceCount = Math.max(resources.length, 1);
  const musicDense = businessProfile === "MUSIC";
  const timelineDense = true;
  const timetableWidth = "100%";
  const timetableMinWidth = 64 + resourceCount * 200;
  const dayLanes = scheduleLanes(filtered, resourceView === "room" ? "roomId" : "coachId");

  const visibleDaySessions = scheduleOnDate(sessions, selectedDate).filter(session => !session.previewFaded);
  const booked = scheduleTotals(visibleDaySessions).people;
  const trials = visibleDaySessions.reduce(
    (sum, session) => sum + (session.displayBookings ?? scheduleRosterBookings(session.bookings)).filter((booking) => booking.bookingKind === "TRIAL").length,
    0,
  );
  const groupOnly=(session:Session)=>templates.find(item=>item.id===session.templateId)?.classType!=="PRIVATE";
  const capacitySessions=businessProfile==="MUSIC"?visibleDaySessions.filter(groupOnly):visibleDaySessions;
  const nearFull = capacitySessions.filter(isNearFull).length;
  const full = capacitySessions.filter(isFull).length;
  const pendingCount = visibleDaySessions.reduce(
    (sum, session) => sum + pendingCheckins(session),
    0,
  );

  const filters: Array<{ id: QuickFilter; label: string; value: number }> = [
    { id: "all", label: "今日安排", value: visibleDaySessions.length },
    { id: "trial", label: "體驗客", value: trials },
    { id: "near-full", label: "快滿", value: nearFull },
    { id: "full", label: "滿班", value: full },
    { id: "pending", label: businessProfile === "MUSIC" ? "待報到" : "待點名", value: pendingCount },
  ];

  const resourceViewControls = (
    <div className={musicDense ? "inline-flex rounded-lg border border-earth-200 bg-white p-0.5" : "inline-flex shrink-0 gap-1"} aria-label="課表資源視角">
          <button
            type="button"
            className={`${musicDense ? "min-h-8 px-3 text-xs" : "min-h-11 px-2 text-sm"} rounded-md ${resourceView === "room" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("room")}
          >
            教室視角
          </button>
          <button
            type="button"
            className={`${musicDense ? "min-h-8 px-3 text-xs" : "min-h-11 px-2 text-sm"} rounded-md ${resourceView === "coach" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("coach")}
          >
            {businessProfile === "MUSIC" ? "老師視角" : "教練視角"}
          </button>
        </div>
  );

  return (
    <section ref={boardRef} className="space-y-1" aria-label="日課表">

      <Toolbar className={musicDense ? "flex max-w-full flex-wrap items-center gap-2" : undefined}>
        {!musicDense && resourceViewControls}
        {musicDense && !replica && <span className="text-sm text-earth-700">今日 {dayTotals.classes} 堂｜{dayTotals.people} 人次{dayTotals.rentals > 0 ? `｜租借 ${dayTotals.rentals}` : ""}</span>}
        {(!musicDense || quickFilter !== "all") && !replica && <div
          className={musicDense ? "flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-earth-200 bg-white px-2 py-1.5" : "flex shrink-0 items-center gap-0.5 whitespace-nowrap"}
          aria-label="今日狀態快速篩選"
        >
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              disabled={pending}
              onClick={() => setQuickFilter(filter.id)}
              className={`${tab} ${!musicDense ? "!px-1.5" : ""} ${quickFilter === filter.id ? "bg-primary-50 text-primary-900" : "text-earth-600 hover:bg-earth-50"}`}
            >
              <span>{filter.label}</span>
              <strong className="ml-1">{filter.value}</strong>
            </button>
          ))}
          {!musicDense && <><span className="px-2 text-xs text-earth-300">｜</span>
          <span className="px-1 text-xs text-earth-600">
            {(assignedFiltered || sessions.some(s=>s.displayBookings)) ? "所屬" : "名單"} <strong className="text-earth-800">{booked}</strong> 人次
          </span></>}
        </div>}

        {!moveClipboard && !replica && (
          <label className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-earth-200 bg-white px-2 text-xs text-earth-600">
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

        {moveClipboard && <span role={matchError ? "alert" : "status"} className={`text-xs ${matchError ? "text-red-700" : "text-earth-600"}`}>
          {matchError || (matchedSlots ? `可貼空位 ${matchedSlots.length} 格` : "正在核對老師與教室…")}
        </span>}

        {musicDense && resourceViewControls}
        {!musicDense && legend && <div className="ml-auto shrink-0 [&>div]:flex-nowrap [&>div]:gap-x-2">{legend}</div>}
      </Toolbar>

      {!filtered.length && quickFilter !== "all" ? (
        <div className="rounded-xl border border-dashed border-earth-200 bg-white p-8 text-center text-earth-500">
          此篩選目前沒有課程
        </div>
      ) : (
        <div className={timelineDense ? "relative max-w-full rounded-xl border border-earth-200 bg-white" : "max-w-full pb-1"}>
          {timelineDense && (
            <div data-schedule-sticky-header className="sticky top-14 z-40 max-w-full overflow-hidden border-b border-earth-200 bg-earth-50/95 backdrop-blur-sm">
              <div aria-label="日表日期" className="flex min-h-9 items-center px-2 text-sm font-semibold text-primary-900">{selectedDate}{selectedDate === today ? " · 今天" : ""}</div>
              <div className="absolute bottom-0 left-0 top-9 z-50 flex w-16 items-center border-r border-earth-200 bg-earth-50 px-2 text-xs font-medium text-earth-500">
                時間
              </div>
              <div
                className="grid w-full will-change-transform"
                style={{
                  width: timetableWidth,
                  minWidth: timetableMinWidth,
                  gridTemplateColumns: `64px repeat(${resourceCount}, minmax(200px, 1fr))`,
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
            ref={timelineDense ? dayScrollRef : undefined}
            onScroll={timelineDense ? (event) => setDayScrollLeft(event.currentTarget.scrollLeft) : undefined}


            className={timelineDense ? "max-w-full overflow-x-auto overscroll-x-contain scroll-smooth pb-1" : "max-w-full overflow-x-auto pb-1"}
          >
            <div
              className={timelineDense ? "bg-white" : "overflow-hidden rounded-xl border border-earth-200 bg-white"}
              style={{
                width: timetableWidth,
                minWidth: timetableMinWidth,
              }}
            >
              <div
                className="grid w-full"
                style={{
                  gridTemplateColumns: `64px repeat(${resourceCount}, minmax(200px, 1fr))`,
                }}
              >
                {!timelineDense && (
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
                <div className={`sticky left-0 z-30 border-b border-r border-earth-100 bg-white px-2 text-xs font-medium text-earth-600 ${timelineDense ? "py-2" : "py-3"}`}>
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
                      className="relative border-b border-r border-earth-100" style={{height:hourHeight}}
                    >
                      {timelineDense && resource.id !== "__none" && (
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
                             const enabled = resourceView === "room" ? rooms.some(room=>room.id===resource.id && room.isActive) : coaches.some(coach=>coach.id===resource.id && coach.status==="ACTIVE" && coach.courseCoachEnabled);
                             const available=moveClipboard
                               ? Boolean(serverMatch) && !matchError
                               : enabled&&storeOpen&&resourceOpen&&qualified&&!hasConflict;
                             const origin = movedShadows.find((session) => {
                               const starts = session.rescheduledFromStartsAt;
                               const ends = session.rescheduledFromEndsAt;
                               return starts && ends && minuteOfDay(hhmm(starts)) < minuteOfDay(startTime) + duration && minuteOfDay(hhmm(ends)) > minuteOfDay(startTime);
                             });
                             const releasedHint = origin ? origin.isFixed
                               ? "原固定課已調走；此處僅可排單次臨時課"
                               : "原非固定課已調走；可核對後續時段再排固定課" : "";
                             const reason=moveClipboard
                               ? matchError || (!matchedSlots ? "正在核對空位" : "這裡沒有可排的合格老師或教室")
                               : !enabled?"資源未啟用":!storeOpen?"店家未開放":!resourceOpen?"老師未排班":!qualified?"老師未授此課":hasConflict?"已有課":"";
                             const coachIds = serverMatch?.coachIds ?? [];
                             const matches = resourceView === "coach" ? matchedSlots?.filter(s => s.time === startTime && s.coachIds.includes(resource.id)) ?? [] : [];
                             const choiceLabel = resourceView === "room" ? `${coachIds.length} 位老師可排` : `${matches.length} 間教室可排`;
                            return (
                              <button
                                key={minute}
                                type="button"
                                disabled={!available||pending||readOnly||!canCreate}
                                 title={readOnly ? "唯讀示意課表" : available?(moveClipboard?`${startTime} ${choiceLabel}`:`${startTime} 可排 ${availabilityDuration} 分鐘${releasedHint ? `；${releasedHint}` : ""}`):reason}
                                 aria-label={readOnly ? `${startTime} 唯讀示意課表` : available?(moveClipboard?`${startTime} ${choiceLabel}`:`${startTime} 可排 ${availabilityDuration} 分鐘${releasedHint ? `；${releasedHint}` : ""}`):`${startTime} ${reason}`}
                                 onClick={()=>available&&(moveClipboard&&onPasteMove
                                   ? (resourceView === "room"
                                       ? coachIds.length === 1
                                         ? onPasteMove({time:startTime,roomId:resource.id,coachId:coachIds[0]})
                                         : setTeacherChoice({time:startTime,roomId:resource.id,coachIds})
                                       : matches.length === 1
                                         ? onPasteMove({time:startTime,roomId:matches[0].roomId,coachId:resource.id})
                                         : setTeacherChoice({time:startTime,roomId:"",coachIds:[resource.id]}))
                                   : onOpenEmpty({time:startTime,durationMinutes:availabilityDuration,...(resourceView==="room"?{roomId:resource.id}:{coachId:resource.id})}))}
                                 className={`group relative touch-manipulation border-b border-earth-200/80 text-left last:border-b-0 ${readOnly ? available ? "bg-white" : "bg-earth-100" : available?(moveClipboard?"bg-indigo-50/70 hover:bg-indigo-100 active:bg-indigo-100":"bg-white hover:bg-primary-50 active:bg-primary-50"):"cursor-not-allowed bg-earth-100"}`}
                               >
                                 {available&&!readOnly&&<span className={`pointer-events-none absolute left-1 top-1 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-medium shadow-sm ${moveClipboard?"text-indigo-800":"hidden text-primary-800 group-hover:block group-focus-visible:block group-active:block"}`}>{moveClipboard ? choiceLabel : `＋ ${startTime}`}</span>}
                                 {!readOnly&&<span className="pointer-events-none absolute bottom-0.5 right-1 text-[9px] text-earth-500 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" aria-hidden="true">{minute}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {timelineDense && movedShadows.map((session) => {
                        const original = originalPlace(session);
                        return original && <div key={`moved:${session.id}`} className="pointer-events-none absolute left-1 right-1 z-[5]" style={{ top: minuteOfDay(hhmm(original.startsAt)) % 60 * hourHeight / 60 + 2, height: Math.max(21, sessionDurationMinutes(original) * hourHeight / 60 - 4) }}>
                          <SessionCard session={original} templates={templates} coaches={coaches} rooms={rooms} businessProfile={businessProfile} fixed={session.isFixed} dense resourceView={resourceView} onOpen={() => {}} readOnly />
                        </div>;
                      })}

                      <div className={timelineDense?"relative z-10 p-1 pointer-events-none":"contents"}>
                        {list.map((session) => (
                          <div
                            key={session.id}
                            className={timelineDense ? `absolute left-1 right-1 z-10 pointer-events-auto` : "pointer-events-auto"}
                            style={timelineDense ? {
                              left: `calc(${(dayLanes.get(session.id)?.lane ?? 0) * 100 / (dayLanes.get(session.id)?.count ?? 1)}% + 4px)`,
                              right: "auto",
                              width: `calc(${100 / (dayLanes.get(session.id)?.count ?? 1)}% - 8px)`,
                              top: minuteOfDay(hhmm(session.startsAt)) % 60 * hourHeight / 60 + 2,
                              height: Math.max(21, sessionDurationMinutes(session) * (hourHeight / 60) - 4),
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
                              wide={resourceCount === 1 && (dayLanes.get(session.id)?.count ?? 1) === 1}
                              dense={timelineDense}
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
