"use client";
import {useCourseDisplayOrder} from "@/components/admin/course-display-order";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

import {CourseTestDataFilter,isCourseTestData} from "@/components/admin/course-test-data-filter";
import {CourseStatusButton,useCourseStatusRows} from "@/components/admin/course-status-button";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";

import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { Fragment, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CourseRoster } from "./roster";
import { MusicScheduleWizard } from "./music-schedule-wizard";
import { DailyAttendanceList, type DailyAttendanceRow } from "./daily-attendance-list";
import {
  CourseScheduleBoard,
  type CourseScheduleMode,
  type CourseMoveClipboard,
} from "./course-schedule-board";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  addTaiwanDuration,
  formatTWDateTime,
  parseLocalDate,
  parseTaipeiDateTime,
  toLocalDateStr,
} from "@/lib/date-utils";
import {
  updateCourseSeries,
  createCourseRoom,
  createCourseTemplate,
  createCourseSchedule,
  updateCourseRoom,
  updateCourseTemplate,
  deleteUnusedCourseTemplate,
  updateCourseSession,
  moveCourseSessions,
  setCourseCatalogStatus,
  batchCourseTemplates,
} from "@/server/actions/course";
import { courseClassPresentation } from "@/lib/course-class-presentation";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { courseSessionStatus } from "@/lib/course-session-status";
import { scheduleRosterBookings, scheduleOccupiedCount, scheduleAssignedBookings } from "@/lib/course-schedule-counts";
import { buildCourseOccurrences } from "@/lib/course-scheduling";
import { scheduleTotals } from "@/lib/music-schedule-audit";

type Room = {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  capacity: number | null;
  details?: string;
  equipment?:string;location?:string;visibility?:string;classType?:string|null;
  musicPricePerLesson?:number|null;musicTermLessons?:number|null;musicValidityDaysPerTerm?:number|null;musicScheduleMode?:string|null;musicTrialMode?:string|null;musicTeacherFeeBase?:number|null;
  uses?: { id:string;nameSnapshot: string; startsAt: string }[];
};
type Template = Omit<Room, "capacity"> & {
  musicSubjectId?:string|null;musicSubject?:{id:string;name:string;isActive:boolean}|null;
  durationMinutes: number;
  capacity: number;
  pointCost: number;
  defaultRoomId: string | null;
  description?: string;
  precautions?: string;
  waitlistEnabled?: boolean;
  waitlistLimit?: number;
  waitlistStopMinutes?: number | null;
};
type Session = {
  bookings: {
    id: string;
    customerId: string;
    customerName: string;
    assignedCoachId?: string | null;
    absenceKind?: string | null;
    status: string;
    checkedInAt?: string | null;
    bookingKind: string;
  }[];
  displayBookings?: Session["bookings"];
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
  previewFaded?: "異動／請假" | "已調課";
  previewStudentNames?: string[];
  previewKind?: "RENTAL";
  rescheduledFromStartsAt?: string | null;
  rescheduledFromEndsAt?: string | null;
  rescheduledFromRoomId?: string | null;
  rescheduledFromCoachId?: string | null;
  rescheduleKind?: string | null;
  rescheduledAt?: string | null;
};
type Props = {
  displayOrder?:CourseOrderSnapshot;
  selectedDate: string;
  today: string;
  nowIso: string;
  calendarDays: Record<
    string,
    { status: "open" | "closed" | "training" | "custom"; reason: string | null; periods: {openTime:string;closeTime:string}[] }
  >;
  staffAvailability: {staffId:string;dayOfWeek:number;segments:unknown}[];
  staffAvailabilityExceptions: {staffId:string;date:string;type:string;segments:unknown;reason:string|null}[];
  rooms: Room[];
  templates: Template[];
  sessions: Session[];
  coaches: { id: string; displayName: string; phone: string; status: string;courseCoachEnabled:boolean;courseQualificationsConfirmed:boolean;courseQualifiedTemplateIds:string[] }[];
  cancelledBookings: {id:string;customerName:string;sessionId:string;absenceKind:string|null;notes:string}[];
  canCreate: boolean;
  canDelete?: boolean;
  canEdit: boolean;
  cashbookShortcut?: ReactNode;
  businessProfile: "FITNESS" | "MUSIC";
  waitlistEnabled?: boolean;
  waitlistDefaultLimit?: number;
  waitlistDefaultStopMinutes?: number;
  view: "schedule" | "catalog" | "rooms";
};
const button =
  "min-h-10 rounded-lg border border-earth-200 px-3 py-1.5 text-sm disabled:opacity-50";
const primary = `${button} bg-primary-700 text-white`;
const field =
  "min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";

const waitlistStopChoices = [0, 60, 120, 240, 360, 720, 1440];
function waitlistStopLabel(minutes: number) {
  if (minutes === 0) return "至開課前";
  return `${minutes / 60} 小時`;
}

