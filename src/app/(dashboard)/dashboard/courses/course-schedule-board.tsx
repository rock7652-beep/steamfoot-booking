"use client";
import {serviceCalendarPresentation} from "@/lib/service-calendar-presentation";
import {serviceTimelineBounds} from "@/lib/service-calendar-layout";
import {serviceScheduleTotals} from "@/lib/service-schedule-counts";
import {courseWeekStart as weekStart} from '@/lib/course-calendar';
import {useSportsCalendarState,useSportsCalendarScroll,calendarResource,calendarString} from "@/components/admin/use-sports-calendar-state";
import {sportsCalendarPresentation} from "@/lib/sports-calendar-presentation";
import { courseDisplayText } from "@/lib/course-display-text";
import { MUSIC_DEFAULT_DURATION_MINUTES } from "@/lib/music-teaching-item";
import styles from "./schedule-layout.module.css";
import { CourseScheduleToolbar } from "@/components/admin/course-schedule-toolbar";
import {musicScheduleColors} from "@/lib/music-schedule-colors";
import { courseClassPresentation } from "@/lib/course-class-presentation";

import React from "react";
import { scheduleLanes } from "@/lib/course-schedule-lanes";
import { courseCardContentOffset } from "@/lib/course-card-content-offset";

import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  parseTaipeiDateTime,
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
  occupiedStartsAt?:string;occupiedEndsAt?:string;
  servicePalette?:boolean;
  service?: {paymentStatus?:string;groupLabel?:string;groupProgress?:string;groupId?:string;personName:string;status:string;occupiedEndsAt:string;endsAt:string;buffer:number};
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
  sportsPalette?:boolean;
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
  startsAt?:string;
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
  serviceMode?:boolean;
  toolbarContent?:React.ReactNode;
  sportsNative?:boolean;
  businessProfile: "FITNESS" | "MUSIC";
  mode: Exclude<CourseScheduleMode, "month">;
  selectedDate: string;
  initialWeekRoomId?: string;
  legend?: React.ReactNode;
  searchControl?: React.ReactNode;
  hideDateHeading?: boolean;
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
  onOpenEmpty: (value:{single?:boolean;date?:string;time:string;roomId?:string;coachId?:string;durationMinutes?:number})=>void;
  moveClipboard?: CourseMoveClipboard | null;
  onPasteMove?: (value:{date?:string;time:string;roomId:string;coachId:string})=>void;
  onSelectDate: (date: string) => void;
  onOpenSession: (sessionId: string, date: string) => void;
  readOnly?: boolean;
  replica?: boolean;
};

type ResourceView = "room" | "coach";
type QuickFilter = "all" | "trial" | "near-full" | "full" | "pending";

const tab =
  `${styles.touchControl} min-h-8 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50`;

function hhmm(iso: string) {
  return formatTWDateTime(new Date(iso)).slice(11);
}

function sessionDate(session: Session) {
  return toLocalDateStr(new Date(session.startsAt));
}

function sessionDurationMinutes(session: Session) {
  return Math.max(5, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000));
}