function WaitlistFields({
  defaultEnabled,
  defaultLimit,
  defaultStopMinutes,
}: {
  defaultEnabled: boolean;
  defaultLimit: number;
  defaultStopMinutes: number;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const stopChoices = waitlistStopChoices.includes(defaultStopMinutes)
    ? waitlistStopChoices
    : [...waitlistStopChoices, defaultStopMinutes].sort((a, b) => a - b);
  return (
    <fieldset className="col-span-full rounded-lg border border-earth-200 p-3">
      <legend className="px-1 text-sm font-medium">候補設定</legend>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          name="waitlistEnabled"
          value="yes"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        本課程允許滿班候補
      </label>
      <div className={`mt-2 grid gap-3 sm:grid-cols-2 ${enabled ? "" : "opacity-45"}`}>
        <label>
          候補人數上限
          <input
            className={field}
            name="waitlistLimit"
            type="number"
            min={1}
            max={100}
            defaultValue={defaultLimit}
            disabled={!enabled}
          />
        </label>
        <label>
          停止自動遞補
          <select
            className={field}
            name="waitlistStopMinutes"
            defaultValue={String(defaultStopMinutes)}
            disabled={!enabled}
          >
            {stopChoices.map((minutes) => (
              <option key={minutes} value={minutes}>{waitlistStopLabel(minutes)}</option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

export function CourseWorkspace({
  displayOrder,
  canDelete=false,
  selectedDate: loadedDate,
  today,
  nowIso,
  calendarDays,
  rooms: sourceRooms,
  templates: allTemplates,
  sessions,
  cancelledBookings,
  coaches: allCoaches,
  canCreate,
  canEdit,
  cashbookShortcut,
  businessProfile,
  waitlistEnabled = false,
  waitlistDefaultLimit = 5,
  waitlistDefaultStopMinutes = 240,
  staffAvailability,
  staffAvailabilityExceptions,
  view,
}: Props) {
  const coaches = allCoaches.filter((c) => c.status === "ACTIVE" && c.courseCoachEnabled);
  const [allRooms,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(sourceRooms);
  const rooms = allRooms.filter((r) => r.isActive);
  const templates = allTemplates.filter((t) => t.isActive && t.musicSubject?.isActive !== false);
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const requestedDate = params.get("date");
  const selectedDate = requestedDate && parseTaipeiDateTime(requestedDate, "00:00") ? requestedDate : loadedDate;
  const requestedScheduleMode = params.get("scheduleView");
  const [scheduleMode, setScheduleMode] = useState<CourseScheduleMode>(
    requestedScheduleMode === "day" || requestedScheduleMode === "week" || requestedScheduleMode === "month"
      ? requestedScheduleMode
      : businessProfile === "MUSIC"
        ? "day"
        : "month",
  );
  function changeScheduleMode(nextMode: CourseScheduleMode) {
    setScheduleMode(nextMode);
    const next = new URLSearchParams(params.toString());
    next.set("scheduleView", nextMode);
    window.history.replaceState(null, "", `${pathname}?${next}`);
  }
  const [courseDialog, setCourseDialog] = useState<{
    sessionId: string;
    kind: "roster" | "member-booking" | "trial-booking";
  } | null>(
    params.get("session")
      ? { sessionId: params.get("session")!, kind: "roster" }
      : null,
  );
  const [memberBookingReady, setMemberBookingReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pendingAttendance, setPendingAttendance] = useState<Record<string, "ATTENDED" | "NO_SHOW" | "CANCELLED" | "RESERVED">>({});
  const [pendingLeaveIds,setPendingLeaveIds]=useState<string[]>([]);
  const [pendingTeacherAttendance, setPendingTeacherAttendance] = useState<Record<string, "SCHEDULED" | "LEAVE" | "NO_SHOW">>({});
  useEffect(() => {
    setPendingAttendance(previous => {
      const remaining = Object.fromEntries(Object.entries(previous).filter(([bookingId,status]) =>
        !(status==="CANCELLED"?cancelledBookings.some(booking=>booking.id===bookingId):sessions.some(session => session.bookings.some(booking => booking.id === bookingId && booking.status === status)))));
      return Object.keys(remaining).length === Object.keys(previous).length ? previous : remaining;
    });
  }, [sessions,cancelledBookings]);
  useEffect(()=>{
    setPendingLeaveIds(previous=>{
      const remaining=previous.filter(id=>!cancelledBookings.some(booking=>booking.id===id));
      return remaining.length===previous.length?previous:remaining;
    });
  },[cancelledBookings]);
  useEffect(() => {
    setPendingTeacherAttendance(previous => {
      const remaining=Object.fromEntries(Object.entries(previous).filter(([sessionId,status])=>!sessions.some(session=>session.id===sessionId&&session.teacherAttendance===status)));
      return Object.keys(remaining).length===Object.keys(previous).length?previous:remaining;
    });
  },[sessions]);
  function showPendingAttendance(bookingId:string,status:"ATTENDED"|"NO_SHOW"|"CANCELLED"|"RESERVED"|null,leave=false) {
    setPendingLeaveIds(previous=>status==="CANCELLED"&&leave?[...new Set([...previous,bookingId])]:previous.filter(id=>id!==bookingId));
    setPendingAttendance(previous => {
      if(status)return {...previous,[bookingId]:status};
      const next={...previous};delete next[bookingId];return next;
    });
  }
  const [panel, setPanel] = useState<
    "day" | "schedule" | "catalog" | "edit" | "inspect" | null
  >(canCreate && params.get("action") === "schedule" ? "schedule" : params.get("action") === "booking" || params.get("session") ? "day" : null);
  useEffect(() => {
    if (view !== "schedule" || panel !== "day") return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLastUpdated(new Date());
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [panel, router, view]);
  const [dirty, setDirty] = useState(false);
  const restoreScrollY = useRef<number | null>(null);
  useEffect(() => {
    if (restoreScrollY.current === null) return;
    const y = restoreScrollY.current;
    restoreScrollY.current = null;
    window.requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [allTemplates, sourceRooms]);

  function closePanel() {
    if (pending || (dirty && !window.confirm("尚有未儲存的修改，要放棄並關閉嗎？"))) return;
    setDirty(false);
    setPanel(null);
  }
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [roomFilter, setRoomFilter] = useState(params.get("room") ?? "all");
  const [classFilter, setClassFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [assignedCoachFilter, setAssignedCoachFilter] = useState("all");
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [hideTestData,setHideTestData]=useState(false);
  const [showInactive,setShowInactive]=useState(false);
  const catalogItems = view === "rooms" ? allRooms : allTemplates;
  const categories = [
    ...new Set(catalogItems.map((item) => item.category)),
  ].sort();
  const order=useCourseDisplayOrder("room",allRooms,displayOrder,view==="rooms"&&canEdit&&!query&&status==="all"&&category==="all"&&!hideTestData&&!busyIds.length,r=>r.isActive);
  const filteredItems = catalogItems
    .filter(
      (item) =>
        (!hideTestData||!isCourseTestData(item.name)) && item.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()) &&
        (status === "all" || (view === "rooms" ? item.isActive === (status === "active") : (item.visibility ?? (item.isActive?"PUBLIC":"OFF")) === status)) &&
        (category === "all" || item.category === category) &&
        (view !== "catalog" || classFilter === "all" || ("classType" in item && (classFilter === "TRIAL" ? !!item.musicTrialMode : !item.musicTrialMode && item.classType === classFilter))) &&
        (view === "rooms" ||
          roomFilter === "all" ||
          ("defaultRoomId" in item && item.defaultRoomId === roomFilter)),
    )
    .sort((a, b) => {
      const rank = (item: Room) => !item.isActive ? 2 : item.visibility === "HIDDEN" ? 1 : 0;
      return rank(a) - rank(b) || (view==="rooms"?order.compare(a,b):0) || (businessProfile === "MUSIC" && view === "catalog" ? a.category.localeCompare(b.category, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant") : 0);
    });
  const isInactiveItem=(item:Room|Template)=>view==="rooms"?!item.isActive:!item.isActive||item.visibility==="OFF";
  const activeFilteredItems=filteredItems.filter(item=>!isInactiveItem(item));
  const inactiveFilteredItems=filteredItems.filter(isInactiveItem);
  const inactiveForced=status===(view==="rooms"?"inactive":"OFF")||!!query||category!=="all"||roomFilter!=="all"||classFilter!=="all";
  const inactiveExpanded=inactiveForced||showInactive;
  const visibleItems=[...activeFilteredItems,...(inactiveExpanded?inactiveFilteredItems:[])];
  function changeStatus(item: Room, visibility?:string) {
    if (pending) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await setCourseCatalogStatus({
          id: item.id,
          kind: view === "rooms" ? "room" : "template",
          isActive: visibility ? visibility!=="OFF" : !item.isActive,
          visibility,
        });
        if (!result.success) {
          setError(result.error ?? "更新失敗");setConflicts(result.conflicts ?? []);
          return;
        }
        setNotice("狀態已更新，既有預約與歷史保留。");
        router.refresh();
      } catch {
        setError("連線失敗，請重試。");
      }
    });
  }
  const [conflicts,setConflicts]=useState<ConflictItem[]>([]);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [copyTemplate,setCopyTemplate]=useState(false);
  const [editTemplateId,setEditTemplateId]=useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState(templates[0]?.id ?? "");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [repeat, setRepeat] = useState(false);
  const [multipleDates, setMultipleDates] = useState(false);
  const [scheduleSummary, setScheduleSummary] = useState("");
  const [editing, setEditing] = useState<
    | { kind: "room"; value: Room }
    | { kind: "template"; value: Template }
    | { kind: "session"; value: Session }
    | null
  >(null);
  const month = selectedDate.slice(0, 7),
    first = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(year, mon, 0).getDate();
  const filteredScheduleSessions = sessions.filter(
    (s) =>
      (roomFilter === "all" || s.roomId === roomFilter) &&
      (coachFilter === "all" || s.coachId === coachFilter) &&
      (category === "all" || allTemplates.find((t) => t.id === s.templateId)?.category === category) &&
      (businessProfile === "MUSIC" || assignedCoachFilter === "all" || scheduleAssignedBookings(s.bookings, assignedCoachFilter).length > 0) &&
      (!scheduleQuery.trim() || [s.nameSnapshot, ...s.bookings.map(booking => booking.customerName)].some(text => text.toLocaleLowerCase().includes(scheduleQuery.trim().toLocaleLowerCase()))),
  ).map((session) => ({
    ...session,
    displayBookings: businessProfile !== "MUSIC" && assignedCoachFilter !== "all" ? scheduleAssignedBookings(session.bookings, assignedCoachFilter) : undefined,
    previewKind: /租借|RENTAL/i.test(allTemplates.find((template) => template.id === session.templateId)?.category ?? "")
      ? "RENTAL" as const
      : undefined,
  }));
  const monthSessions = filteredScheduleSessions.filter((session) =>
    !session.previewFaded && toLocalDateStr(new Date(session.startsAt)).startsWith(month),
  ).map((session) => ({ ...session,
    previewKind: /租借|RENTAL/i.test(allTemplates.find((template) => template.id === session.templateId)?.category ?? "")
      ? "RENTAL" as const : undefined,
  }));
  const monthTotals = scheduleTotals(monthSessions);
  const scheduleFiltered = coachFilter !== "all" || roomFilter !== "all" || category !== "all" || businessProfile !== "MUSIC" && assignedCoachFilter !== "all" || !!scheduleQuery.trim();
  const dailySessions = sessions.filter((session) => toLocalDateStr(new Date(session.startsAt)) === selectedDate);
  const absentStudents: DailyAttendanceRow[] = dailySessions.flatMap((session) => {
    const teacherStatus = pendingTeacherAttendance[session.id] ?? session.teacherAttendance;
    if (teacherStatus === "LEAVE" || teacherStatus === "NO_SHOW") return [];
    return session.bookings.filter((booking) => (pendingAttendance[booking.id] ?? booking.status) === "RESERVED").map((booking) => ({ id:booking.id,sessionId:session.id,status:"RESERVED" as const, startsAt:session.startsAt,endsAt:session.endsAt,course:session.nameSnapshot,teacher:allCoaches.find(coach=>coach.id===session.coachId)?.displayName??"未指定老師",name:booking.customerName }));
  });
  const leaveStudents: DailyAttendanceRow[] = cancelledBookings.filter(booking=>["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")).flatMap((booking) => {
    const session = dailySessions.find((item) => item.id === booking.sessionId);
    return session ? [{ id:booking.id,sessionId:session.id,status:"CANCELLED" as const,startsAt:session.startsAt,endsAt:session.endsAt,course:session.nameSnapshot,teacher:allCoaches.find(coach=>coach.id===session.coachId)?.displayName??"未指定老師",name:booking.customerName,note:booking.notes }] : [];
  });
  const [dailyList, setDailyList] = useState<"leave" | "unmarked" | null>(null);
  const byDate = new Map<string, Session[]>();
  for (const session of filteredScheduleSessions) {
    const day = toLocalDateStr(new Date(session.startsAt));
    byDate.set(day, [...(byDate.get(day) ?? []), session]);
  }
  for (const list of byDate.values()) list.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id));
  function go(date: string) {
    const next = new URLSearchParams(params.toString());
    next.set("date", date);
    if (date.slice(0, 7) === loadedDate.slice(0, 7)) {
      // All sessions for this month are already loaded. Keep the open sheet,
      // filters and scroll position instead of remounting through navigation.
      window.history.replaceState(null, "", `${pathname}?${next}`);
    } else startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }
  function open(next: typeof panel) {
    setConflicts([]);
    setDirty(false);
    setPanel(next);
    setExtraDateKeys([]);
    setRoomCapacityNotice("");
    setError("");
    setNotice("");
  }
  const [roomCapacityNotice, setRoomCapacityNotice] = useState("");
  const [extraDateKeys, setExtraDateKeys] = useState<string[]>([]);
  const [copySource, setCopySource] = useState<Session | null>(null);
  const [moveChoice, setMoveChoice] = useState<Session | null>(null);
  const [moveClipboard, setMoveClipboard] = useState<CourseMoveClipboard | null>(null);
  const [moveWeeksOpen, setMoveWeeksOpen] = useState(false);
  const [moveClipboardLoaded, setMoveClipboardLoaded] = useState(false);
  const moveStorageKey = `course-move:${pathname}`;

  useEffect(() => {
    if (businessProfile !== "MUSIC") return;
    try {
      const saved = window.sessionStorage.getItem(moveStorageKey);
      if (saved) setMoveClipboard((current) => current ?? JSON.parse(saved) as CourseMoveClipboard);
    } catch {
      // A stale clipboard must never block the schedule.
    } finally {
      setMoveClipboardLoaded(true);
    }
  }, [businessProfile, moveStorageKey]);

  useEffect(() => {
    if (businessProfile !== "MUSIC" || !moveClipboardLoaded) return;
    try {
      if (moveClipboard) window.sessionStorage.setItem(moveStorageKey, JSON.stringify(moveClipboard));
      else window.sessionStorage.removeItem(moveStorageKey);
    } catch {
      // sessionStorage is only a convenience for cross-month moves.
    }
  }, [businessProfile, moveClipboard, moveClipboardLoaded, moveStorageKey]);

  const [scheduleSeed,setScheduleSeed]=useState<{date?:string;time?:string;roomId?:string;coachId?:string;durationMinutes?:number}>({});
  function beginMove(session: Session, scope: CourseMoveClipboard["scope"], weeks?: number) {
    const durationMinutes = Math.max(30, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000));
    setMoveClipboard({
      sessionId: session.id,
      templateId: session.templateId,
      coachId: session.coachId,
      roomId: session.roomId,
      durationMinutes,
      scope,
      weeks,
      label: session.bookings[0]?.customerName || session.nameSnapshot,
    });
    setMoveChoice(null);
    setMoveWeeksOpen(false);
    setCourseDialog(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setNotice("");
    setError("");
  }
  function pasteMove(value: {time:string;roomId:string;coachId:string}) {
    if (!moveClipboard || pending) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await moveCourseSessions({
          id: moveClipboard.sessionId,
          scope: moveClipboard.scope,
          weeks: moveClipboard.weeks,
          date: selectedDate,
          time: value.time,
          roomId: value.roomId,
          coachId: value.coachId,
        });
        if (!result.success) {
          setError(result.error ?? "這裡目前不能貼上");
          return;
        }
        setMoveClipboard(null);
        setNotice("已調課");
        router.refresh();
      } catch {
        setError("調課失敗，原課程保留。");
      }
    });
  }
  function restoreMove(session: Session) {
    if (pending || !session.rescheduledFromStartsAt || !session.rescheduledFromRoomId || !session.rescheduledFromCoachId) return;
    const original = new Date(session.rescheduledFromStartsAt);
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await moveCourseSessions({
          id: session.id,
          scope: "SINGLE",
          date: toLocalDateStr(original),
          time: formatTWDateTime(original).slice(11, 16),
          roomId: session.rescheduledFromRoomId,
          coachId: session.rescheduledFromCoachId,
          restore: true,
        });
        if (!result.success) {
          setError(result.error ?? "目前無法恢復原時段");
          return;
        }
        setCourseDialog(null);
        setNotice("已恢復原時段");
        router.refresh();
      } catch {
        setError("恢復失敗，課程保留在目前時段。");
      }
    });
  }
  function updateScheduleForm(e: FormEvent<HTMLFormElement>) {
    const fields = new FormData(e.currentTarget);
    const templateChanged = e.target instanceof HTMLSelectElement && e.target.name === "templateId";
    const nextTemplate = templates.find(item => item.id === fields.get("templateId"));
    if (templateChanged && nextTemplate) {
      // Template-dependent controls remount after this event; preview their new defaults.
      fields.set("duration", String(scheduleSeed.durationMinutes ?? nextTemplate.durationMinutes));
      fields.set("capacity", String(nextTemplate.capacity));
      fields.set("roomId", scheduleSeed.roomId ?? nextTemplate.defaultRoomId ?? rooms[0]?.id ?? "");
    }
    try {
      const occurrences = buildCourseOccurrences({
        templateId: String(fields.get("templateId") || chosen),
        roomId: String(fields.get("roomId") || ""),
        coachId: String(fields.get("coachId") || ""),
        date: String(fields.get("date") || ""),
        time: String(fields.get("time") || ""),
        durationMinutes: Number(fields.get("duration")),
        capacity: Number(fields.get("capacity")),
        requestKey,
        repeatUntil: fields.get("repeatMode") === "weekly" ? String(fields.get("until") || "") : undefined,
        weekdays: fields.getAll("weekday").length ? fields.getAll("weekday").map(Number) : undefined,
        additionalDates: fields.get("repeatMode") === "dates" ? fields.getAll("additionalDates").map(String) : undefined,
      });
      const first = occurrences[0];
      setScheduleSummary(`共 ${occurrences.length} 堂 · ${formatTWDateTime(first.startsAt)}–${formatTWDateTime(first.endsAt).slice(11)}${occurrences.length > 1 ? ` · 至 ${toLocalDateStr(occurrences[occurrences.length - 1].startsAt)}` : ""}`);
    } catch {
      setScheduleSummary("請完成日期與時段，確認排課範圍");
    }
    const limit = rooms.find(room => room.id === fields.get("roomId"))?.capacity;
    setRoomCapacityNotice(limit && Number(fields.get("capacity")) > limit ? `人數上限超過教室容納 ${limit} 人，請確認容量` : "");
  }
  function openSchedule(seed: {date?:string;time?:string;roomId?:string;coachId?:string;durationMinutes?:number} = {}) {
    setCopySource(null);
    setScheduleSeed(seed);
    setChosen(templates[0]?.id ?? "");
    setRequestKey(crypto.randomUUID());
    setRepeat(false);
    setMultipleDates(false);
    setExtraDateKeys([]);
    setScheduleSummary("");
    open("schedule");
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (
      data: FormData,
    ) => Promise<{ success: boolean; error?: string; conflicts?:ConflictItem[]; data?: unknown }>,
    after?: (data: FormData) => void,
  ) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget,
      data = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const result = await action(data);
        if (!result.success) {
          setError(result.error ?? "儲存失敗，請重試");setConflicts(result.conflicts ?? []);
          return;
        }
        const count =
          result.data &&
          typeof result.data === "object" &&
          "count" in result.data
            ? result.data.count
            : null;
        setNotice(
          typeof count === "number" ? `已建立 ${count} 堂課程` : "已儲存",
        );
        setDirty(false);
        form.reset();
        after?.(data);
        if (panel === "catalog" || (panel === "edit" && editing?.kind !== "session")) {
          restoreScrollY.current = window.scrollY;
        }
        if (panel === "catalog") setPanel(null);
        router.refresh();
      } catch {
        setError("連線失敗，請重試；重複送出不會重複排課。");
      }
    });
  }
  const template = templates.find((t) => t.id === chosen);
  return (
    <>
      {!panel && <CourseConflicts items={conflicts}/>}
      {view === "schedule" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="mr-1 min-w-[112px]">
                <h1 className="text-base font-semibold text-earth-900">{businessProfile === "MUSIC" ? "音樂課表" : "課表排程"}</h1>
                <p className="hidden text-[11px] text-earth-500 sm:block">安排與查看店內課程</p>
              </div>
              <div
                className="inline-flex rounded-lg border border-earth-200 bg-white p-1"
                aria-label="課表視角"
              >
                {(["month", "week", "day"] as CourseScheduleMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={pending}
                    onClick={() => changeScheduleMode(mode)}
                    className={`min-h-8 rounded-md px-3 text-sm ${
                      scheduleMode === mode
                        ? "bg-primary-50 font-medium text-primary-900"
                        : "text-earth-600"
                    }`}
                  >
                    {mode === "month" ? "月表" : mode === "week" ? "週表" : "日表"}
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-1">
                <button
                  className={`${button} min-h-9 px-2.5`}
                  disabled={pending}
                  aria-label={
                    scheduleMode === "month"
                      ? "上個月"
                      : scheduleMode === "week"
                        ? "上一週"
                        : "前一天"
                  }
                  onClick={() =>
                    go(
                      scheduleMode === "month"
                        ? addTaiwanDuration(first, -1, "MONTH")
                        : addTaiwanDuration(
                            selectedDate,
                            -1,
                            scheduleMode === "week" ? "WEEK" : "DAY",
                          ),
                    )
                  }
                >
                  ‹
                </button>
                <button
                  className={`${button} min-h-9 px-3`}
                  disabled={pending}
                  onClick={() => go(today)}
                >
                  今天
                </button>
                <button
                  className={`${button} min-h-9 px-2.5`}
                  disabled={pending}
                  aria-label={
                    scheduleMode === "month"
                      ? "下個月"
                      : scheduleMode === "week"
                        ? "下一週"
                        : "後一天"
                  }
                  onClick={() =>
                    go(
                      scheduleMode === "month"
                        ? addTaiwanDuration(first, 1, "MONTH")
                        : addTaiwanDuration(
                            selectedDate,
                            1,
                            scheduleMode === "week" ? "WEEK" : "DAY",
                          ),
                    )
                  }
                >
                  ›
                </button>
              </div>
              <label className="sr-only" htmlFor="course-schedule-date">課表日期</label>
              <input
                id="course-schedule-date"
                key={selectedDate}
                aria-label="課表日期"
                type="date"
                defaultValue={selectedDate}
                disabled={pending}
                onChange={(event) => {
                  const date = event.target.value;
                  if (parseTaipeiDateTime(date, "00:00")) go(date);
                }}
                className="min-h-9 rounded-lg border border-earth-200 bg-white px-2.5 text-sm text-earth-700"
              />
              <span className="hidden text-sm font-medium text-earth-700 xl:inline">
                {scheduleMode === "month"
                  ? `${year} 年 ${mon} 月`
                  : scheduleMode === "week"
                    ? `${selectedDate} 當週`
                    : selectedDate}
              </span>
            </div>
            {(cashbookShortcut || canCreate || canEdit) && (
              <div className="flex shrink-0 gap-2">
                {cashbookShortcut}
                {canCreate && (
                  <button
                    className={`${primary} min-h-9`}
                    disabled={pending}
                    onClick={()=>openSchedule()}
                  >
                    ＋ 排課
                  </button>
                )}
              </div>
            )}
          </div>

          {<div className="relative z-10 flex flex-wrap items-end gap-2 rounded-xl border border-primary-200 bg-primary-50/50 px-2 py-2">
            <label className="text-xs font-medium text-earth-700" htmlFor="course-coach-filter">{businessProfile === "MUSIC" ? "授課老師" : "授課教練"}
            <select
              id="course-coach-filter"
              aria-label="教練篩選"
              className={`${button} mt-1 block min-h-11 bg-white py-1 ${coachFilter !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
            >
              <option value="all">{businessProfile === "MUSIC" ? "全部授課老師" : "全部授課教練"}</option>
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.displayName}
                </option>
              ))}
            </select>
            </label><label className="text-xs font-medium text-earth-700" htmlFor="course-room-filter">教室
            <select
              id="course-room-filter"
              aria-label="教室篩選"
              className={`${button} mt-1 block min-h-11 bg-white py-1 ${roomFilter !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
              value={roomFilter}
              onChange={(e)=>{setSelectedIds([]);setRoomFilter(e.target.value);}}
            >
              <option value="all">全部教室</option>
              {allRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            </label><label className="text-xs font-medium text-earth-700" htmlFor="course-category-filter">課程分類
            <select
              id="course-category-filter"
              aria-label="課程分類篩選"
              className={`${button} mt-1 block min-h-11 bg-white py-1 ${category !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
              value={category}
              onChange={(e)=>{setSelectedIds([]);setCategory(e.target.value);}}
            >
              <option value="all">全部分類</option>
              {[...new Set(allTemplates.map((template) => template.category))].map((item) => (
                <option key={item} value={item}>
                  {item || "未分類"}
                </option>
              ))}
            </select>
            </label>{businessProfile !== "MUSIC" && <label className="text-xs font-medium text-earth-700">學員所屬店長<select aria-label="課表所屬店長篩選" className={`${button} mt-1 block min-h-11 bg-white py-1 ${assignedCoachFilter !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`} value={assignedCoachFilter} onChange={event => setAssignedCoachFilter(event.target.value)}><option value="all">全部所屬店長</option>{allCoaches.filter(coach => sessions.some(session => session.bookings.some(booking => booking.assignedCoachId === coach.id))).map(coach => <option key={coach.id} value={coach.id}>{coach.displayName}</option>)}<option value="none">未指定所屬店長</option></select></label>}
            <input aria-label="課表搜尋" placeholder="搜尋課程或學員" className={`${button} min-h-11 w-44 bg-white py-1`} value={scheduleQuery} onChange={event => setScheduleQuery(event.target.value)} />
            {(coachFilter !== "all" || roomFilter !== "all" || category !== "all" || assignedCoachFilter !== "all" || !!scheduleQuery) && (
              <button
                type="button"
                className="min-h-11 rounded-lg px-2.5 text-xs text-earth-600 hover:bg-white"
                onClick={() => {
                  setAssignedCoachFilter("all");
                  setScheduleQuery("");
                  setCoachFilter("all");
                  setRoomFilter("all");
                  setCategory("all");
                }}
              >
                清除篩選
              </button>
            )}
          </div>}
          {<div className="flex flex-wrap items-center gap-4 text-xs text-earth-700" aria-label="課表課型圖例">{[["團體課","bg-emerald-600"],["個別課","bg-blue-600"],["自組課","bg-yellow-600"],["體驗","bg-orange-500"],["空間租借","bg-pink-500"]].map(([label,color]) => <span key={label} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${color}`} />{label}</span>)}{scheduleFiltered && <strong className="text-primary-800">僅顯示符合目前條件的課程</strong>}</div>}
          {scheduleMode === "month" ? (
            <>
              <p className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm font-medium text-earth-800" aria-label="本月課表總計">
                {scheduleFiltered ? "篩選結果" : "本月已排課程"} {monthTotals.classes} 堂{monthTotals.rentals > 0 && `・${monthTotals.rentals} 筆租借`}｜{assignedCoachFilter !== "all" && businessProfile !== "MUSIC" ? "所屬" : "名單"} {monthTotals.people} 人次｜有課 {new Set(monthSessions.map(session => toLocalDateStr(new Date(session.startsAt)))).size} 天
              </p>
              <div
            className="overflow-hidden rounded-lg border border-earth-200 bg-white"
            aria-busy={pending}
          >
            <div className="grid grid-cols-7">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <div
                  key={day}
                  className="py-2 text-center text-sm text-earth-600"
                >
                  {day}
                </div>
              ))}
              {Array.from(
                { length: parseLocalDate(first).getDay() },
                (_, i) => (
                  <div key={`blank-${i}`} />
                ),
              )}
              {Array.from({ length: days }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, "0")}`,
                  list = (byDate.get(date) ?? []).filter(session => !session.previewFaded),
                  total = scheduleTotals(list),
                  calendarDay = calendarDays[date],
                  isClosed =
                    calendarDay?.status === "closed" ||
                    calendarDay?.status === "training",
                  closureLabel =
                    calendarDay?.status === "training" ? "員工訓練" : "公休";
                return (
                  <div
                    key={date}
                    className={`relative flex min-w-0 h-24 flex-col items-start justify-start border-t border-earth-100 px-1 py-1 text-left sm:px-3 sm:py-1 ${date === today ? "ring-2 ring-inset ring-primary-500" : ""} ${
                      isClosed
                        ? "bg-earth-100 text-earth-500"
                        : date === selectedDate
                            ? "bg-primary-50/60 text-primary-900"
                            : "bg-white text-earth-400"
                    }`}
                  >
                    <button type="button" disabled={pending} aria-label={`${date}，${isClosed ? closureLabel : `${total.classes} 堂課，${total.people} 人次`}`} className="absolute inset-x-0 top-0 h-11 focus-visible:ring-2 focus-visible:ring-primary-500" onClick={() => {go(date);open("day");}} />
                    <span className={`pointer-events-none shrink-0 text-sm font-medium leading-5 ${date===today?"text-primary-800":"text-earth-700"}`}>{i + 1}{date===today&&<span className="ml-1 hidden text-[10px] sm:inline">今天</span>}</span>
                    {isClosed && (
                      <span
                        className="pointer-events-none mt-1 max-w-full truncate rounded bg-earth-200 px-1.5 py-0.5 text-[10px] font-medium text-earth-700"
                        title={calendarDay?.reason || closureLabel}
                      >
                        {closureLabel}
                      </span>
                    )}
                    {(total.classes > 0 || total.rentals > 0) && <span className="pointer-events-none text-xs font-semibold text-primary-900">{total.classes} 堂{total.rentals > 0 && `・${total.rentals} 筆租借`}｜{assignedCoachFilter !== "all" && businessProfile !== "MUSIC" ? "所屬 " : ""}{total.people} 人次</span>}
                    {list.slice(0,2).map(session => {
                      const type = allTemplates.find(template => template.id === session.templateId)?.classType;
                      const color = courseClassPresentation(type, !!allTemplates.find(template=>template.id===session.templateId)?.musicTrialMode, session.previewKind === "RENTAL").dot;
                      const label = `${formatTWDateTime(new Date(session.startsAt)).slice(11)} ${session.nameSnapshot}${coachFilter === "all" ? ` · ${allCoaches.find(coach => coach.id === session.coachId)?.displayName ?? "未指定"}` : ""}`;
                      return <button type="button" disabled={pending} key={session.id} title={label} aria-label={`開啟 ${label} 上課名單`} onClick={() => {go(date);setCourseDialog({sessionId:session.id,kind:"roster"});}} className="relative mt-0.5 flex w-full items-center gap-1 text-left text-xs leading-4 text-earth-800 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} /><span className="truncate">{label}</span></button>;
                    })}
                    {list.length > 2 && <span className="pointer-events-none text-xs text-primary-800">另 {list.length-2} 筆</span>}
                    {!list.length && scheduleFiltered && sessions.some(session => toLocalDateStr(new Date(session.startsAt)) === date) && <span className="pointer-events-none mt-1 text-xs text-earth-400">無符合課程</span>}
                  </div>
                );
              })}
            </div>
          </div>

            </>
          ) : (
            <>
            {businessProfile === "MUSIC" && moveClipboard && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                <strong>✂ {moveClipboard.label} · {moveClipboard.durationMinutes}分</strong>
                <span className="text-xs text-indigo-700">選白格貼上</span>
                <button className="ml-auto text-xs" type="button" onClick={()=>setMoveClipboard(null)}>取消</button>
              </div>
            )}
            {businessProfile === "MUSIC" && <details name="course-workspace-details" className="text-xs text-earth-700"><summary className="cursor-pointer">當日資訊</summary><div className="mt-2 flex flex-wrap gap-2 text-sm">
              <button type="button" className={button} onClick={() => setDailyList("leave")}>請假學員 {leaveStudents.length}</button>
              <button type="button" className={button} onClick={() => setDailyList("unmarked")}>待點名學員 {absentStudents.length}</button>
            </div></details>}
            {dailyList && <DailyAttendanceList kind={dailyList} date={selectedDate} nowIso={nowIso} rows={dailyList==="leave"?leaveStudents:absentStudents} canEdit={canEdit} onClose={()=>setDailyList(null)} onOpenCourse={sessionId=>{setDailyList(null);setCourseDialog({sessionId,kind:"roster"});}} onAttendanceOptimistic={(items,status)=>items.forEach(item=>showPendingAttendance(item.id,status))}/>}
            {Object.keys(pendingAttendance).length>0 && <p role="status" className="text-xs text-primary-700">點名結果同步中，課表色槓已先更新；完成後會以實際紀錄核對。</p>}
            <CourseScheduleBoard
              assignedFiltered={businessProfile !== "MUSIC" && assignedCoachFilter !== "all"}
              businessProfile={businessProfile}
              mode={scheduleMode}
              selectedDate={selectedDate}
              today={today}
              sessions={filteredScheduleSessions.map(session=>({...session,
                teacherAttendance:pendingTeacherAttendance[session.id]??session.teacherAttendance,
                previewStudentNames:session.bookings.length?undefined:cancelledBookings.filter(booking=>booking.sessionId===session.id&&["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind??"")).map(booking=>booking.customerName),
                bookings:session.bookings.map(booking=>pendingAttendance[booking.id]?{...booking,status:pendingAttendance[booking.id]}:booking),
                displayBookings:session.displayBookings?.map(booking=>pendingAttendance[booking.id]?{...booking,status:pendingAttendance[booking.id]}:booking)}))}
              leaveCounts={[...cancelledBookings,...pendingLeaveIds.filter(id=>!cancelledBookings.some(booking=>booking.id===id)).flatMap(id=>{
                const session=sessions.find(item=>item.bookings.some(booking=>booking.id===id));
                return session?[{id,sessionId:session.id,absenceKind:"STUDENT_LEAVE"}]:[];
              })].reduce<Record<string, number>>((counts, booking) => {
                if (["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")) {
                  counts[booking.sessionId] = (counts[booking.sessionId] ?? 0) + 1;
                }
                return counts;
              }, {})}
              rooms={roomFilter === "all" ? allRooms : allRooms.filter(room => room.id === roomFilter)}
              coaches={allCoaches}
              templates={allTemplates}
              pending={pending}
              staffAvailability={staffAvailability}
              staffAvailabilityExceptions={staffAvailabilityExceptions}
              storePeriods={calendarDays[selectedDate]?.periods ?? []}
              canCreate={canCreate}
              calendarDays={calendarDays}
              occupiedSessions={sessions}
              onOpenEmpty={({date,time,roomId,coachId,durationMinutes})=>openSchedule({date,time,roomId,coachId:coachId ?? (coachFilter !== "all" ? coachFilter : undefined),durationMinutes})}
              moveClipboard={moveClipboard}
              onPasteMove={pasteMove}
              onSelectDate={go}
              onOpenSession={(sessionId, date) => {
                go(date);
                setCourseDialog({ sessionId, kind: "roster" });
              }}
            />
            </>
          )}
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-primary-700"
          >
            {pending ? "處理中…" : notice}
          </p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
      <datalist id="course-category-options">
        {categories.filter(Boolean).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {view !== "schedule" && (
        <section
          className="space-y-1"
          aria-label={view === "rooms" ? "教室清單" : "課程清單"}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-48 flex-1 sm:max-w-xs">
              <span className="sr-only">搜尋名稱</span>
              <input
                className={field}
                placeholder={view === "rooms" ? "搜尋教室名稱" : "搜尋課程名稱"}
                value={query}
                onChange={(e)=>{setSelectedIds([]);setQuery(e.target.value);}}
              />
            </label>
            <select
              aria-label="篩選分類"
              className={button}
              value={category}
              onChange={(e)=>{setSelectedIds([]);setCategory(e.target.value);}}
            >
              <option value="all">全部分類</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c || "未分類"}
                </option>
              ))}
            </select>
            <select
              aria-label="篩選狀態"
              className={button}
              value={status}
              onChange={(e)=>{setSelectedIds([]);setStatus(e.target.value);}}
            >
              <option value="all">全部狀態</option>
              <option value={view === "rooms" ? "active" : "PUBLIC"}>
                {view === "rooms" ? "啟用" : "上架"}
              </option>
              <option value={view === "rooms" ? "inactive" : "OFF"}>
                {view === "rooms" ? "停用" : "下架"}
              </option>
              {view === "catalog" && <option value="HIDDEN">隱藏</option>}
            </select>
            {view === "catalog" && businessProfile === "MUSIC" && <select aria-label="篩選班型" className={button} value={classFilter} onChange={e=>{setSelectedIds([]);setClassFilter(e.target.value);}}><option value="all">全部班型</option><option value="PRIVATE">個別課</option><option value="SELF_ORGANIZED">自組課</option><option value="GROUP">團體課</option><option value="TRIAL">體驗課</option></select>}
            {view === "catalog" && (
              <select
                aria-label="篩選預設教室"
                className={button}
                value={roomFilter}
                onChange={(e)=>{setSelectedIds([]);setRoomFilter(e.target.value);}}
              >
                <option value="all">全部教室</option>
                {allRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className={button}
              onClick={() => {
                setSelectedIds([]);setHideTestData(false);setQuery("");
                setStatus("all");
                setCategory("all");
                setRoomFilter("all");
                setClassFilter("all");
              }}
            >
              清除篩選
            </button>
            {canCreate && (
              <button
                className={primary}
                disabled={pending}
                onClick={() => open("catalog")}
              >
                ＋ {view === "rooms" ? "新增教室" : "新增課程"}
              </button>
            )}
          </div>

<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {businessProfile==="MUSIC"&&<CourseTestDataFilter names={catalogItems.map(p=>p.name)} checked={hideTestData} onChange={v=>{setSelectedIds([]);setHideTestData(v);}}/>}
          {view==="rooms" && canEdit && <CourseBatchBar key={`${hideTestData}:${query}:${status}:${category}:${roomFilter}:${classFilter}:${inactiveExpanded}`} canDelete={canDelete} names={Object.fromEntries(visibleItems.map(r=>[r.id,r.name]))} kind="room" blockedIds={busyIds} states={Object.fromEntries(visibleItems.map(item=>[item.id,item.isActive]))} onApplied={applyStatus} onPendingChange={setStatusBusy} ids={visibleItems.map(r=>r.id)} selected={selectedIds} onChange={setSelectedIds}/>}
          {view==="catalog" && canEdit && <CourseBatchBar key={`${hideTestData}:${query}:${status}:${category}:${roomFilter}:${classFilter}:${inactiveExpanded}`} canDelete={canDelete} kind="template" deleteOnly names={Object.fromEntries(visibleItems.map(r=>[r.id,r.name]))} ids={visibleItems.map(r=>r.id)} selected={selectedIds} onChange={setSelectedIds}/>}
</div>
          {view==="catalog" && canEdit && selectedIds.length>0 && <form className="flex flex-wrap items-center gap-2" onSubmit={e=>submit(e,async d=>batchCourseTemplates({ids:selectedIds,...(d.get("batchCategory")!==""?{category:d.get("batchCategory")}:{}),...(d.get("batchVisibility")?{visibility:d.get("batchVisibility")}: {})}),()=>setSelectedIds([]))}>
            <span>已選 {selectedIds.length} 筆</span><input name="batchCategory" className={button} placeholder="調整分類"/><select name="batchVisibility" className={button}><option value="">狀態不變</option><option value="PUBLIC">上架</option><option value="HIDDEN">隱藏</option><option value="OFF">下架</option></select><button className={button} disabled={pending}>套用至選取課程</button>
          </form>}
          <p className="text-sm text-earth-500">
            共 {filteredItems.length} 筆／全部 {catalogItems.length} 筆 ·
            {view === "rooms" ? "停用教室不供新排課使用；既有紀錄保留。" : "隱藏僅供店長使用；下架不供新增使用，既有紀錄保留。"}
          </p>
          <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white">
            <table className="min-w-[740px] w-full text-left text-sm">
              <thead className="bg-earth-50 text-earth-600">
                <tr>
                  {(view === "rooms"
                    ? ["教室名稱", "分類", ...(businessProfile === "MUSIC" ? [] : ["容納人數"]), "狀態", "操作"]
                    : [
                        "課程名稱",
                        "分類",
                        "時長",
                        businessProfile === "MUSIC" ? "學費與堂數" : "每人方案扣抵",
                        "人數上限",
                        "狀態",
                        "操作",
                      ]
                  ).map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {visibleItems.map((item,index) => {
                  const template =
                    "durationMinutes" in item ? (item as Template) : null;
                  return (
                    <Fragment key={item.id}>
                    {isInactiveItem(item)&&(index===0||!isInactiveItem(visibleItems[index-1]))&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={view==="rooms"?(businessProfile==="MUSIC"?4:5):7} className="px-3 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600 disabled:cursor-default" onClick={()=>{setSelectedIds([]);setShowInactive(v=>!v);}}><span>{view==="rooms"?"停用教室":"下架課程"}（{inactiveFilteredItems.length}）</span><span>{inactiveForced?"篩選結果":inactiveExpanded?"收合":"展開"}</span></button></td></tr>}
                    <tr
                      {...order.rowProps(item.id)}
                      className={(
                        item.isActive && (!template || template.visibility === "PUBLIC")
                          ? "hover:bg-primary-50/40"
                          : "bg-earth-50 text-earth-600"
                      )}
                    >
                      <td
                        className="max-w-60 px-3 py-2 text-left font-medium text-primary-900"
                      >
                        {view==="rooms"&&canEdit&&order.handle(item.id,item.name)}{canEdit && <input aria-label={`選取 ${item.name}`} type="checkbox" className="mr-2" disabled={busyIds.includes(item.id)} checked={selectedIds.includes(item.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>}{item.name}
                        {template && <span className="ml-2 whitespace-nowrap text-xs font-normal text-earth-500">{template.classType==="PRIVATE"?"個別課":template.classType==="SELF_ORGANIZED"?"自組課":template.classType==="GROUP"?"團體課":"課型待補"}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{item.category || "未分類"}</td>
                      {template ? (
                        <>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {template.durationMinutes} 分
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {businessProfile === "MUSIC" ? template.musicTrialMode ? `體驗 1 堂 · ${template.musicTrialMode === "FREE" ? "免費" : `NT$ ${template.musicPricePerLesson ?? "待設定"}`}` : `${template.musicTermLessons ?? "待設定"} 堂／期 · NT$ ${template.musicPricePerLesson ?? "待設定"}／堂` : `點數卡 ${template.pointCost} 點；堂數卡 1 堂`}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {template.capacity}
                          </td>
                        </>
                      ) : businessProfile !== "MUSIC" && (
                        <td className="px-3 py-2 tabular-nums">
                          {item.capacity ?? "未設定"}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`rounded-md px-2 py-1 text-xs ${item.isActive ? "bg-primary-50 text-primary-700" : "bg-earth-100 text-earth-500"}`}
                        >
                          {template ? ({PUBLIC:"上架",HIDDEN:"隱藏",OFF:"下架"}[template.visibility ?? "PUBLIC"]) : item.isActive ? "啟用":"停用"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <>
                              <button
                                className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm"
                                disabled={pending}
                                onClick={() => {
                                  setCopyTemplate(false);
                                  setEditing(
                                    template
                                      ? { kind: "template", value: template }
                                      : { kind: "room", value: item },
                                  );
                                  open("inspect");
                                }}
                              >
                                查看{template ? "課程" : "教室"}
                              </button>
                              {template ? <>
                                {businessProfile === "MUSIC" && !template.musicTrialMode && <button className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" onClick={()=>router.push(`${pathname}?view=plans&templateId=${encodeURIComponent(template.id)}`)}>收費方案</button>}
                                <select className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" aria-label={`${item.name} 狀態`} value={template.visibility ?? "PUBLIC"} disabled={pending} onChange={e=>changeStatus(item,e.target.value)}><option value="PUBLIC">上架</option><option value="HIDDEN">隱藏</option><option value="OFF">下架</option></select>
                                {canCreate && <button className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" onClick={()=>{setCopyTemplate(true);setEditing({kind:"template",value:{...template,name:template.name+"（複製）"}});open("edit");}}>複製</button>}
                              </> : <><CourseStatusButton kind="room" id={item.id} disabled={busyIds.includes(item.id)} active={item.isActive} onApplied={applyStatus} onPendingChange={setStatusBusy}/><button className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" onClick={()=>router.push(`${pathname}?date=${selectedDate}&room=${encodeURIComponent(item.id)}`)}>課表</button></>}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
                {!inactiveExpanded&&inactiveFilteredItems.length>0&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={view==="rooms"?(businessProfile==="MUSIC"?4:5):7} className="px-3 py-2"><button type="button" className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600" onClick={()=>{setSelectedIds([]);setShowInactive(true);}}><span>{view==="rooms"?"停用教室":"下架課程"}（{inactiveFilteredItems.length}）</span><span>展開</span></button></td></tr>}
              </tbody>
            </table>
            {!filteredItems.length && (
              <p className="p-8 text-center text-earth-500">
                沒有符合條件的資料，請調整篩選或新增資料。
              </p>
            )}
          </div>
          {notice && (
            <p role="status" className="text-sm text-primary-700">
              {notice}
            </p>
          )}
          {error && !panel && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </section>
      )}
      {panel && (
        <RightSheet presentation="centered"
          compact
          open
          onClose={closePanel}
          width={520}
          labelledById="course-panel-title"
        >
          <div
            className={
              view === "schedule"
                ? "flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2"
                : "flex shrink-0 items-center justify-between border-b border-earth-200 bg-primary-50/60 px-4 py-2"
            }
          >
            <h2
              id="course-panel-title"
              className={
                view === "schedule"
                  ? "font-medium"
                  : "text-base font-semibold text-primary-900"
              }
            >
              {panel === "edit"
                ? editing?.kind === "session"
                  ? "編輯單堂排課"
                  : editing?.kind === "room"
                    ? "編輯教室"
                    : copyTemplate ? "複製課程" : "編輯課程"
                : panel === "inspect" ? (editing?.kind === "room" ? "查看教室" : "查看課程") : panel === "catalog"
                  ? view === "rooms"
                    ? "新增教室"
                    : "新增課程"
                  : panel === "schedule"
                    ? copySource
                      ? "複製排課"
                      : "新增排課"
                    : selectedDate}
            </h2>
            {
              <button
                className={button}
                disabled={pending}
                onClick={closePanel}
              >
                關閉
              </button>
            }
          </div>
          <div
            onChangeCapture={(event) => { if ((event.target as HTMLElement).closest("form")) setDirty(true); }}
            className={
              view === "schedule"
                ? "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
                : "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [&_label]:space-y-1 [&_label]:text-sm [&_label]:font-medium [&_label]:text-earth-700 [&_input]:min-h-10 [&_input]:rounded-xl [&_input]:px-3 [&_input]:font-normal [&_input]:outline-none [&_input:focus]:border-primary-500 [&_input:focus]:ring-2 [&_input:focus]:ring-primary-100 [&_select]:min-h-10 [&_select]:rounded-xl [&_select]:px-3 [&_select]:font-normal [&_form]:gap-3"
            }
          >
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-primary-700">
                {notice}
              </p>
            )}
            {panel === "day" &&
              (() => {
                const daySessions = byDate.get(selectedDate) ?? [];
                const booked = scheduleTotals(daySessions).people;
                const liveDaySessions = daySessions.filter(item => !item.previewFaded);
                const fullClasses = liveDaySessions.filter(
                  (item) => scheduleOccupiedCount(item.bookings) >= item.capacity,
                ).length;
                return (
                  <>
                    <div className="flex items-center justify-between gap-3 text-xs text-earth-500">
                      <span>
                        每 60 秒自動更新
                        {lastUpdated
                          ? ` · 最後更新 ${lastUpdated.toLocaleTimeString("zh-TW", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-earth-700"
                        onClick={() => {
                          router.refresh();
                          setLastUpdated(new Date());
                        }}
                      >
                        立即更新
                      </button>
                    </div>
                    <div className="grid grid-cols-3 divide-x rounded-xl border border-primary-100 bg-primary-50/70 py-2 text-center">
                      <p>
                        <strong className="block text-base text-primary-800">
                          {liveDaySessions.length}
                        </strong>
                        <span className="text-xs text-earth-600">堂課</span>
                      </p>
                      <p>
                        <strong className="block text-base text-primary-800">
                          {booked}
                        </strong>
                        <span className="text-xs text-earth-600">{assignedCoachFilter !== "all" && businessProfile !== "MUSIC" ? "所屬人次" : "名單人次"}</span>
                      </p>
                      <p>
                        <strong className="block text-base text-primary-800">
                          {fullClasses}
                        </strong>
                        <span className="text-xs text-earth-600">堂已滿</span>
                      </p>
                    </div>
                    {(calendarDays[selectedDate]?.status === "closed" ||
                      calendarDays[selectedDate]?.status === "training") && (
                      <p className={`rounded-lg px-3 py-2 text-sm font-medium ${daySessions.length ? "border border-amber-200 bg-amber-50 text-amber-900" : "bg-earth-100 text-earth-700"}`}>
                        {daySessions.length
                          ? `${calendarDays[selectedDate]?.status === "training" ? "員工訓練日" : "公休日"}已有 ${daySessions.length} 堂既有課程；可查看與處理，但不可新增排課。`
                          : calendarDays[selectedDate]?.status === "training"
                            ? "員工訓練"
                            : "公休"}
                        {!daySessions.length && calendarDays[selectedDate]?.reason
                          ? ` · ${calendarDays[selectedDate].reason}`
                          : ""}
                      </p>
                    )}
                    {!daySessions.length && (
                      <p className="rounded-xl border border-dashed border-earth-200 p-8 text-center text-earth-500">
                        當日尚無課程
                      </p>
                    )}
                    {daySessions.map((session, index) => {
                      const isFull =
                        scheduleOccupiedCount(session.bookings) >= session.capacity;
                      const sessionState = courseSessionStatus(session, nowIso);
                      const openSeats = Math.max(
                        0,
                        session.capacity - scheduleOccupiedCount(session.bookings),
                      );
                      return (
                        <article
                          key={session.id}
                          className={`rounded-xl border border-l-4 border-earth-200 bg-white px-3 py-2.5 ${sessionState.accentClass}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-800">
                              第 {index + 1} 堂
                            </span>
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <span className={`rounded-full px-2 py-1 text-xs font-medium ${sessionState.badgeClass}`}>{sessionState.label}</span>
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-medium ${
                                isFull
                                  ? "bg-primary-100 text-primary-900"
                                  : "bg-earth-100 text-earth-700"
                              }`}
                              >
                                {isFull
                                  ? `已滿 ${scheduleOccupiedCount(session.bookings)}/${session.capacity}`
                                  : `尚有 ${openSeats} 位 · ${scheduleOccupiedCount(session.bookings)}/${session.capacity}`}
                              </span>
                            </div>
                          </div>
                          <h3 className="mt-2 flex flex-wrap items-baseline gap-x-2 font-semibold text-primary-900">
                            <span>
                              {formatTWDateTime(new Date(session.startsAt)).slice(11)}–
                              {formatTWDateTime(new Date(session.endsAt)).slice(0, 10) !==
                              selectedDate
                                ? "翌日 "
                                : ""}
                              {formatTWDateTime(new Date(session.endsAt)).slice(11)}
                            </span>
                            <span>{session.nameSnapshot}</span>
                          </h3>
                          <p className="mt-1 truncate text-sm text-earth-600">
                            {allCoaches.find((coach) => coach.id === session.coachId)
                              ?.displayName ?? "未指定教練"}
                            {" · "}
                            {allRooms.find((room) => room.id === session.roomId)?.name ??
                              "未指定教室"}
                            {" · "}
                            {businessProfile === "MUSIC" ? "每位學員 1 堂" : `點數卡 ${session.pointCost} 點／堂數卡 1 堂`}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className={`${button} border-primary-300 bg-primary-50 text-primary-800`}
                              onClick={() =>
                                setCourseDialog({
                                  sessionId: session.id,
                                  kind: "roster",
                                })
                              }
                            >
                              {session.displayBookings ? `所屬 ${session.displayBookings.length}｜全班 ${scheduleRosterBookings(session.bookings).length}` : `上課名單 ${scheduleRosterBookings(session.bookings).length}`}
                            </button>
                            {canCreate && (
                              <>
                                <button
                                  type="button"
                                  className={button}
                                  onClick={() =>
                                    setCourseDialog({
                                      sessionId: session.id,
                                      kind: "member-booking",
                                    })
                                  }
                                >
                                  ＋ 學員預約
                                </button>
                                <button
                                  type="button"
                                  className={button}
                                  onClick={() =>
                                    setCourseDialog({
                                      sessionId: session.id,
                                      kind: "trial-booking",
                                    })
                                  }
                                >
                                  ＋ 體驗客
                                </button>
                              </>
                            )}
                            {(canCreate || canEdit) && (
                              <ExclusiveMenu label="更多" className="ml-auto">
                                                                <div className="grid gap-1">
                                  {canCreate && (
                                    <button
                                      type="button"
                                      className={button}
                                      disabled={pending}
                                      onClick={() => {
                                        setCopySource(session);
                                        setChosen(session.templateId);
                                        setRepeat(false);
                                        setMultipleDates(false);
                                        setScheduleSummary("");
                                        setRequestKey(crypto.randomUUID());
                                        open("schedule");
                                      }}
                                    >
                                      複製排課
                                    </button>
                                  )}
                                  {canEdit && (
                                    <button
                                      type="button"
                                      className={button}
                                      disabled={pending}
                                      onClick={() => {
                                        setEditTemplateId(session.templateId);
                                        setEditing({
                                          kind: "session",
                                          value: session,
                                        });
                                        open("edit");
                                      }}
                                    >
                                      編輯排課
                                    </button>
                                  )}
                                </div>
                              </ExclusiveMenu>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </>
                );
              })()}
            <CourseConflicts items={conflicts}/>
            {panel === "catalog" && (
              <>
                {canCreate && (
                  <>
                    {view === "rooms" && (
                      <form
                        id="course-room-create-form"
                        onSubmit={(e) =>
                          submit(e, async (data) =>
                            createCourseRoom({
                              capacity: data.get("roomCapacity")
                                ? Number(data.get("roomCapacity"))
                                : null,
                              details: data.get("details") || "",
                              equipment:data.get("equipment") || "",location:data.get("location") || "",
                              name: data.get("name"),
                              category: data.get("category"),
                            }),
                          )
                        }
                        className="grid gap-3"
                      >
                        <label className="flex-1">
                          教室名稱
                          <input
                            className={field}
                            name="name"
                            required
                            maxLength={80}
                          />
                        </label>
                        <label className="col-span-full">
                          分類
                          <input
                            className={field}
                            name="category"
                            maxLength={40}
                            list="course-category-options"
                            placeholder="輸入或選擇分類"
                          />
                        </label>
                        <RoomMore music={businessProfile === "MUSIC"} />
                      </form>
                    )}
                    {view !== "rooms" && (
                      <form
                        id="course-template-create-form"
                        className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"
                        onSubmit={(e) =>
                          submit(e, (data) =>
                            createCourseTemplate({
                              name: data.get("name"),
                              category: data.get("category"),
                              defaultRoomId: data.get("roomId") || null,
                              description: data.get("description") || "",
                              precautions: data.get("precautions") || "",
                              classType:data.get("classType") || null,
                              durationMinutes: Number(data.get("duration")),
                              pointCost: businessProfile === "MUSIC" ? 1 : Number(data.get("cost")),
                              ...(businessProfile === "MUSIC" ? musicCourseInput(data) : {musicTrialMode:data.get("musicTrialMode") || null}),
                              capacity: Number(data.get("capacity")),
                              waitlistEnabled: waitlistEnabled && data.get("waitlistEnabled") === "yes",
                              waitlistLimit: Number(data.get("waitlistLimit") || waitlistDefaultLimit),
                              waitlistStopMinutes: Number(data.get("waitlistStopMinutes") ?? waitlistDefaultStopMinutes),
                            }),
                          )
                        }
                      >
                        <label className="col-span-full">
                          課程名稱
                          <input
                            className={field}
                            name="name"
                            required
                            maxLength={80}
                          />
                        </label>
                        <ClassType required/>
                        {businessProfile === "MUSIC" ? <MusicCourseFields/> : <TrialClassField/>}
                        <label className="col-span-full">
                          分類
                          <input
                            className={field}
                            name="category"
                            maxLength={40}
                            list="course-category-options"
                            placeholder="輸入或選擇分類"
                          />
                        </label>
                        <label>
                          時長（分鐘）
                          {businessProfile === "MUSIC" ? (
                            <select className={field} name="duration" defaultValue={60} required>
                              {[30, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分鐘</option>)}
                            </select>
                          ) : (
                            <input className={field} name="duration" type="number" defaultValue={60} min={1} max={480} required />
                          )}
                        </label>
                        {businessProfile !== "MUSIC" && <label>
                          點數卡每人扣點
                          <input
                            className={field}
                            name="cost"
                            type="number"
                            defaultValue={2}
                            min={1}
                            max={10000}
                            required
                          />
                          <span className="block text-sm text-earth-600">堂數卡每次固定扣 1 堂，依使用卡別扣抵。</span>
                        </label>}
                        <label>
                          人數上限
                          <input
                            className={field}
                            name="capacity"
                            type="number"
                            defaultValue={10}
                            min={1}
                            max={500}
                            required
                          />
                        </label>
                        {waitlistEnabled && (
                          <WaitlistFields
                            key={`create:${waitlistDefaultLimit}:${waitlistDefaultStopMinutes}`}
                            defaultEnabled={false}
                            defaultLimit={waitlistDefaultLimit}
                            defaultStopMinutes={waitlistDefaultStopMinutes}
                          />
                        )}
                        <label>
                          預設教室
                          <select className={field} name="roomId">
                            <option value="">不指定</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <DebitRule music={businessProfile === "MUSIC"}/><TemplateMore />
                      </form>
                    )}
                  </>
                )}
              </>
            )}
            {panel === "inspect" && editing && editing.kind !== "session" && <section className="space-y-3">
              <dl className="divide-y divide-earth-100">{[
                ["名稱",editing.value.name],["分類",editing.value.category || "未分類"],
                ["狀態",editing.kind === "room" ? (editing.value.isActive ? "啟用":"停用") : ({PUBLIC:"上架",HIDDEN:"隱藏",OFF:"下架"}[editing.value.visibility ?? "PUBLIC"])],
                ...(editing.kind === "template" ? [["課型",editing.value.classType === "PRIVATE" ? "個別課" : editing.value.classType === "SELF_ORGANIZED" ? "自組課" : editing.value.classType === "GROUP" ? "團體課":"待補設定"],["排課預設",`${editing.value.durationMinutes} 分鐘 · 上限 ${editing.value.capacity} 人`],["方案扣抵",businessProfile === "MUSIC" ? `每位學員 1 堂；${editing.value.musicTermLessons ?? "待設定"} 堂／期；每堂 NT$ ${editing.value.musicPricePerLesson ?? "待設定"}` : `點數卡每人 ${editing.value.pointCost} 點；堂數卡每人 1 堂`],["候補", editing.value.waitlistEnabled ? `開啟・${editing.value.waitlistLimit ?? waitlistDefaultLimit} 人・${waitlistStopLabel(editing.value.waitlistStopMinutes ?? waitlistDefaultStopMinutes)}` : "關閉"],["預設教室",allRooms.find(r=>r.id===editing.value.defaultRoomId)?.name ?? "不指定"]] : businessProfile === "MUSIC" ? [] : [["容納人數",editing.value.capacity ?? "未設定"]]),
              ].map(([label,value])=><div key={String(label)} className="grid grid-cols-[7rem_1fr] gap-3 py-3"><dt className="text-earth-500">{label}</dt><dd>{value}</dd></div>)}</dl>
              {editing.kind === "template" && <DebitRule music={businessProfile === "MUSIC"}/>}
              <details name="course-workspace-details"><summary className="min-h-11 cursor-pointer py-3">{editing.kind === "template" ? "課程介紹與注意事項":"設備、位置與備註"}</summary>{(editing.kind === "template" ? [editing.value.description,editing.value.precautions]:[editing.value.equipment,editing.value.location,editing.value.details]).map((value,i)=><p key={i} className="whitespace-pre-wrap py-2">{value || "未填"}</p>)}</details>
            </section>}
            {panel === "edit" && editing && canEdit && (
              <form
                id="course-edit-form"
                key={`${editing.kind}-${editing.value.id}`}
                className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"
                onSubmit={(event) =>
                  submit(
                    event,
                    (data) => {
                      const common = {
                        id: editing.value.id,
                        name: data.get("name"),
                        category: data.get("category"),
                      };
                      if (editing.kind === "room")
                        return updateCourseRoom({
                          ...common,
                          capacity: data.get("roomCapacity")
                            ? Number(data.get("roomCapacity"))
                            : null,
                          details: data.get("details") || "",
                              equipment:data.get("equipment") || "",location:data.get("location") || "",
                        });
                      const details = {
                        durationMinutes: Number(data.get("duration")),
                        capacity: Number(data.get("capacity")),
                        pointCost: businessProfile === "MUSIC" ? 1 : Number(data.get("cost")),
                      };
                      if (editing.kind === "template")
                        return (copyTemplate?createCourseTemplate:updateCourseTemplate)({
                          ...common,
                          ...details,
                          ...(businessProfile === "MUSIC" ? musicCourseInput(data) : {musicTrialMode:data.get("musicTrialMode") || null}),
                          defaultRoomId: data.get("roomId") || null,
                          description: data.get("description") || "",
                          precautions: data.get("precautions") || "",
                          waitlistEnabled: waitlistEnabled
                            ? data.get("waitlistEnabled") === "yes"
                            : editing.value.waitlistEnabled ?? false,
                          waitlistLimit: waitlistEnabled
                            ? Number(data.get("waitlistLimit") || editing.value.waitlistLimit || waitlistDefaultLimit)
                            : editing.value.waitlistLimit ?? waitlistDefaultLimit,
                          waitlistStopMinutes: waitlistEnabled
                            ? Number(data.get("waitlistStopMinutes") ?? editing.value.waitlistStopMinutes ?? waitlistDefaultStopMinutes)
                            : editing.value.waitlistStopMinutes ?? waitlistDefaultStopMinutes,
                              classType:data.get("classType") || null,
                        });
                      return (
                        data.get("scope") === "future"
                          ? updateCourseSeries
                          : updateCourseSession
                      )({
                        id: editing.value.id,
                        ...details,
                        templateId:data.get("templateId") || undefined,
                        nameSnapshot: data.get("name"),
                        date: data.get("date"),
                        time: data.get("time"),
                        roomId: data.get("roomId"),
                        coachId: data.get("coachId"),
                      });
                    },
                    (data) => {
                      if (editing.kind === "session")
                        go(String(data.get("date")));
                      setPanel(editing.kind === "session" ? "day" : null);
                      setEditing(null);
                    },
                  )
                }
              >
                <p className="col-span-full text-sm text-earth-600">
                  {editing.kind === "session"
                    ? "修改範圍可選這堂或同一批次的這堂及後續，撞期時整批不會儲存。"
                    : editing.kind === "template"
                      ? "修改後套用於新排課；已排課程請從日期內編輯。"
                      : "名稱會同步顯示於使用此教室的課程。"}
                </p>
                {editing.kind === "session" && editing.value.bookings.length > 0 && <div role="note" className="col-span-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  本堂已有 {editing.value.bookings.length} 人次預約。修改日期、時間、教室或教練會影響這些學員；預約會保留，不會自動取消或退款。請先確認調整並通知受影響學員（本次儲存不自動發送通知）。
                  <p className="mt-1">已有預約不可更換課程或{businessProfile === "MUSIC" ? "堂數" : "點數"}；已完成出席不可修改。選「這堂及後續」還會影響同批後續課次，儲存時逐堂檢查，有衝突整批不儲存。</p>
                </div>}
                {editing.kind==="session" && <label className="col-span-full">課程項目<select className={field} name="templateId" value={editTemplateId || editing.value.templateId} onChange={e=>setEditTemplateId(e.target.value)}>{allTemplates.filter(t=>t.isActive || t.id===editing.value.templateId).map(t=><option key={t.id} value={t.id}>{t.name}{t.visibility==="OFF"?"（下架：保留原課）":""}</option>)}</select></label>}
                <label className="col-span-full">
                  {editing.kind === "room" ? "教室名稱" : "課程名稱"}
                  <input
                    className={field}
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={
                      editing.kind === "session"
                        ? editing.value.nameSnapshot
                        : editing.value.name
                    }
                  />
                </label>
                {editing.kind === "template" && <ClassType value={editing.value.classType} required={copyTemplate}/>}{editing.kind === "template" && businessProfile !== "MUSIC" && <TrialClassField value={editing.value.musicTrialMode}/>}
                {editing.kind === "template" && businessProfile === "MUSIC" && <MusicCourseFields value={editing.value}/>}
                {editing.kind !== "session" && (
                  <label className="col-span-full">
                    分類
                    <input
                      className={field}
                      name="category"
                      maxLength={40}
                      defaultValue={editing.value.category}
                      list="course-category-options"
                      placeholder="輸入或選擇分類"
                    />
                  </label>
                )}
                {editing.kind === "room" && (
                  <RoomMore music={businessProfile === "MUSIC"}
                    capacity={editing.value.capacity}
                    equipment={editing.value.equipment} location={editing.value.location}
                    details={editing.value.details}
                  />
                )}

                {editing.kind === "session" && (
                  <>
                    <label className="col-span-full">
                      修改範圍
                      <select className={field} name="scope">
                        <option value="single">僅這堂</option>
                        <option value="future">這堂及後續</option>
                      </select>
                    </label>
                    <label>
                      日期
                      <input
                        className={field}
                        name="date"
                        type="date"
                        required
                        defaultValue={toLocalDateStr(
                          new Date(editing.value.startsAt),
                        )}
                      />
                    </label>
                    <label>
                      開始時間
                      <input
                        className={field}
                        name="time"
                        type="time"
                        required
                        defaultValue={formatTWDateTime(
                          new Date(editing.value.startsAt),
                        ).slice(11)}
                      />
                    </label>
                    <DebitRule music={businessProfile === "MUSIC"}/>
                    <label className="col-span-full">
                      教練
                      <select
                        className={field}
                        name="coachId"
                        required
                        defaultValue={editing.value.coachId}
                      >
                        {allCoaches
                          .filter(
                            (c) =>
                              c.status !== "ACTIVE" &&
                              c.id === editing.value.coachId,
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id} disabled>
                              {c.displayName}（已停用，請另選教練）
                            </option>
                          ))}
                        {coaches.filter(c=>(c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(editTemplateId || editing.value.templateId)) || (c.id===editing.value.coachId && !c.courseQualificationsConfirmed && (!editTemplateId || editTemplateId===editing.value.templateId))).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {editing.kind !== "room" && (
                  <>
                    <label>
                      時長（分鐘）
                      {businessProfile === "MUSIC" ? (
                        <select
                          className={field}
                          name="duration"
                          required
                          defaultValue={
                            editing.kind === "template"
                              ? editing.value.durationMinutes
                              : (new Date(editing.value.endsAt).getTime() - new Date(editing.value.startsAt).getTime()) / 60000
                          }
                        >
                          {[30, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分鐘</option>)}
                        </select>
                      ) : (
                        <input
                          className={field}
                          name="duration"
                          type="number"
                          min={1}
                          max={480}
                          required
                          defaultValue={
                            editing.kind === "template"
                              ? editing.value.durationMinutes
                              : (new Date(editing.value.endsAt).getTime() - new Date(editing.value.startsAt).getTime()) / 60000
                          }
                        />
                      )}
                    </label>
                    <label>
                      人數上限
                      <input
                        className={field}
                        name="capacity"
                        type="number"
                        min={1}
                        max={500}
                        required
                        defaultValue={editing.value.capacity}
                      />
                    </label>
                    {editing.kind === "template" && waitlistEnabled && (
                      <WaitlistFields
                        key={`edit:${editing.value.id}`}
                        defaultEnabled={editing.value.waitlistEnabled ?? false}
                        defaultLimit={editing.value.waitlistLimit ?? waitlistDefaultLimit}
                        defaultStopMinutes={editing.value.waitlistStopMinutes ?? waitlistDefaultStopMinutes}
                      />
                    )}
                    {businessProfile !== "MUSIC" && <label>
                      點數卡每人扣點
                      <input
                        className={field}
                        name="cost"
                        type="number"
                        min={1}
                        max={10000}
                        required
                        defaultValue={editing.value.pointCost}
                      />
                      <span className="block text-sm text-earth-600">堂數卡每次固定扣 1 堂，依使用卡別扣抵。</span>
                    </label>}
                    <label>
                      {editing.kind === "template" ? "預設教室" : "教室"}
                      <select
                        className={field}
                        name="roomId"
                        required={editing.kind === "session"}
                        defaultValue={
                          editing.kind === "template"
                            ? (editing.value.defaultRoomId ?? "")
                            : editing.value.roomId
                        }
                      >
                        {editing.kind === "template" && (
                          <option value="">不指定</option>
                        )}
                        {allRooms
                          .filter(
                            (r) =>
                              !r.isActive &&
                              r.id ===
                                (editing.kind === "template"
                                  ? editing.value.defaultRoomId
                                  : editing.value.roomId),
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id} disabled>
                              {r.name}（已停用，請另選教室）
                            </option>
                          ))}
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {editing.kind !== "room" && <DebitRule music={businessProfile === "MUSIC"}/>}
                {editing.kind === "template" && (
                  <TemplateMore
                    description={editing.value.description}
                    precautions={editing.value.precautions}
                  />
                )}
              </form>
            )}
            {panel === "schedule" && businessProfile === "MUSIC" && (
              <MusicScheduleWizard
                key={requestKey}
                templates={templates}
                rooms={rooms}
                coaches={coaches}
                initialDate={scheduleSeed.date ?? selectedDate}
                initialTemplateId={copySource?.templateId}
                sourceSessionId={copySource?.id}
                requestKey={requestKey}
                onCreated={(sessionId,date) => {
                  setPanel(null);
                  go(date);
                  setCourseDialog({sessionId,kind:"roster"});
                  router.refresh();
                }}
              />
            )}
            {panel === "schedule" && businessProfile !== "MUSIC" && (
              <>
                {!templates.length ? (
                  <>
                    <p>請先建立課程預設。</p>
                    <button
                      className={primary}
                      onClick={() => router.push(`${pathname}?view=catalog`)}
                    >
                      設定課程
                    </button>
                  </>
                ) : !coaches.length ? (
                  <p>本店尚無可排課的教練，請先完成人員建檔。</p>
                ) : !rooms.length ? (
                  <p>
                    目前沒有可使用的教室，請至左側「教室管理」新增或恢復使用後再排課。
                  </p>
                ) : (
                  <form
                    id="course-schedule-form"
                    onChange={updateScheduleForm}
                    onInput={updateScheduleForm}
                    className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-6"
                    onSubmit={(e) =>
                      submit(
                        e,
                        (data) =>
                          createCourseSchedule({
                            templateId: chosen,
                            sourceSessionId: copySource?.id,
                            roomId: data.get("roomId"),
                            coachId: data.get("coachId"),
                            date: data.get("date"),
                            time: data.get("time"),
                            durationMinutes: Number(data.get("duration")),
                            capacity: Number(data.get("capacity")),
                            additionalDates: !repeat && multipleDates ? data.getAll("additionalDates").map(String) : undefined,
                            repeatUntil: repeat ? data.get("until") : undefined,
                            weekdays:
                              repeat && data.getAll("weekday").length
                                ? data.getAll("weekday").map(Number)
                                : undefined,
                            requestKey,
                          }),
                        (data) => {
                          go(String(data.get("date")));
                          setPanel("day");
                        },
                      )
                    }
                  >
                    {copySource ? (
                      <p className="col-span-full">
                        {copySource.nameSnapshot} · 點數卡每人 {copySource.pointCost} 點／堂數卡每人 1 堂<br />
                        選擇新日期並確認時間後建立，原課程會保留。
                      </p>
                    ) : (
                      <label className="min-[500px]:col-span-3">
                        課程
                        <select
                          className={`${field} min-h-11`}
                          aria-label="課程"
                          name="templateId"
                          value={chosen}
                          onChange={(e) => setChosen(e.target.value)}
                          required
                        >
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="min-[500px]:col-span-3">
                      授課教練
                      <select
                        className={`${field} min-h-11`}
                        name="coachId"
                        required
                        defaultValue={copySource?.coachId ?? scheduleSeed.coachId}
                      >
                        {coaches.filter(c=>c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(chosen)).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName}
                          </option>
                        ))}
                      </select>
                      {!coaches.some(c=>c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(chosen)) && <span className="block text-sm text-amber-800">本課程尚無具授課資格的啟用教練，請先至教練管理設定資格。<a className="block min-h-11 py-2 underline" href={pathname.replace(/\/courses$/, "/teachers")} target="_blank" rel="noopener noreferrer">開啟教練管理（保留此排課草稿）</a><button type="button" className={button} onClick={()=>router.refresh()}>已設定，更新教練名單</button></span>}
                    </label>
                    <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-earth-600"><span>點數卡 {template?.pointCost} 點／堂數卡 1 堂</span><details name="course-workspace-details"><summary className="min-h-11 cursor-pointer inline-flex items-center">扣抵說明 ⓘ</summary><p>依學員方案扣抵，不會同時扣兩種額度。預約先占用，出席才正式扣抵。</p></details></div>
                    <label className="min-[500px]:col-span-2">
                      日期
                      <input
                        className={`${field} min-h-11`}
                        name="date"
                        type="date"
                        defaultValue={copySource ? "" : scheduleSeed.date ?? selectedDate}
                        required
                      />
                    </label>
                    <label className="min-[500px]:col-span-2">
                      開始時間
                      <input
                        className={`${field} min-h-11`}
                        name="time"
                        type="time"
                        defaultValue={
                          copySource
                            ? formatTWDateTime(
                                new Date(copySource.startsAt),
                              ).slice(11)
                            : scheduleSeed.time ?? "18:00"
                        }
                        required
                      />
                    </label>
                    <label className="min-[500px]:col-span-2" key={`duration-${chosen}`}>
                      時長（分鐘）
                        <input
                          className={`${field} min-h-11`}
                          name="duration"
                          list="course-duration-options"
                          type="number"
                          defaultValue={
                            copySource
                              ? (new Date(copySource.endsAt).getTime() - new Date(copySource.startsAt).getTime()) / 60000
                              : scheduleSeed.durationMinutes ?? template?.durationMinutes
                          }
                          min={1}
                          max={480}
                          required
                        />
                    </label>
                    <datalist id="course-duration-options">{[30,60,90,120].map(value => <option key={value} value={value} />)}</datalist>
                    {rooms.length > 1 ? (
                      <label className="min-[500px]:col-span-3" key={`room-${chosen}`}>
                        教室
                        <select
                          className={`${field} min-h-11`}
                          name="roomId"
                          defaultValue={
                            copySource?.roomId ?? scheduleSeed.roomId ?? template?.defaultRoomId ?? ""
                          }
                          required
                        >
                          {rooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="min-[500px]:col-span-3"><span className="block text-sm">教室</span><div className={`${field} bg-earth-50`}>{rooms[0]?.name}</div>
                        <input
                          type="hidden"
                          name="roomId"
                          value={rooms[0]?.id ?? ""}
                        />
                      </div>
                    )}
                    <label className="min-[500px]:col-span-3" key={`capacity-${chosen}`}>
                      人數上限
                      <input
                        className={`${field} min-h-11`}
                        name="capacity"
                        type="number"
                        defaultValue={
                          copySource?.capacity ?? template?.capacity
                        }
                        min={1}
                        max={500}
                        required
                      />
                    </label>
                    {roomCapacityNotice && (
                      <p
                        role="status"
                        className="col-span-full text-sm text-amber-700"
                      >
                        {roomCapacityNotice}
                      </p>
                    )}
                    <label className="col-span-full">
                      重複
                      <select
                        className={`${field} min-h-11`}
                        name="repeatMode"
                        value={repeat ? "weekly" : multipleDates ? "dates" : "once"}
                        onChange={(e) => {setRepeat(e.target.value === "weekly");setMultipleDates(e.target.value === "dates");setExtraDateKeys([]);}}
                      >
                        <option value="once">僅此一堂</option>
                        <option value="weekly">每週重複</option>
                        <option value="dates">指定多日</option>
                      </select>
                    </label>
                    {!repeat && multipleDates && (
                      <div className="col-span-full space-y-2">
                        {extraDateKeys.map((dateKey, index) => (
                          <div
                            key={dateKey}
                            className="flex items-center gap-2"
                          >
                            <label className="flex-1">
                              其他日期 {index + 1}
                              <input
                                className={`${field} min-h-11`}
                                aria-label={`其他日期 ${index + 1}`}
                                type="date"
                                required
                                name="additionalDates"
                                defaultValue=""
                              />
                            </label>
                            <button
                              type="button"
                              className={button}
                              onClick={() => {
                                setExtraDateKeys((current) =>
                                  current.filter((_, i) => i !== index),
                                );
                              }}
                            >
                              移除
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className={button}
                          disabled={extraDateKeys.length >= 52}
                          onClick={() => {
                            setExtraDateKeys((current) => [
                              ...current,
                              crypto.randomUUID(),
                            ]);
                          }}
                        >
                          ＋ 加入排課日期
                        </button>
                        {extraDateKeys.length > 0 && (
                          <p className="text-sm text-earth-500">
                            以上日期使用相同時間、教練與教室；重複日期只建立一堂。如有撞期，整批不會建立。
                          </p>
                        )}
                      </div>
                    )}
                    {repeat && (
                      <fieldset className="col-span-full">
                        <legend>每週上課日（未選則依起始日）</legend>
                        <div className="flex flex-wrap gap-3">
                          {["日", "一", "二", "三", "四", "五", "六"].map(
                            (d, i) => (
                              <label
                                key={d}
                                className="flex min-h-11 items-center gap-1"
                              >
                                <input
                                  type="checkbox"
                                  name="weekday"
                                  value={i}
                                />
                                {d}
                              </label>
                            ),
                          )}
                        </div>
                      </fieldset>
                    )}
                    {repeat && (
                      <label className="col-span-full">
                        結束日期
                        <input
                          className={`${field} min-h-11`}
                          type="date"
                          name="until"
                          required
                        />
                      </label>
                    )}
                    <p className="col-span-full text-sm text-earth-500">
                      {waitlistEnabled && template?.waitlistEnabled ? `候補 ${template.waitlistLimit ?? waitlistDefaultLimit} 位 · ${(template.waitlistStopMinutes ?? waitlistDefaultStopMinutes) === 0 ? "自動遞補至開課前" : `開課前 ${waitlistStopLabel(template.waitlistStopMinutes ?? waitlistDefaultStopMinutes)}停止自動遞補`}` : "候補未開放"}
                      <span className="block mt-1 text-xs">沿用課程候補設定；停止自動遞補後保留候補名單。建立時檢查撞期。</span>
                    </p>
                  </form>
                )}
              </>
            )}
          </div>
          {panel === "day" &&
            canCreate &&
            calendarDays[selectedDate]?.status !== "closed" &&
            calendarDays[selectedDate]?.status !== "training" && (
              <footer className="shrink-0 border-t border-earth-200 bg-white p-4">
                <button
                  type="button"
                  className={`${primary} w-full`}
                  onClick={()=>openSchedule()}
                  disabled={pending}
                >
                  ＋ 新增排課
                </button>
              </footer>
            )}
          {panel === "inspect" && canEdit && <footer className="flex shrink-0 gap-2 border-t bg-white p-4"><button className={`${primary} flex-1`} onClick={()=>open("edit")}>編輯{editing?.kind === "room" ? "教室":"課程"}</button>{editing?.kind === "template" && <button type="button" className={`${button} text-red-700`} disabled={pending} onClick={()=>{if(!window.confirm("確認刪除此課程？已有排課或方案紀錄的課程會保留，請改用下架。"))return;startTransition(async()=>{const result=await deleteUnusedCourseTemplate({id:editing.value.id});if(!result.success){setError(result.error ?? "刪除失敗");return;}setPanel(null);setEditing(null);setNotice("已刪除未使用課程");router.refresh();});}}>刪除</button>}</footer>}
          {panel === "schedule" && businessProfile !== "MUSIC" && (
            <footer className="shrink-0 border-t bg-white p-3">
              <p className="mb-2 text-xs text-earth-700" aria-live="polite">{scheduleSummary || (copySource ? "請選擇新日期與時段" : (() => {const date = scheduleSeed.date ?? selectedDate;const time = scheduleSeed.time ?? "18:00"; const start = parseTaipeiDateTime(date,time); return start ? `共 1 堂 · ${date} ${time}–${formatTWDateTime(new Date(start.getTime() + (scheduleSeed.durationMinutes ?? template?.durationMinutes ?? 60)*60000)).slice(11)}` : "請選擇日期與時段";})())}</p>
              <button
                form="course-schedule-form"
                type="submit"
                className={`${primary} w-full`}
                disabled={
                  pending
                }
              >
                {pending ? "建立中…" : "確認建立排課"}
              </button>
            </footer>
          )}
          {panel === "edit" && editing && (
            <footer className="flex shrink-0 gap-2 border-t bg-white p-4">
              <button
                className={button}
                disabled={pending}
                onClick={() => {
                  if (dirty && !window.confirm("尚有未儲存的修改，要放棄嗎？")) return;
                  open(editing.kind === "session" ? "day" : null);
                  setEditing(null);
                }}
              >
                取消修改
              </button>
              <button
                form="course-edit-form"
                type="submit"
                className={`${primary} flex-1`}
                disabled={pending}
              >
                {copyTemplate && editing.kind === "template" ? "建立課程" : "儲存修改"}
              </button>
            </footer>
          )}
          {panel === "catalog" && canCreate && (
            <div className="shrink-0 border-t border-earth-200 bg-white p-4">
              <button
                type="submit"
                form={
                  view === "rooms"
                    ? "course-room-create-form"
                    : "course-template-create-form"
                }
                className={`${primary} w-full`}
                disabled={pending}
              >
                {pending
                  ? "儲存中…"
                  : view === "rooms"
                    ? "儲存"
                    : "建立課程"}
              </button>
            </div>
          )}
        </RightSheet>
      )}
      {courseDialog &&
        sessions.find((session) => session.id === courseDialog.sessionId) &&
        (() => {
          const dialogSession = sessions.find(
            (session) => session.id === courseDialog.sessionId,
          )!;
          const rentalDialog = dialogSession.previewKind === "RENTAL" || /租借|RENTAL/i.test(allTemplates.find(template=>template.id===dialogSession.templateId)?.category ?? "");
          const oneToOneMusicDialog = courseDialog.kind === "roster" && businessProfile === "MUSIC"
            && dialogSession.capacity === 1
            && allTemplates.find(template => template.id === dialogSession.templateId)?.classType === "PRIVATE";
          const dialogTitle = rentalDialog ? "租借資訊" :
            courseDialog.kind === "roster"
              ? businessProfile === "MUSIC" ? "課程詳情" : "上課名單"
              : courseDialog.kind === "member-booking"
                ? "＋ 學員預約"
                : "＋ 新顧客／體驗客";
          return (
            <RightSheet
              open
              presentation="centered"
              fitContent={rentalDialog || oneToOneMusicDialog || (courseDialog.kind === "roster" && businessProfile !== "MUSIC")}
              onClose={() => setCourseDialog(null)}
              width={rentalDialog ? 640 : oneToOneMusicDialog ? 860 : courseDialog.kind === "roster" && businessProfile === "MUSIC" ? 1120 : courseDialog.kind === "roster" ? 1200 : 560}
              labelledById="course-operation-title"
            >
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-earth-200 bg-primary-50 px-4 py-3">
                <div className="min-w-0">
                  <h2
                    id="course-operation-title"
                    className="truncate text-lg font-semibold text-primary-900"
                  >
                    {dialogTitle}
                  </h2>
                  <p className="mt-1 text-sm text-earth-600">
                    {formatTWDateTime(new Date(dialogSession.startsAt))} ·{" "}
                    {dialogSession.nameSnapshot} ·{" "}
                    {allRooms.find((room) => room.id === dialogSession.roomId)?.name ??
                      "未指定教室"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!rentalDialog && courseDialog.kind === "roster" && businessProfile === "MUSIC" && canEdit && dialogSession.rescheduledFromStartsAt && (
                    <button type="button" className={button} disabled={pending} onClick={() => restoreMove(dialogSession)}>恢復原時段</button>
                  )}
                  {!rentalDialog && courseDialog.kind === "roster" && businessProfile === "MUSIC" && canEdit && !moveClipboard && (
                    <button type="button" className={primary} onClick={() => {
                      if (dialogSession.isFixed) {
                        setMoveChoice(dialogSession);
                        setMoveWeeksOpen(false);
                      } else {
                        beginMove(dialogSession, "SINGLE");
                      }
                    }}>
                      ✂ 調課
                    </button>
                  )}
                  {!rentalDialog && courseDialog.kind === "roster" && canCreate && <><button type="button" className={primary} onClick={()=>setCourseDialog({sessionId:dialogSession.id,kind:"member-booking"})}>＋加入學員</button><button type="button" className={button} onClick={()=>setCourseDialog({sessionId:dialogSession.id,kind:"trial-booking"})}>＋體驗客</button></>}
                  <button type="button" className={button} onClick={() => { setMoveChoice(null); setCourseDialog(null); }}>關閉</button>
                </div>

              </header>
              {error && <p role="alert" className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
              {!rentalDialog && courseDialog.kind === "roster" && dialogSession.isFixed && moveChoice?.id === dialogSession.id && !moveClipboard && (
                <div className="shrink-0 space-y-2 border-b border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="mr-1 text-indigo-900">要調整哪些課？</strong>
                    <button className={primary} type="button" onClick={() => beginMove(dialogSession, "SINGLE")}>這堂</button>
                    <button className={button} type="button" onClick={() => setMoveWeeksOpen((open) => !open)} aria-expanded={moveWeeksOpen}>連續幾週</button>
                    <button className={button} type="button" onClick={() => beginMove(dialogSession, "FUTURE")}>換固定時段</button>
                    <button className="ml-auto text-xs text-earth-600" type="button" onClick={() => { setMoveChoice(null); setMoveWeeksOpen(false); }}>返回名單</button>
                  </div>
                  {moveWeeksOpen && <div className="flex flex-wrap gap-1" aria-label="選擇連續週數">
                    {[2,3,4,5,6,7,8].map((weeks) => <button className={button} type="button" key={weeks} onClick={() => beginMove(dialogSession, "WEEKS", weeks)}>{weeks} 週</button>)}
                  </div>}
                </div>
              )}
              <div
                className={`min-h-0 flex-1 overscroll-contain p-3 sm:p-4 ${
                  courseDialog.kind === "roster"
                    ? oneToOneMusicDialog ? "overflow-y-auto" : "flex overflow-hidden"
                    : "overflow-y-auto"
                }`}
              >
                {rentalDialog ? <section className="w-full space-y-4 text-sm" aria-label="租借明細"><dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-3"><dt className="text-earth-500">時段</dt><dd>{formatTWDateTime(new Date(dialogSession.startsAt))} ～ {formatTWDateTime(new Date(dialogSession.endsAt))}</dd><dt className="text-earth-500">空間</dt><dd>{allRooms.find(room=>room.id===dialogSession.roomId)?.name ?? "未指定"}</dd><dt className="text-earth-500">租借人</dt><dd>{dialogSession.bookings.filter(booking=>booking.status!=="CANCELLED").map(booking=>booking.customerName).join("、") || "尚未登記"}</dd></dl><p className="text-xs text-earth-500">此時段目前僅記錄空間占用；聯絡電話、費用與租借備註尚未建檔。</p></section> : <CourseRoster
                  key={`${dialogSession.id}-${courseDialog.kind}`}
                  sessionId={dialogSession.id}
                  capacity={dialogSession.capacity}
                  canCreate={canCreate}
                  canEdit={canEdit}
                  view={courseDialog.kind}
                  initialAssignedCoach={businessProfile === "MUSIC" ? "all" : assignedCoachFilter}
                  musicLayout={businessProfile === "MUSIC"}
                  classType={allTemplates.find(template=>template.id===dialogSession.templateId)?.classType}
                  teacherName={allCoaches.find((coach) => coach.id === dialogSession.coachId)?.displayName ?? "未指定老師"}
                  teacherPhone={allCoaches.find((coach) => coach.id === dialogSession.coachId)?.phone ?? ""}
                  coachId={dialogSession.coachId}
                  roomId={dialogSession.roomId}
                  roomName={allRooms.find((room) => room.id === dialogSession.roomId)?.name ?? "未指定教室"}
                  courseName={dialogSession.nameSnapshot}
                  onDone={() => setCourseDialog({sessionId:dialogSession.id,kind:"roster"})}
                  onAttendanceOptimistic={showPendingAttendance}
                  onTeacherAttendanceOptimistic={status=>setPendingTeacherAttendance(previous=>{if(status)return {...previous,[dialogSession.id]:status};const next={...previous};delete next[dialogSession.id];return next;})}
                  onMemberBookingReadyChange={setMemberBookingReady}
                  onCreateCustomer={() =>
                    setCourseDialog({
                      sessionId: dialogSession.id,
                      kind: "trial-booking",
                    })
                  }
                />}
              </div>
              {!rentalDialog && courseDialog.kind !== "roster" && (
                <footer className="shrink-0 border-t border-earth-200 bg-white px-4 py-3">
                  <button
                    type="submit"
                    form={
                      courseDialog.kind === "member-booking"
                        ? "course-member-booking-form"
                        : "course-trial-booking-form"
                    }
                    className={`${primary} w-full disabled:cursor-not-allowed disabled:bg-earth-200 disabled:text-earth-500`}
                    disabled={
                      courseDialog.kind === "member-booking" &&
                      !memberBookingReady
                    }
                  >
                    {courseDialog.kind === "member-booking"
                      ? "確認學員預約"
                      : "建立並加入課程"}
                  </button>
                </footer>
              )}
            </RightSheet>
          );
        })()}
    </>
  );
}

function RoomMore({
  music=false, capacity,
  details, equipment, location,
}: {
  music?:boolean; capacity?: number | null;
  details?: string;
  equipment?:string;location?:string;visibility?:string;classType?:string|null;
}) {
  return (
    <>
      {!music && <label className="col-span-full">
        容納人數
        <input
          className={field}
          name="roomCapacity"
          type="number"
          min={1}
          max={500}
          defaultValue={capacity ?? ""}
        />
      </label>}
      <details name="course-workspace-details" className="col-span-full">
        <summary className="min-h-11 cursor-pointer py-3">選填：設備、位置與備註</summary>
        <div className="grid gap-3 sm:grid-cols-2"><RoomFields equipment={equipment} location={location}/></div>
        <label>
          備註
          <textarea
            className={field}
            name="details"
            rows={2}
            maxLength={5000}
            defaultValue={details}
          />
        </label>
      </details>
    </>
  );
}
function TemplateMore({
  description,
  precautions,
}: {
  description?: string;
  precautions?: string;
}) {
  return (
    <details name="course-workspace-details" className="col-span-full">
      <summary className="min-h-11 cursor-pointer py-3">選填：課程介紹與注意事項</summary>
      <label>
        課程介紹
        <textarea
          className={field}
          name="description"
          maxLength={5000}
          defaultValue={description}
        />
      </label>
      <label>
        注意事項
        <textarea
          className={field}
          name="precautions"
          maxLength={5000}
          defaultValue={precautions}
        />
      </label>
    </details>
  );
}

function musicCourseInput(data:FormData) {
  return {
    musicPricePerLesson:Number(data.get("musicPricePerLesson")),
    musicTermLessons:Number(data.get("musicTermLessons")),
    musicValidityDaysPerTerm:Number(data.get("musicValidityDaysPerTerm")),
    musicScheduleMode:data.get("musicScheduleMode"),
    musicTrialMode:data.get("musicTrialMode") || null,
    musicTeacherFeeBase:data.get("musicTeacherFeeBase") ? Number(data.get("musicTeacherFeeBase")) : null,
  };
}
function MusicCourseFields({value}:{value?:{musicPricePerLesson?:number|null;musicTermLessons?:number|null;musicValidityDaysPerTerm?:number|null;musicScheduleMode?:string|null;musicTrialMode?:string|null;musicTeacherFeeBase?:number|null}}) {
  return <>
    <label>每位學員每堂售價（元）<input className={field} name="musicPricePerLesson" type="number" min="0" max="1000000" defaultValue={value?.musicPricePerLesson ?? 800} required/></label>
    <label>每期堂數<input className={field} name="musicTermLessons" type="number" min="1" max="1000" step="1" defaultValue={value?.musicTermLessons ?? 4} required/></label>
    <label>排課方式<select className={field} name="musicScheduleMode" defaultValue={value?.musicScheduleMode ?? "FIXED"}><option value="FIXED">固定時段</option><option value="APPOINTMENT">每次約課</option></select></label>
    <label>每期有效天數<input className={field} name="musicValidityDaysPerTerm" type="number" min="1" max="3650" defaultValue={value?.musicValidityDaysPerTerm ?? 35} required/><span className="text-xs text-earth-500">固定課預設 35 天；約課預設 70 天，從第一次上課起算。</span></label>
    <label>體驗課<select className={field} name="musicTrialMode" defaultValue={value?.musicTrialMode ?? ""}><option value="">一般課程</option><option value="FREE">免費體驗（30 分鐘）</option><option value="PAID">付費體驗（完整一堂）</option></select></label>
    <label>免費體驗老師計費基礎（元）<input className={field} name="musicTeacherFeeBase" type="number" min="0" max="1000000" defaultValue={value?.musicTeacherFeeBase ?? ""} placeholder="例：個別 400、雙人每位 325"/><span className="text-xs text-earth-500">只供免費體驗計算老師分成，依實際報名座位計，不因曠課減少。</span></label>
    <p className="col-span-full text-xs text-earth-600">音樂教室只使用堂數，每位學員每次上課使用 1 堂。團體課請假仍扣堂，自組課請假可在期限內補課。</p>
  </>;
}
function ClassType({value,required=false}:{value?:string|null;required?:boolean}) {return <label className="col-span-full">課型{required ? "（必填）" : ""}<select className={field} name="classType" required={required} defaultValue={value ?? ""}><option value="">{required ? "請選擇課型" : "待補設定"}</option><option value="PRIVATE">個別課</option><option value="SELF_ORGANIZED">自組課（自行組隊，請假可補）</option><option value="GROUP">團體課（店家開班，請假扣堂）</option></select></label>;}
function RoomFields({equipment,location}:{equipment?:string;location?:string}) {return <><label className="block">設備<input className={field} name="equipment" defaultValue={equipment}/></label><label className="block">位置<input className={field} name="location" defaultValue={location}/></label></>;}

function DebitRule({music=false}:{music?:boolean}) {
  return <p className="col-span-full text-sm leading-relaxed text-earth-600">{music ? "只使用堂數方案：每位學員每次固定使用 1 堂；先保留額度，出席或曠課才扣堂。團體課請假也扣堂。" : "依使用卡別扣抵：點數卡每次扣課程設定點數；堂數卡每次固定扣 1 堂，不會同時扣兩種額度。須使用適用本課程的方案。預約先占用，出席才正式扣抵。"}</p>;
}

function TrialClassField({value}:{value?:string|null}) {return <label>班級性質<select className={field} name="musicTrialMode" defaultValue={value ?? ""}><option value="">一般課程</option><option value="PAID">體驗班</option></select></label>;}