function originalPlace(session: Session): Session | null {
  if(session.sportsPalette&&!session.isFixed)return null;
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
 if(session.service)return filter==='all'||(filter==='trial'&&session.bookings.some(b=>b.bookingKind==='TRIAL'))||(filter==='pending'&&session.service.status==='RESERVED');
  if (filter === "trial") return isTrial(session);
  if (filter === "near-full") return isNearFull(session);
  if (filter === "full") return isFull(session);
  if (filter === "pending") return pendingCheckins(session) > 0;
  return true;
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
    coaches.find((item) => item.id === session.coachId)?.displayName ?? (businessProfile === "MUSIC" ? "未指定教師" : "未指定教練");
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

export function ServiceCalendarLegend(){return <div aria-label="預約型態圖例" className="flex flex-wrap items-center gap-x-5 gap-y-2 py-1 text-sm text-earth-700">{[[false,false],[true,false],[false,true]].map(([trial,rental])=>{const p=serviceCalendarPresentation(trial,rental);return <span key={p.label} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"><i aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${p.dot}`}/>{p.label}</span>;})}</div>;}
function ServiceCleanup({session,minuteHeight}:{session:Session;minuteHeight:number}){
 if(!session.service||session.service.buffer<=0)return null;
 return <div aria-label={`整理至 ${hhmm(session.service.occupiedEndsAt)}`} className="pointer-events-none absolute left-0 right-0 top-full overflow-hidden border border-earth-200 text-[11px] text-earth-600" style={{marginTop:2,height:Math.max(8,session.service.buffer*minuteHeight-2),background:'repeating-linear-gradient(135deg,#f5f5f4,#f5f5f4 5px,#e7e5e4 5px,#e7e5e4 7px)'}}>整理至 {hhmm(session.service.occupiedEndsAt)}</div>;
}

function SessionCard({
  servicePixelHeight,
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
  servicePixelHeight?:number;
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
  const tone=musicScheduleColors({...session,isFixed:fixed,isTrial:trialClass});
  const presentation = session.servicePalette?serviceCalendarPresentation(!!trialClass,session.previewKind === "RENTAL",session.service?.status==='COMPLETED'):businessProfile === "MUSIC" ? {dot:tone.dot,label:session.previewKind==="RENTAL"?"租借":trialClass?"體驗":fixed?session.isBiweekly?"隔週固定":"每週固定":"單次課"} : session.sportsPalette?sportsCalendarPresentation(session):courseClassPresentation(templates.find(item=>item.id===session.templateId)?.classType, trialClass, session.previewKind === "RENTAL");
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
  const teacherTitle = businessProfile === "MUSIC" ? "教師" : "教練";
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
      tabIndex={session.sportsPalette&&session.previewFaded?-1:undefined}
      disabled={readOnly}
      className={`w-full rounded-md border text-left transition ${dense ? "flex h-full items-start overflow-hidden px-1.5 py-0.5" : "p-2"} ${session.servicePalette?serviceCalendarPresentation(!!trialClass,rental,session.service?.status==='COMPLETED').card:session.sportsPalette?sportsCalendarPresentation(session).card:businessProfile === "MUSIC" ? tone.fill :"hover:border-primary-300 hover:bg-primary-50/40 border-earth-300 bg-white"} focus:outline-none focus:ring-1 focus:ring-primary-300 ${session.previewFaded ? session.sportsPalette?"opacity-40":"border-dashed bg-earth-50 [filter:saturate(.55)]" : ""}`}
      data-service-schedule-kind={session.servicePalette?presentation.label:undefined}
      data-sports-schedule-kind={session.sportsPalette?sportsCalendarPresentation(session).kind:undefined}
      data-schedule-card={dense && !brief ? "tracking" : undefined}
      title={`${session.service?`${session.service.personName} · ${session.nameSnapshot} · ${session.service.paymentStatus??""} · `:""}${hhmm(session.startsAt)} ${businessProfile === "MUSIC" ? studentLabel : copy.primary} · ${rental ? copy.room : copy.coach}${businessProfile === "MUSIC" && originalCoach ? `（代替 ${originalCoach}）` : ""} · ${copy.room}${businessProfile === "MUSIC" ? ` · ${primaryType}${session.previewFaded ? ` · ${session.previewFaded}（原時段保留）` : ""}${destination ? ` · ${destination}` : ""}${moved ? ` · 原課 ${hhmm(session.rescheduledFromStartsAt!)}` : ""}${secondaryType ? ` · ${secondaryType}` : ""} · ${detailStatus}` : fixed ? ` · ${session.isBiweekly ? "隔週固定" : "每週固定"}` : ""}`}
      aria-label={`${session.service?`${session.service.personName}，${session.nameSnapshot}，${session.service.paymentStatus??""}，`:""}${businessProfile === "MUSIC" ? studentLabel : copy.primary}，${hhmm(session.startsAt)}，${rental ? copy.room : copy.coach}${businessProfile === "MUSIC" && originalCoach ? `代替 ${originalCoach}` : ""}${businessProfile === "MUSIC" ? `，${primaryType}${secondaryType ? `，${secondaryType}` : ""}，${detailStatus}` : fixed ? `，${session.isBiweekly ? "隔週固定" : "每週固定"}` : ""}`}
    >
      <div data-schedule-card-content className={`min-w-0 w-full ${dense && !brief ? "will-change-transform" : ""}`}>
      {session.service ? <div className="space-y-0.5 text-sm leading-5">
        {servicePixelHeight!==undefined&&servicePixelHeight<44?<div className="flex items-center gap-1"><span className="shrink-0 tabular-nums">{hhmm(session.startsAt)}</span><strong className="min-w-0 flex-1 truncate">{session.service.personName}</strong><span>·</span><strong className="min-w-0 flex-1 truncate">{session.nameSnapshot}</strong>{session.service.status==='COMPLETED'&&<span className="ml-auto">✓</span>}</div>:<>
        <div className="flex items-center justify-between gap-1 text-[13px] tabular-nums"><span>{hhmm(session.startsAt)}–{hhmm(session.service.endsAt)}</span><span>{servicePixelHeight!==undefined&&servicePixelHeight<76?<span className="inline-flex items-center gap-1">{session.service.status==='COMPLETED'?<span aria-label="已完成">✓</span>:session.service.status==='NO_SHOW'?'未到':null}{session.service.paymentStatus&&<span className="rounded border border-current/20 px-1 text-xs">{session.service.paymentStatus}</span>}</span>:({RESERVED:'已預約',COMPLETED:'✓ 已完成',NO_SHOW:'未到',CANCELLED:'已取消'} as Record<string,string>)[session.service.status]}</span></div>
        {servicePixelHeight!==undefined&&servicePixelHeight<76?<div className="flex min-w-0 items-center gap-1"><strong className="min-w-0 flex-1 truncate">{session.service.personName}</strong><span>·</span><strong className="min-w-0 flex-1 truncate">{session.nameSnapshot}</strong></div>:<><div className="flex min-w-0 items-center justify-between gap-1"><strong className="min-w-0 truncate">{session.nameSnapshot}</strong>{session.service.paymentStatus&&<span className="shrink-0 rounded border border-current/20 px-1 text-xs">{session.service.paymentStatus}</span>}</div><span className="block truncate">{session.service.personName} · {resourceView === 'coach' ? copy.room : copy.coach}</span>{session.service.groupLabel&&<span className="inline-block text-xs">{session.service.groupLabel} · {session.service.groupProgress}</span>}</>}
        {session.service.buffer>0&&!dense&&<span className="block text-xs text-earth-500">整理至 {hhmm(session.service.occupiedEndsAt)}</span>}
        </>}
      </div> : <>            <span className="sr-only">{presentation.label}</span>
      {!session.sportsPalette&&!musicDense&&(!dense || businessProfile === "MUSIC") && <span aria-hidden="true" className={`float-left mr-1.5 mt-1 h-2 w-2 rounded-full ${presentation.dot}`} />}
      {musicDense ? (
        <div className="min-w-0 text-sm">
          <div className="flex min-w-0 items-center gap-1 whitespace-nowrap text-sm leading-4 tabular-nums">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${presentation.dot}`} />
            <span className="shrink-0">{hhmm(session.startsAt)}–{hhmm(session.endsAt)}</span>
            {brief ? <strong className="min-w-0 flex-1 truncate">{copy.primary}</strong> : <span className="ml-auto min-w-0 truncate">{teacherState || resourceLabel}</span>}
            {brief && progressText && <span className={`shrink-0 font-semibold tabular-nums ${progressColor}`}>{progressText}</span>}
          </div>
          {!brief && <div className="flex min-w-0 items-center gap-1 text-sm leading-5">
            <strong className="min-w-0 flex-1 truncate">{musicContext ? `${musicContext} · ` : ""}{copy.primary}</strong>
            {progressText && <span className={`shrink-0 font-semibold tabular-nums ${progressColor}`}>{progressText}</span>}
          </div>}
        </div>
      ) : dense && businessProfile !== "MUSIC" ? (
        <div className={session.sportsPalette ? "space-y-0" : "space-y-0.5"}>
          <div className="flex items-center gap-1 whitespace-nowrap text-[13px] leading-4 tabular-nums">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${presentation.dot}`} />
            <span>{hhmm(session.startsAt)}–{hhmm(session.endsAt)}</span>
          </div>
          <div className={`flex min-w-0 items-center gap-1 text-sm ${session.sportsPalette ? "leading-4" : "leading-5"}`}>
            <strong className="min-w-0 flex-1 truncate" title={copy.primary}>{copy.primary}</strong>
            {brief && progressText && <span className={`shrink-0 font-semibold tabular-nums ${progressColor}`} title={teacherState || "點名完成度"}>{progressText}</span>}
          </div>
          {!brief && <div className={`flex min-w-0 items-center gap-1 text-[13px] ${session.sportsPalette ? "leading-4" : "leading-5"}`}>
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
        {session.sportsPalette && <span className="text-[10px] font-medium">{presentation.label}</span>}
        {fixed && businessProfile !== "MUSIC" && !session.sportsPalette && (
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
      </>}
      </div>
    </button>
  );
}

export function CourseScheduleBoard({
  serviceMode=false,
  toolbarContent,
  sportsNative=false,
  legend,
  searchControl,
  hideDateHeading = false,
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
  function releasedSeed(date:string,time:string,resourceId:string,view:ResourceView) {
    if(!sportsNative)return {};
    const source=sessions.map(s=>s.previewFaded?s:originalPlace(s)).find(s=>s&&(view==="room"?s.roomId:s.coachId)===resourceId&&sessionDate(s)===date&&minuteOfDay(time)>=minuteOfDay(hhmm(s.startsAt))&&minuteOfDay(time)<minuteOfDay(hhmm(s.endsAt)));
    return source?{roomId:source.roomId,coachId:source.coachId}:{};
  }
  function openCard(session:Session,date:string) {
    if(sportsNative&&session.previewFaded){if(canCreate&&!pending&&!readOnly)onOpenEmpty({date,time:hhmm(session.startsAt),roomId:session.roomId,coachId:session.coachId,durationMinutes:Math.round((new Date(session.endsAt).getTime()-new Date(session.startsAt).getTime())/60000),single:true});return;}
    onOpenSession(session.id,date);
  }
  const activeRooms = rooms.filter((room) => room.isActive || sessions.some(session => session.roomId === room.id));
  const knownRooms = new Set(activeRooms.map(room => room.id));
  for (const session of sessions) if (!knownRooms.has(session.roomId)) { activeRooms.push({id:session.roomId,name:"未建檔教室",isActive:false}); knownRooms.add(session.roomId); }
  const activeCoaches = coaches.filter(
    (coach) => coach.status === "ACTIVE" && coach.courseCoachEnabled || sessions.some(session => session.coachId === coach.id),
  );
  const knownCoaches = new Set(activeCoaches.map(coach=>coach.id));
  for(const session of sessions) if(!knownCoaches.has(session.coachId)) { activeCoaches.push({id:session.coachId,displayName:"未建檔老師",status:"INACTIVE",courseCoachEnabled:false}); knownCoaches.add(session.coachId); }
  const [resourceView, updateResourceView] = useSportsCalendarState<ResourceView>(sportsNative,"resourceView",initialResourceView ?? (businessProfile === "MUSIC" && !replica ? "coach" : "room"),calendarResource);
  const [weekRoomId, setWeekRoomId] = useSportsCalendarState(sportsNative,`resourceId:${resourceView}`,initialWeekRoomId ?? activeRooms[0]?.id ?? "",calendarString);
  React.useEffect(()=>{if(sportsNative&&initialResourceView)updateResourceView(initialResourceView);},[sportsNative,initialResourceView,updateResourceView]);
  React.useEffect(()=>{if(sportsNative&&initialWeekRoomId)setWeekRoomId(initialWeekRoomId);},[sportsNative,initialWeekRoomId,setWeekRoomId]);
  function setResourceView(view:ResourceView) { updateResourceView(view); onResourceChange?.(view); }
  const [quickFilter, setQuickFilter] = useSportsCalendarState<QuickFilter>(sportsNative,"quickFilter","all",(v):v is QuickFilter=>v==="all"||v==="trial"||v==="near-full"||v==="full"||v==="pending");
  const [availabilityDuration, setAvailabilityDuration] = useSportsCalendarState<30 | 50 | 60 | 90 | 120>(sportsNative,"availabilityDuration",businessProfile === "MUSIC" ? MUSIC_DEFAULT_DURATION_MINUTES : 30,(v):v is 30|50|60|90|120=>v===30||v===50||v===60||v===90||v===120);
  const [matchedSlots, setMatchedSlots] = React.useState<MusicSlotMatch[] | null>(null);
  const [matchError, setMatchError] = React.useState("");
  const [teacherChoice, setTeacherChoice] = React.useState<{time:string;roomId:string;coachIds:string[]} | null>(null);
  React.useEffect(() => {
    if (sportsNative || businessProfile !== "MUSIC" || mode !== "day" || !moveClipboard) {
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
  }, [businessProfile, sportsNative, mode, selectedDate, moveClipboard]);
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
  const weekScrollRef=React.useRef<HTMLDivElement>(null);
  useSportsCalendarScroll(sportsNative&&mode==="week",`week:${resourceView}`,weekScrollRef);
  useSportsCalendarScroll(sportsNative&&mode==="day",`timeline:${mode}:${resourceView}`,dayScrollRef);
  const [dayScrollLeft, setDayScrollLeft] = React.useState(0);

  const serviceDates=mode==='week'?Array.from({length:7},(_,i)=>addTaiwanDuration(weekStart(selectedDate),i,'DAY')):[selectedDate];
  const serviceBounds=serviceMode?serviceTimelineBounds(serviceDates.flatMap(d=>calendarDays?.[d]?.periods??storePeriods),(occupiedSessions??sessions).filter(s=>serviceDates.includes(sessionDate(s)))):{firstHour:9,endHour:22};
  const [serviceHourHeight,setServiceHourHeight]=React.useState(60);
  React.useEffect(()=>{
    if(!serviceMode||!boardRef.current)return;
    const board=boardRef.current;
    const update=()=>{const touch=window.matchMedia('(pointer: coarse)').matches;const grid=mode==='week'?weekScrollRef.current:dayScrollRef.current;const gridTop=(grid??board).getBoundingClientRect().top+window.scrollY+(mode==='week'?40:0);const available=window.innerHeight-gridTop-16;setServiceHourHeight(Math.max(touch?90:48,Math.min(88,Math.floor(available/(serviceBounds.endHour-serviceBounds.firstHour)))));};
    update();const observer=new ResizeObserver(update);observer.observe(board);window.addEventListener('resize',update);return()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[serviceMode,mode,serviceBounds.firstHour,serviceBounds.endHour]);
  const hourHeight = serviceMode ? serviceHourHeight : businessProfile === "MUSIC" ? 64 : sportsNative ? 88 : 96;

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
    const weekLanes = scheduleLanes(weekSessions.filter(s=>!(sportsNative&&s.previewFaded)),resourceView === "room" ? "roomId" : "coachId");
    const firstHour = serviceMode?serviceBounds.firstHour:Math.min(9, ...weekSessions.map(session => Number(hhmm(session.startsAt).slice(0, 2))));
    const lastHour = serviceMode?serviceBounds.endHour:Math.max(22, ...weekSessions.map(session => businessProfile === "MUSIC" ? Math.ceil(minuteOfDay(hhmm(session.endsAt))/60) : Number(hhmm(session.endsAt).slice(0, 2)) + 1));
    const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
    return (
      <section ref={boardRef} className="space-y-1" data-service-hour-height={serviceMode?hourHeight:undefined} aria-label={serviceMode?"服務週班表":"教室週課表"}>

        <Toolbar className={businessProfile === "MUSIC" ? `${styles.musicToolbar} flex-wrap` : serviceMode ? "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-earth-700" : undefined}>
          {searchControl}
          <div className="inline-flex gap-1" aria-label="週表資源視角"><button type="button" className={`min-h-11 rounded px-2 ${resourceView === "room" ? "bg-primary-50 text-primary-900" : "text-earth-600"}`} onClick={()=>setResourceView("room")}>{serviceMode?"位置視角":"教室視角"}</button><button type="button" className={`min-h-11 rounded px-2 ${resourceView === "coach" ? "bg-primary-50 text-primary-900" : "text-earth-600"}`} onClick={()=>setResourceView("coach")}>{serviceMode ? "技師視角" : businessProfile === "MUSIC" ? "教師視角" : courseDisplayText("教練視角", businessProfile)}</button></div>
          <label htmlFor="course-week-room" className={businessProfile === "MUSIC" ? "sr-only" : "font-medium"}>{resourceView === "room" ? (serviceMode?"位置":"教室") : serviceMode ? "技師" : businessProfile === "MUSIC" ? "教師" : courseDisplayText("教練", businessProfile)}</label>
          {weekResources.length > 1 ? <select id="course-week-room" aria-label={serviceMode?(resourceView==='room'?'選擇週表位置':'選擇週表技師'):resourceView === "room" ? "選擇週表教室" : "選擇週表老師"} value={roomId ?? ""} onChange={(event) => {setWeekRoomId(event.target.value);onResourceChange?.(resourceView,event.target.value);}} className="min-h-9 rounded-lg border border-earth-200 bg-white px-2 text-sm">
            {weekResources.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select> : <span className="font-medium text-primary-900">{weekResource?.name ?? "—"}</span>}
          <span className="text-sm font-medium">{serviceMode?`本週 ${serviceScheduleTotals(weekSessions).groups} 筆預約・${serviceScheduleTotals(weekSessions).people} 人次`:businessProfile === "MUSIC" ? <>{weekTotals.classes} 堂・{weekTotals.people} 人次{weekTotals.rentals > 0 && `・租借 ${weekTotals.rentals}`}</> : <>本週 {weekTotals.classes} 堂｜{(assignedFiltered || sessions.some(s=>s.displayBookings)) ? "所屬" : "名單"} {weekTotals.people} 人次｜租借 {weekTotals.rentals} 次</>}</span>
          {serviceMode&&toolbarContent}{legend && <div className="ml-auto [&>div]:flex-nowrap">{legend}</div>}
        </Toolbar>
        <div ref={weekScrollRef} className={`${serviceMode?"":"max-h-[calc(100dvh-16rem)]"} overflow-auto overscroll-contain rounded-lg border border-earth-200 bg-white`}>
          <div className="grid w-full min-w-[900px]" style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}>
            <div data-schedule-sticky-header className="sticky left-0 top-0 z-30 border-b border-r border-earth-200 bg-earth-50 px-2 py-2 text-xs font-medium text-earth-600">時間</div>
            {dates.map((date, index) => {
              const daySessions=scheduleOnDate(weekSessions,date),total = scheduleTotals(daySessions);
              return <button data-schedule-sticky-header key={date} type="button" onClick={() => onSelectDate(date)} className={`${styles.touchControl} sticky top-0 z-20 border-b border-r border-earth-200 px-1 py-1 text-center text-xs ${date === today ? "bg-primary-50 text-primary-900" : "bg-earth-50 text-earth-700"}`}>
                <strong className="block">{["一", "二", "三", "四", "五", "六", "日"][index]} {shortDate(date)}{date === today && <span className="ml-1 text-[10px] font-normal">今天</span>}</strong>
                {serviceMode?daySessions.length>0&&<span className="block text-xs tabular-nums">{serviceScheduleTotals(daySessions).groups}筆・{serviceScheduleTotals(daySessions).people}人次</span>:businessProfile === "MUSIC" ? (total.classes > 0 || total.people > 0 || total.rentals > 0) && <span>{total.classes > 0 ? `${total.classes} 堂` : ""}{total.rentals > 0 ? ` · 租借${total.rentals}` : ""}{total.people > 0 ? `｜${assignedFiltered ? "所屬 " : ""}${total.people} 人次` : ""}</span> : (total.classes > 0 || total.people > 0 || total.rentals > 0) && <span className="block whitespace-nowrap text-[11px] tabular-nums">{total.classes}堂・{total.people}人次{total.rentals > 0 && `・租借${total.rentals}`}</span>}
              </button>;
            })}
            {hours.map((hour) => <React.Fragment key={hour}>
              <div className="sticky left-0 z-20 border-b border-r border-earth-200 bg-white px-2 py-1 text-xs text-earth-600" style={{height:hourHeight}}>
                {String(hour).padStart(2, "0")}:00
              </div>
              {dates.map((date) => {
                const list = weekSessions.filter((session) => sessionDate(session) === date && Number(hhmm(session.startsAt).slice(0, 2)) === hour);
                const shadows = sessions.filter((session) => session.rescheduledFromStartsAt &&
                  (resourceView === "room" ? session.rescheduledFromRoomId : session.rescheduledFromCoachId) === roomId &&
                  toLocalDateStr(new Date(session.rescheduledFromStartsAt)) === date &&
                  Number(hhmm(session.rescheduledFromStartsAt).slice(0, 2)) === hour);
                return <div key={`${date}:${hour}`} className="relative border-b border-r border-earth-100 bg-white" style={{height:hourHeight}}>
                  <div className="absolute inset-0 grid grid-rows-2">{["00","30"].map(minute => {
                    const time = `${String(hour).padStart(2,"0")}:${minute}`;
                    const day = calendarDays?.[date];
                    const periods = normalizeAvailabilityPeriods(day ? day.periods : storePeriods);
                    const slotDuration = moveClipboard?.durationMinutes ?? 30;
                    const slotStart=parseTaipeiDateTime(date,time)!;
                    const conflict = (occupiedSessions ?? sessions).some(session => !session.previewFaded && session.id !== moveClipboard?.sessionId && matchesResource(session) && +slotStart < +new Date(session.occupiedEndsAt??session.service?.occupiedEndsAt??session.endsAt) && +slotStart+slotDuration*60000 > +new Date(session.occupiedStartsAt??session.startsAt));
                    const exception = staffAvailabilityExceptions.find(item=>item.staffId===roomId && item.date===date);
                    const availability = staffAvailability.filter(item=>item.staffId===roomId);
                    const coachSegments = exception?.type === "UNAVAILABLE" ? [] : exception?.type === "CUSTOM" ? normalizeAvailabilityPeriods(exception.segments) : availability.length ? normalizeAvailabilityPeriods(availability.find(item=>item.dayOfWeek===parseLocalDate(date).getDay())?.segments) : periods;
                    const teacherOpen = resourceView === "room" || periodContains(coachSegments,time,slotDuration);
                    const available = weekResource?.enabled && periodContains(periods,time,slotDuration) && teacherOpen && !conflict && day?.status !== "closed" && day?.status !== "training";
                    const reason = conflict ? (serviceMode?"已有預約":"已有課程") : !weekResource?.enabled ? "資源未啟用" : !teacherOpen ? (serviceMode?"技師未開放":"老師未開放") : "店家未開放";
                    return <button key={minute} type="button" disabled={!available || pending || readOnly || !canCreate} aria-label={`${date} ${time} ${available ? moveClipboard?"貼上":serviceMode?"新增預約":"排課" : reason}`} title={available ? `${date} ${time} · ${moveClipboard?"貼上課程":`排課 ${sportsNative?60:30} 分鐘`}` : reason} onClick={() => moveClipboard&&onPasteMove?onPasteMove({date,time,roomId:resourceView==="room"?roomId!:moveClipboard.roomId,coachId:resourceView==="coach"?roomId!:moveClipboard.coachId}):onOpenEmpty({date,time,...(resourceView === "room" ? {roomId} : {coachId:roomId}),durationMinutes:sportsNative?60:30,...(sportsNative?{single:true}:{}),...releasedSeed(date,time,roomId!,resourceView)})} className={`group relative ${businessProfile === "MUSIC" ? "min-h-0" : "min-h-11"} ${sportsNative?"touch-manipulation hover:z-20 focus-visible:z-20":""} border-b border-earth-200 text-left last:border-b-0 ${available ? "bg-white hover:bg-primary-50 focus:bg-primary-50" : "bg-earth-100/60"}`}><span className="absolute left-1 top-1 text-xs text-primary-800 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">{moveClipboard?"貼上":"＋"} {time}</span></button>;
                  })}</div>
                  {shadows.map((session) => {
                    const original = originalPlace(session);
                    return original && <div key={`shadow:${session.id}`} className="pointer-events-none absolute left-1 right-1 z-[5]" style={{ top: minuteOfDay(hhmm(original.startsAt)) % 60 * hourHeight / 60 + 2, height: Math.max(businessProfile === "MUSIC" ? 21 : 44, sessionDurationMinutes(original) * hourHeight / 60 - 4) }}>
                      <SessionCard session={original} templates={templates} coaches={coaches} rooms={rooms} dense resourceView={resourceView} businessProfile={businessProfile} fixed={session.isFixed} onOpen={() => {}} readOnly />
                    </div>;
                  })}
                  {list.map((session) => <div key={session.id} className={`absolute left-1 right-1 z-10 ${sportsNative&&session.previewFaded?"pointer-events-none":""}`} style={{ left: `calc(${(weekLanes.get(session.id)?.lane ?? 0) * 100 / (weekLanes.get(session.id)?.count ?? 1)}% + 4px)`, right: "auto", width:`calc(${100 / (weekLanes.get(session.id)?.count ?? 1)}% - 8px)`, top: Number(hhmm(session.startsAt).slice(3, 5)) * hourHeight / 60 + 2, height: Math.max(serviceMode||businessProfile === "MUSIC"?21:44, sessionDurationMinutes(session) * hourHeight / 60 - 4) }}>
                    <SessionCard servicePixelHeight={serviceMode?sessionDurationMinutes(session)*hourHeight/60-4:undefined} session={session} templates={templates} coaches={coaches} rooms={rooms} dense resourceView={resourceView} businessProfile={businessProfile} fixed={session.isFixed} leaveCount={leaveCounts[session.id] ?? 0} readOnly={readOnly} onOpen={() => openCard(session, date)} />
                    <ServiceCleanup session={session} minuteHeight={hourHeight/60}/>
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
                    <strong className="text-sm">{serviceMode?`${serviceScheduleTotals(list).groups} 筆預約・${serviceScheduleTotals(list).people} 人次`:businessProfile === "MUSIC" ? `${scheduleTotals(list).classes} 堂｜${scheduleTotals(list).people} 人次` : `${list.length} 堂`}</strong>
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
                          onOpen={() => openCard(session, date)}
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

  const dayTotals = scheduleTotals(scheduleOnDate(sessions, selectedDate));
  const filtered = sessions.filter(session => sessionDate(session) === selectedDate && filterSession(session, quickFilter));
  const resources =
    resourceView === "room"
      ? activeRooms.map((room) => ({ id: room.id, name: room.name }))
      : activeCoaches.map((coach) => ({ id: coach.id, name: coach.displayName }));
  const normalizedStorePeriods = normalizeAvailabilityPeriods(storePeriods);
  const boundaryMinutes = normalizedStorePeriods.flatMap((period)=>[minuteOfDay(period.openTime),minuteOfDay(period.closeTime)]);
  const sessionMinutes = filtered.flatMap((session)=>[minuteOfDay(hhmm(session.startsAt)),minuteOfDay(hhmm(session.endsAt))]);
  // Music starts with 09:00–22:00; actual lessons (including moved shadows)
  // outside that window stay visible without expanding for unused opening hours.
  const movedMinutes = sessions.flatMap(session => session.rescheduledFromStartsAt && session.rescheduledFromEndsAt && sessionDate({...session, startsAt:session.rescheduledFromStartsAt}) === selectedDate ? [minuteOfDay(hhmm(session.rescheduledFromStartsAt)), minuteOfDay(hhmm(session.rescheduledFromEndsAt))] : []);
  const visibleMinutes = businessProfile === "MUSIC" ? [...sessionMinutes, ...movedMinutes] : boundaryMinutes.length ? boundaryMinutes : sessionMinutes;
  const minMinute = serviceMode?serviceBounds.firstHour*60:Math.min(9*60, ...visibleMinutes);
  const maxMinute = serviceMode?serviceBounds.endHour*60:Math.max(22*60, ...visibleMinutes);
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
    return (occupiedSessions??sessions).some(session=>{
      if(session.previewFaded) return false;
      const same=resourceView==="room"?session.roomId===resourceId:session.coachId===resourceId;
      if(!same) return false;
      const slotStart=parseTaipeiDateTime(selectedDate,startTime)!;
      return +slotStart<+new Date(session.occupiedEndsAt??session.service?.occupiedEndsAt??session.endsAt)&&+slotStart+durationMinutes*60000>+new Date(session.occupiedStartsAt??session.startsAt);
    });
  };
  const pairConflict=(roomId:string,coachId:string,startTime:string,durationMinutes:number)=>{
    return (occupiedSessions??sessions).some(session=>{
      if(session.previewFaded) return false;
      if(session.id===moveClipboard?.sessionId) return false;
      if(session.roomId!==roomId&&session.coachId!==coachId) return false;
      const slotStart=parseTaipeiDateTime(selectedDate,startTime)!;
      return +slotStart<+new Date(session.occupiedEndsAt??session.service?.occupiedEndsAt??session.endsAt)&&+slotStart+durationMinutes*60000>+new Date(session.occupiedStartsAt??session.startsAt);
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

  const filters: Array<{ id: QuickFilter; label: string; value: number }> = serviceMode?[{id:"all",label:"當日安排",value:serviceScheduleTotals(visibleDaySessions).groups},{id:"trial",label:"體驗",value:trials},{id:"pending",label:"待服務",value:visibleDaySessions.filter(s=>s.service?.status==="RESERVED").length}]:[
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
            className={`${styles.touchControl} ${musicDense ? "min-h-8 px-3 text-xs" : "min-h-11 px-2 text-sm"} rounded-md ${resourceView === "room" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("room")}
          >
            {serviceMode?"位置視角":"教室視角"}
          </button>
          <button
            type="button"
            className={`${styles.touchControl} ${musicDense ? "min-h-8 px-3 text-xs" : "min-h-11 px-2 text-sm"} rounded-md ${resourceView === "coach" ? "bg-primary-50 font-medium text-primary-900" : "text-earth-600"}`}
            onClick={() => setResourceView("coach")}
          >
            {serviceMode ? "技師視角" : businessProfile === "MUSIC" ? "教師視角" : courseDisplayText("教練視角", businessProfile)}
          </button>
        </div>
  );

  return (
    <section ref={boardRef} className="space-y-1" data-service-hour-height={serviceMode?hourHeight:undefined} aria-label={serviceMode?"日班表":"日課表"}>


      <Toolbar className={musicDense ? styles.musicToolbar : serviceMode ? "flex max-w-full flex-wrap items-center gap-2 !overflow-visible [&>*]:!shrink" : undefined}>
        {searchControl}
        {!musicDense && resourceViewControls}
        {musicDense && !replica && <span className="text-sm text-earth-700 whitespace-nowrap">{dayTotals.classes} 堂・{dayTotals.people} 人次{dayTotals.rentals > 0 ? `｜租借 ${dayTotals.rentals}` : ""}</span>}
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

        {!serviceMode && !moveClipboard && !replica && (
          <label className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-earth-200 bg-white px-2 text-xs text-earth-600">
            <span>找空位</span>
            <select
              aria-label="找空位所需時長"
              className="bg-transparent font-medium text-earth-800 outline-none"
              value={availabilityDuration}
              onChange={(event) => setAvailabilityDuration(Number(event.target.value) as 30 | 50 | 60 | 90 | 120)}
            >
              {(businessProfile === "MUSIC" ? [30, MUSIC_DEFAULT_DURATION_MINUTES, 60, 90, 120] : [30, 60, 90, 120]).map((minutes) => <option key={minutes} value={minutes}>{minutes} 分</option>)}
            </select>
          </label>
        )}

        {moveClipboard && !sportsNative && <span role={matchError ? "alert" : "status"} className={`text-xs ${matchError ? "text-red-700" : "text-earth-600"}`}>
          {matchError || (matchedSlots ? `可貼空位 ${matchedSlots.length} 格` : "正在核對老師與教室…")}
        </span>}

        {serviceMode&&toolbarContent}
        {musicDense && resourceViewControls}
        {legend && <div className="ml-auto shrink-0 [&>div]:flex-nowrap [&>div]:gap-x-2">{legend}</div>}
      </Toolbar>

      {quickFilter !== "all" && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-earth-600"><span>{quickFilter === "pending" ? serviceMode?"目前只顯示待服務預約。":"目前只顯示待點名；出席與缺席紀錄仍保留。" : "目前顯示篩選結果。"}</span><button type="button" className="min-h-11 rounded px-3 font-medium text-primary-800" onClick={()=>setQuickFilter("all")}>{serviceMode?"查看全部服務":"查看全部課程（含已點名）"}</button></div>}
      {!filtered.length && quickFilter !== "all" ? (
        <div className="rounded-xl border border-dashed border-earth-200 bg-white p-8 text-center text-earth-500">
          此篩選目前沒有課程
        </div>
      ) : (
        <div className={timelineDense ? "relative max-w-full rounded-xl border border-earth-200 bg-white" : "max-w-full pb-1"}>
          {timelineDense && (
            <div data-schedule-sticky-header className="sticky top-14 z-40 max-w-full overflow-hidden border-b border-earth-200 bg-earth-50/95 backdrop-blur-sm">
              {!serviceMode&&<div aria-label="日表日期" className={hideDateHeading?"sr-only":"flex min-h-9 items-center px-2 text-sm font-semibold text-primary-900"}>{selectedDate}{selectedDate === today ? " · 今天" : ""}</div>}
              <div className={`absolute bottom-0 left-0 ${serviceMode||hideDateHeading?"top-0":"top-9"} z-50 flex w-16 items-center border-r border-earth-200 bg-earth-50 px-2 text-xs font-medium text-earth-500`}>
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
                        尚無可用{resourceView === "room" ? "教室" : businessProfile === "MUSIC" ? "教師" : "教練"}
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
                             const duration=moveClipboard?.durationMinutes ?? (sportsNative?30:availabilityDuration);
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
                               ? sportsNative ? enabled&&storeOpen&&resourceOpen&&qualified&&!hasConflict : Boolean(serverMatch) && !matchError
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
                                 title={readOnly ? "唯讀示意課表" : available?(moveClipboard?`${startTime} ${sportsNative?"貼上課程":choiceLabel}`:`${startTime} 可排 ${sportsNative?60:availabilityDuration} 分鐘${releasedHint ? `；${releasedHint}` : ""}`):reason}
                                 aria-label={readOnly ? `${startTime} 唯讀示意課表` : available?(moveClipboard?`${startTime} ${sportsNative?"貼上課程":choiceLabel}`:`${startTime} 可排 ${sportsNative?60:availabilityDuration} 分鐘${releasedHint ? `；${releasedHint}` : ""}`):`${startTime} ${reason}`}
                                 onClick={()=>available&&(sportsNative&&moveClipboard&&onPasteMove?onPasteMove({date:selectedDate,time:startTime,roomId:resourceView==="room"?resource.id:moveClipboard.roomId,coachId:resourceView==="coach"?resource.id:moveClipboard.coachId}):moveClipboard&&onPasteMove
                                   ? (resourceView === "room"
                                       ? coachIds.length === 1
                                         ? onPasteMove({time:startTime,roomId:resource.id,coachId:coachIds[0]})
                                         : setTeacherChoice({time:startTime,roomId:resource.id,coachIds})
                                       : matches.length === 1
                                         ? onPasteMove({time:startTime,roomId:matches[0].roomId,coachId:resource.id})
                                         : setTeacherChoice({time:startTime,roomId:"",coachIds:[resource.id]}))
                                   : onOpenEmpty({time:startTime,durationMinutes:sportsNative?60:availabilityDuration,...(sportsNative?{single:true}:{}),...(resourceView==="room"?{roomId:resource.id}:{coachId:resource.id}),...releasedSeed(selectedDate,startTime,resource.id,resourceView)}))}
                                 className={`group relative ${sportsNative?"hover:z-20 focus-visible:z-20":""} touch-manipulation border-b border-earth-200/80 text-left last:border-b-0 ${readOnly ? available ? "bg-white" : "bg-earth-100" : available?(moveClipboard?"bg-indigo-50/70 hover:bg-indigo-100 active:bg-indigo-100":"bg-white hover:bg-primary-50 active:bg-primary-50"):"cursor-not-allowed bg-earth-100"}`}
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
                            className={timelineDense ? `absolute left-1 right-1 z-10 ${sportsNative&&session.previewFaded?"pointer-events-none":"pointer-events-auto"}` : "pointer-events-auto"}
                            style={timelineDense ? {
                              left: `calc(${(dayLanes.get(session.id)?.lane ?? 0) * 100 / (dayLanes.get(session.id)?.count ?? 1)}% + 4px)`,
                              right: "auto",
                              width: `calc(${100 / (dayLanes.get(session.id)?.count ?? 1)}% - 8px)`,
                              top: minuteOfDay(hhmm(session.startsAt)) % 60 * hourHeight / 60 + 2,
                              height: Math.max(21, sessionDurationMinutes(session) * (hourHeight / 60) - 4),
                            } : undefined}
                          >
                            <SessionCard
                              servicePixelHeight={serviceMode?sessionDurationMinutes(session)*hourHeight/60-4:undefined}
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
                              onOpen={() => openCard(session, selectedDate)}
                            />
                            {timelineDense&&<ServiceCleanup session={session} minuteHeight={hourHeight/60}/>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
              </div>
              {musicDense && <div aria-label="課表結束時間" className="border-t border-earth-200 px-2 py-1 text-xs text-earth-600">{String(lastHour + 1).padStart(2, "0")}:00</div>}
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
            <button type="button" className="mt-3 min-h-10 w-full rounded-lg border border-earth-200" onClick={() => setTeacherChoice(null)}>返回課表</button>
          </div>
        </div>
      )}
    </section>
  );
}
