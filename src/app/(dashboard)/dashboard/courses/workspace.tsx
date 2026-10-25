"use client";
import {useCoursePersonnelText} from "@/components/course-personnel-label";

import {courseWeekStart} from "@/lib/course-calendar";
import {serviceCustomerMatches} from "@/lib/service-calendar-layout";
import {serviceCalendarPresentation} from "@/lib/service-calendar-presentation";
import {serviceScheduleTotals} from "@/lib/service-schedule-counts";
import {CourseCatalogNameField,CourseCatalogDurationField} from "./catalog-fields";
import type {CatalogStatusDriver} from "@/lib/course-catalog-driver";
import {ScheduleMonthGrid} from "@/components/admin/schedule-month-grid";

import type {CourseSchedulingModes} from "@/lib/course-scheduling-modes";
import {useSportsCalendarState,useSportsCalendarScroll,calendarDate,calendarMode,calendarString} from "@/components/admin/use-sports-calendar-state";
import {applySportsMovePatches} from "@/lib/sports-move-patch";
import {sportsScheduleKinds,sportsCalendarPresentation,sportsCalendarMatches} from "@/lib/sports-calendar-presentation";
import {syncSportsPermanentCalendar} from "@/server/actions/sports-series";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {readSportsCalendar} from "@/lib/sports-calendar-client";
import {startSportsBackgroundSync} from "@/lib/sports-background-sync";
import {SportsAttendancePanel} from "./sports-attendance-panel";
import {checkSportsCourseMove} from "@/server/actions/course";
import {SportsCancelCourse} from "./sports-cancel-course";
import {SportsMoveConfirm} from "./sports-move-confirm";
import {SportsScheduleDialog} from "./sports-schedule-dialog";
import {SportsScheduleFields,type SportsScheduleSource} from "./sports-schedule-fields";
import { SportsSessionNameField } from "./sports-session-name-field";
import type {SportsSnapshot} from "@/lib/sports-staging-types";
import { courseTemplateLabel, courseDisplayName } from "@/lib/course-template-presentation";
import { savedCourseRoom, courseRoomRevision } from "@/lib/course-room-input";
import { useSettingsSave } from "@/components/admin/use-settings-save";
import { useConfirmedSettingsRows } from "@/components/admin/use-confirmed-settings-rows";
import { savedCourseTemplate, courseTemplateRevision } from "@/lib/course-template-save";
import { useCourseRoomCreate } from "@/components/admin/use-course-room-create";
import { CourseSetupStepBadge } from "@/components/admin/course-setup-step-badge";
import { courseDisplayText } from "@/lib/course-display-text";
import { MUSIC_DEFAULT_DURATION_MINUTES } from "@/lib/music-teaching-item";
import { publishMusicFinanceChange } from "@/lib/music-finance-sync";
import { monthlyReturnHref, studentReturnHref } from "@/lib/music-student-navigation";
import { DashboardLink } from "@/components/dashboard-link";
import styles from "./schedule-layout.module.css";
import scheduleControls from "@/components/admin/schedule-controls.module.css";
import {fitnessEditorFooter, fitnessEditorSave} from "@/components/admin/course-editor-styles";
import { WeeklyRepeatFields } from "@/components/admin/weekly-repeat-fields";
import { CourseCustomerPicker } from "@/components/admin/course-customer-picker";
import { CourseScheduleToolbar } from "@/components/admin/course-schedule-toolbar";
import { courseScheduleFormFields, courseScheduleCreatedDates } from "@/lib/course-schedule-form";
import { MultiDateCalendar } from "@/components/admin/multi-date-calendar";
import {RentalPanel,RentalHistory,type RentalPermissions,type RentalCustomer} from "./rental-panel";
import {useCourseDisplayOrder} from "@/components/admin/course-display-order";
import type {CourseOrderSnapshot} from "@/lib/course-display-order";

import {CourseTestDataFilter,isCourseTestData} from "@/components/admin/course-test-data-filter";
import {CourseStatusButton,useCourseStatusRows} from "@/components/admin/course-status-button";
import {CourseBatchBar} from "@/components/admin/course-batch-selection";

import {CourseConflicts,type ConflictItem} from "@/components/admin/course-conflicts";
import { Fragment, useEffect, useRef, useState, useTransition, type FormEvent, useCallback, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CourseRoster } from "./roster";
import { MusicScheduleWizard } from "./music-schedule-wizard";
import { useCourseDraftGuard } from "@/components/admin/use-course-draft-guard";
import { DailyAttendanceList, type DailyAttendanceRow } from "./daily-attendance-list";
import {
  CourseScheduleBoard, ServiceCalendarLegend,
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
  createCourseSchedule,
  deleteUnusedCourseTemplate,
  updateCourseSession,
  moveCourseSessions,
  setCourseCatalogStatus,
  batchCourseTemplates,
} from "@/server/actions/course";
import {musicScheduleColors} from "@/lib/music-schedule-colors";
import { courseClassMatches, courseClassPresentation } from "@/lib/course-class-presentation";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { courseAttendanceState } from "@/lib/course-attendance-visual";
import { courseSessionStatus } from "@/lib/course-session-status";
import { scheduleRosterBookings, scheduleAssignedBookings } from "@/lib/course-schedule-counts";
import { buildCourseOccurrences } from "@/lib/course-scheduling";
import { scheduleMonthSummary, scheduleTotals } from "@/lib/music-schedule-audit";

export type Room = {
  rentalEnabled?:boolean;rentalHourlyRate?:number;rentalBufferMinutes?:number;
  id: string;
  catalogRevision?:number;
  catalogSnapshot?:Record<string,unknown>;
  name: string;
  category: string;
  isActive: boolean;
  capacity: number | null;
  details?: string;
  equipment?:string;location?:string;visibility?:string;classType?:string|null;
  musicPricePerLesson?:number|null;musicTermLessons?:number|null;musicValidityDaysPerTerm?:number|null;musicScheduleMode?:string|null;musicTrialMode?:string|null;musicTeacherFeeBase?:number|null;
  uses?: { id:string;nameSnapshot: string; startsAt: string }[];
};
export type Template = Omit<Room, "capacity"> & {
  displayName?:string;currentTeaching?:boolean;
  musicSubjectId?:string|null;musicSubject?:{id:string;name:string;isActive:boolean}|null;
  durationMinutes: number;
  bufferMinutes?:number;
  hasSessions?:boolean;
  capacity: number;
  pointCost: number;
  defaultRoomId: string | null;
  description?: string;
  precautions?: string;
  waitlistEnabled?: boolean;
  waitlistLimit?: number;
  waitlistStopMinutes?: number | null;
};
export type Session = {
  serviceCustomer?:{name:string;phone:string;assignedStaffId?:string|null};
  servicePalette?:boolean;
  service?:{paymentStatus?:string;groupLabel?:string;groupProgress?:string;groupId?:string;personName:string;status:string;occupiedEndsAt:string;endsAt:string;buffer:number};
  occupiedStartsAt?:string;occupiedEndsAt?:string;
  sportsPalette?:boolean;
  rentalId?:string;rentalCancelled?:boolean;isTrial?:boolean;
  bookings: {
    id: string;
    customerId: string | null;
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
  bookingAudience?:string;
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
export type CourseCalendarSnapshot={month:string;sessions:Session[];calendarDays:Props["calendarDays"];cancelledBookings:Props["cancelledBookings"];staffAvailabilityExceptions:Props["staffAvailabilityExceptions"]};
export type CourseCatalogSource={rentalModule?:"course"|"beauty";order?:import("@/lib/course-display-order").CourseOrderWriter;status:CatalogStatusDriver;save:(kind:"room"|"template",input:Record<string,unknown>)=>Promise<{success:true;data:Room|Template}|{success:false;error:string}>};
export type CourseCalendarSource={
 readBlocked?:boolean;
 snapshotVersion?:string;
 move?:{clipboard:CourseMoveClipboard;onPaste:(target:{date:string;time:string;roomId:string;coachId:string})=>void;onCancel:()=>void};
 read:(date:string)=>Promise<{success:true;data:CourseCalendarSnapshot;onAccepted?:()=>void}|{success:false;error:string}>;
 schedule:SportsScheduleSource;
 onOpen:(id:string)=>void;
 onRoster:()=>void;
 onDateChange?:(date:string)=>void;
 assignmentStaff:{id:string;name:string}[];
};
type Props = {
  calendarSource?:CourseCalendarSource;
  catalogSource?:CourseCatalogSource;
  schedulingModes?:CourseSchedulingModes;
  storeId?: string;
  rentalPermissions?:RentalPermissions;
  rentalCustomers?:RentalCustomer[];
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
  initialSportsCalendarWarning?:string;
  sportsNative?:boolean;
  sportsData?:SportsSnapshot;
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
  "min-h-11 min-w-0 max-w-full w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";

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
    <fieldset className="col-span-full border-t border-earth-100 pt-2">

      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          name="waitlistEnabled"
          value="yes"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        開放候補
      </label>
      <div className={`mt-1 grid gap-2 min-[400px]:grid-cols-2 ${enabled ? "" : "hidden"}`}>
        <label>
          候補上限
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
  calendarSource,
  catalogSource,
  storeId,
  displayOrder,
  canDelete=false,
  selectedDate: loadedDate,
  today,
  nowIso,
  calendarDays:sourceCalendarDays,
  rooms: sourceRooms,
  templates: sourceTemplates,
  sessions:sourceSessions,
  cancelledBookings:sourceCancelledBookings,
  coaches: allCoaches,
  canCreate,
  canEdit,
  rentalCustomers=[],
  rentalPermissions={customerRead:false,customerCreate:false,collect:false,correct:false,edit:false},
  cashbookShortcut,
  initialSportsCalendarWarning,
  sportsNative=false,
  sportsData,
  schedulingModes,
  businessProfile,
  waitlistEnabled = false,
  waitlistDefaultLimit = 5,
  waitlistDefaultStopMinutes = 240,
  staffAvailability,
  staffAvailabilityExceptions:sourceStaffAvailabilityExceptions,
  view,
}: Props) {
  const personnelText = useCoursePersonnelText();
  const coaches = allCoaches.filter((c) => c.status === "ACTIVE" && c.courseCoachEnabled);
  const confirmedRooms = useConfirmedSettingsRows(sourceRooms, courseRoomRevision);
  const mergedRooms = confirmedRooms.rows;
  const [allRooms,applyStatus,busyIds,setStatusBusy]=useCourseStatusRows(mergedRooms);
  const rooms = allRooms.filter((r) => r.isActive);
  const confirmedTemplates = useConfirmedSettingsRows(sourceTemplates,row=>catalogSource?JSON.stringify(row):courseTemplateRevision(row));
  const allTemplates = confirmedTemplates.rows;
  const templates = allTemplates.filter((t) => t.currentTeaching!==false && t.isActive && t.musicSubject?.isActive !== false);
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const roomSave = useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/course/room`, storeId ?? "", savedCourseRoom);
  async function saveRoom(input:Record<string,unknown>, previous:Room) {
    if(catalogSource)return saveExternalCatalog("room",input);
    const result = await roomSave.save(input);
    if (result.success) { confirmedRooms.confirm({...previous,...result.data});setNewRoomId(result.data.id); }
    return result;
  }
  const templateSave = useSettingsSave(`${pathname.split("/dashboard")[0]}/dashboard/settings-save/course/template`, storeId ?? "", savedCourseTemplate);
  const [savedTemplateId,setSavedTemplateId] = useState<string|null>(null);
  async function saveTemplate(input:Record<string,unknown>) {
    if(catalogSource)return saveExternalCatalog("template",input);
    const result = await templateSave.save(input);
    if (result.success) { confirmedTemplates.confirm(result.data);setSavedTemplateId(result.data.id); }
    return result;
  }
  async function saveExternalCatalog(kind:"room"|"template",input:Record<string,unknown>){
    if(!catalogSource)return {success:false as const,error:"缺少模組儲存接點"};
    const result=await catalogSource.save(kind,input);
    if(result.success){if(kind==='room'){confirmedRooms.confirm(result.data);setNewRoomId(result.data.id);}else if('durationMinutes' in result.data){confirmedTemplates.confirm(result.data);setSavedTemplateId(result.data.id);}router.refresh();}
    return result;
  }
  const [sportsCreatedCustomers,setSportsCreatedCustomers]=useState<Record<string,SportsSnapshot["customers"][number]>>({});
  useEffect(()=>{setSportsCreatedCustomers({});},[storeId]);
  const [nativeDate,setNativeDate]=useSportsCalendarState(sportsNative,"date",loadedDate,calendarDate);
  const [nativeCalendarWarning,setNativeCalendarWarning]=useState(initialSportsCalendarWarning);
  const [nativeCalendar,setNativeCalendar]=useState<{schedulingModes?:CourseSchedulingModes;month:string;sessions:Session[];calendarDays:Props["calendarDays"];cancelledBookings:typeof sourceCancelledBookings;staffAvailabilityExceptions:typeof sourceStaffAvailabilityExceptions}|null>(null);
  const sportsCalendarReader=usePanelReader(calendarSource?"service-native-calendar":"sports-calendar",calendarSource?.read??readSportsCalendar,storeId??"",0);
  const calendarRequest=useRef(0);
  const calendarReadsInFlight=useRef(0);
  const calendarTargetMonth=useRef(loadedDate.slice(0,7));
  const [calendarReading,setCalendarReading]=useState(false);
  const nativeDateRef=useRef(nativeDate);nativeDateRef.current=nativeDate;
  const activeSchedulingModes=nativeCalendar?.schedulingModes??schedulingModes;
  const sessions:Session[]=nativeCalendar?.sessions??sourceSessions;
  const cancelledBookings=nativeCalendar?.cancelledBookings??sourceCancelledBookings;
  const calendarDays=nativeCalendar?.calendarDays??sourceCalendarDays;
  const staffAvailabilityExceptions=nativeCalendar?.staffAvailabilityExceptions??sourceStaffAvailabilityExceptions;
  const sourceVersion=useRef(calendarSource?.snapshotVersion);
  useEffect(()=>{if(sourceVersion.current===calendarSource?.snapshotVersion)return;sourceVersion.current=calendarSource?.snapshotVersion;++calendarRequest.current;setNativeCalendar(null);setCalendarReading(false);sportsCalendarReader.clear();},[calendarSource?.snapshotVersion,sportsCalendarReader]);
  const refreshNativeCalendar=useCallback(async(date:string,ensure=false,background=false)=>{
    calendarTargetMonth.current=date.slice(0,7);
    const request=++calendarRequest.current;
    calendarReadsInFlight.current++;
    if(!background)setCalendarReading(true);
    try{
      let warning:string|undefined;
      const ensured=ensure&&sportsNative&&canCreate&&!calendarSource;
      if(ensured){const sync=await syncSportsPermanentCalendar(date);if(!sync.success)throw new Error(sync.error);warning="warning" in sync?sync.warning??undefined:undefined;}
      if(!background)sportsCalendarReader.clear();
      const result=await sportsCalendarReader.read(date);
      if(request!==calendarRequest.current)return null;
      if(result.success){if('onAccepted' in result&&typeof result.onAccepted==='function')result.onAccepted();if(ensured)setNativeCalendarWarning(warning);setNativeCalendar(result.data);setLastUpdated(new Date());return true;}
      setError(result.error);return false;
    }catch{if(request===calendarRequest.current)setError("課表讀取失敗，請重試");return false;}
    finally{calendarReadsInFlight.current--;if(request===calendarRequest.current)setCalendarReading(false);}
  },[sportsNative,canCreate,sportsCalendarReader,calendarSource]);
  useEffect(()=>{if(sportsNative&&nativeDate.slice(0,7)!==(nativeCalendar?.month??loadedDate.slice(0,7))&&calendarTargetMonth.current!==nativeDate.slice(0,7))void refreshNativeCalendar(nativeDate,true);},[sportsNative,nativeDate,nativeCalendar?.month,loadedDate,refreshNativeCalendar]);
  useSportsCalendarScroll(sportsNative&&view==="schedule","window",undefined,!calendarReading);
  const refreshWorkspace=useCallback(()=>{if(sportsNative)void refreshNativeCalendar(nativeDateRef.current);else router.refresh();},[sportsNative,refreshNativeCalendar,router]);
  const requestedDate = sportsNative?nativeDate:params.get("date");
  const selectedDate = requestedDate && parseTaipeiDateTime(requestedDate, "00:00") ? requestedDate : loadedDate;
  const requestedScheduleMode = params.get("scheduleView");
  const [scheduleMode, setScheduleMode] = useSportsCalendarState<CourseScheduleMode>(sportsNative,"mode",
    requestedScheduleMode === "day" || requestedScheduleMode === "week" || requestedScheduleMode === "month"
      ? requestedScheduleMode
      : businessProfile === "MUSIC"
        ? "day"
        : "month",calendarMode,
  );
  const explicitDate=params.get("date"),explicitMode=params.get("scheduleView");
  useEffect(()=>{if(!sportsNative)return;if(explicitDate&&calendarDate(explicitDate))setNativeDate(explicitDate);if(explicitMode&&calendarMode(explicitMode))setScheduleMode(explicitMode);},[sportsNative,explicitDate,explicitMode,setNativeDate,setScheduleMode]);
  function changeScheduleMode(nextMode: CourseScheduleMode) {
    setScheduleMode(nextMode);
    if(sportsNative)return;
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
  const [rosterRevision,setRosterRevision]=useState(0);
  const [inlineBusy,setInlineBusy]=useState(false);
  const inlineDirty=useRef(false);
  function changeBooking(kind:"roster"|"member-booking"|"trial-booking",sessionId:string){
    if(inlineBusy)return;

    inlineDirty.current=false;setCourseDialog({sessionId,kind});
  }
  const [memberBookingReady, setMemberBookingReady] = useState(false);
  const roomCreate = useCourseRoomCreate(storeId, (room, warning) => {
    confirmedRooms.confirm({ ...room, uses: [] });
    setDirty(false); setPanel(null); setError("");
    setNotice(warning ? `${room.name} · 已儲存，其他頁面更新失敗，請重新整理核對。` : `${room.name} · 已儲存`);
    setNewRoomId(room.id);
  }, pathname);
  const [newRoomId, setNewRoomId] = useState<string | null>(null);
  const [transitionPending, startTransition] = useTransition();
  const submitLock=useRef(false);
  const pending = transitionPending || roomCreate.pending || roomSave.pending || templateSave.pending;
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
  >(canCreate && params.get("action") === "create" && view!=="schedule" ? "catalog" : canCreate && params.get("action") === "schedule" ? "schedule" : params.get("returnStudentId") && sessions.some(session=>session.id===params.get("session")) ? null : params.get("action") === "booking" || params.get("session") ? "day" : null);
  useEffect(()=>{if(sportsNative&&!calendarSource&&panel==="schedule")void refreshNativeCalendar(nativeDateRef.current,false,true);},[sportsNative,calendarSource,panel,refreshNativeCalendar]);
  const [dirty, setDirty] = useState(false);
  const backgroundRefreshRequestedAt = useRef(0);
  useEffect(() => {
    // Keep the calendar current even with the day sheet closed. Nested roster
    // dialogs own their reads; never refresh their parent during a transaction.
    if (calendarSource?.readBlocked || view !== "schedule" || (panel !== null && panel !== "day") || courseDialog || dirty || pending || roomCreate.uncertain || roomSave.uncertain || templateSave.uncertain) return;
    if (sportsNative) {
      return startSportsBackgroundSync(
        () => refreshNativeCalendar(nativeDateRef.current,false,true),
        () => calendarReadsInFlight.current > 0,
      );
    }
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - backgroundRefreshRequestedAt.current < 15_000) return;
      backgroundRefreshRequestedAt.current = Date.now();
      startTransition(() => {
        refreshWorkspace();
        setLastUpdated(new Date());
      });
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [calendarSource?.readBlocked, panel, router, view, courseDialog, dirty, pending, roomCreate.uncertain, roomSave.uncertain, templateSave.uncertain, startTransition, sportsNative, refreshNativeCalendar, refreshWorkspace]);
  useCourseDraftGuard(!sportsNative&&dirty,!sportsNative&&!!panel&&(pending || roomCreate.uncertain || roomSave.uncertain || templateSave.uncertain));
  const musicScheduleGuard=useRef({dirty:false,pending:false});
  const [sportsScheduleBusy,setSportsScheduleBusy]=useState(false);
  const updateMusicScheduleGuard=useCallback((dirty:boolean,pending:boolean)=>{musicScheduleGuard.current={dirty,pending};if(sportsNative)setSportsScheduleBusy(pending);},[sportsNative]);
  const restoreScrollY = useRef<number | null>(null);
  useEffect(() => {
    if (restoreScrollY.current === null) return;
    const y = restoreScrollY.current;
    restoreScrollY.current = null;
    window.requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [allTemplates, sourceRooms]);

  const rentalGuard=useRef({pending:false,dirty:false});
  const updateRentalGuard=useCallback((pending:boolean,dirty:boolean)=>{rentalGuard.current={pending,dirty};},[]);
  const [roomRentalHistory,setRoomRentalHistory]=useState(false);
  function closeRentalDialog(){if(inlineBusy||rentalGuard.current.pending)return;inlineDirty.current=false;setCourseDialog(null);}
  function closePanel() {
    if(musicScheduleGuard.current.pending || rentalGuard.current.pending || roomCreate.uncertain || roomSave.uncertain || templateSave.uncertain || pending)return;
    setDirty(false);
    setPanel(null);
  }
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [roomFilter, setRoomFilter] = useSportsCalendarState(sportsNative,"roomFilter",params.get("room") ?? "all",calendarString);
  const [rentalFilter, setRentalFilter] = useState("all");
  const [classFilter, setClassFilter] = useSportsCalendarState(sportsNative,"classFilter","all",calendarString);
  const [coachFilter, setCoachFilter] = useSportsCalendarState(sportsNative,"coachFilter","all",calendarString);
  const [assignedCoachFilter, setAssignedCoachFilter] = useSportsCalendarState(sportsNative,"assignedCoachFilter","all",calendarString);
  const [scheduleStudentSelection,setScheduleStudentSelection]=useState<{id:string;name:string;phone?:string}[]>([]);
  const scheduleStudentId=scheduleStudentSelection[0]?.id??"";
  const [scheduleQuery, setScheduleQuery] = useSportsCalendarState(sportsNative,"scheduleQuery","",calendarString);
  const [hideTestData,setHideTestData]=useState(false);
  const [showInactive,setShowInactive]=useState(false);
  const catalogItems = view === "rooms" ? allRooms : allTemplates;
  const categories = [
    ...new Set(catalogItems.map((item) => item.category)),
  ].sort();
  const order=useCourseDisplayOrder(catalogSource&&view==="catalog"?"subject":"room",catalogSource?catalogItems:allRooms,displayOrder,(!catalogSource||!!catalogSource.order)&&(view==="rooms"||!!catalogSource)&&canEdit&&!query&&status==="all"&&category==="all"&&rentalFilter==="all"&&!hideTestData&&!busyIds.length,r=>r.isActive,catalogSource?.order);
  const filteredItems = catalogItems
    .filter(
      (item) =>
        (view === "rooms" && item.id === newRoomId) || (view === "catalog" && item.id === savedTemplateId) || (!hideTestData||!isCourseTestData(item.name)) && item.name
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()) &&
        (status === "all" || (view === "rooms" ? item.isActive === (status === "active") : (item.visibility ?? (item.isActive?"PUBLIC":"OFF")) === status)) &&
        (!catalogSource && businessProfile !== "MUSIC" && view === "catalog" || category === "all" || item.category === category) &&
        (view !== "rooms" || rentalFilter === "all" || !!item.rentalEnabled === (rentalFilter === "enabled")) &&
        (view !== "catalog" || !!catalogSource || (businessProfile !== "MUSIC" ? courseClassMatches(classFilter, item.classType) : classFilter === "all" || ("classType" in item && (classFilter === "TRIAL" ? !!item.musicTrialMode : !item.musicTrialMode && item.classType === classFilter)))) &&
        (view === "rooms" ||
          roomFilter === "all" ||
          ("defaultRoomId" in item && item.defaultRoomId === roomFilter)),
    )
    .sort((a, b) => {
      const rank = (item: Room) => !item.isActive ? 2 : item.visibility === "HIDDEN" ? 1 : 0;
      return rank(a) - rank(b) || (view==="rooms"||catalogSource?order.compare(a,b):0) || ((businessProfile === "MUSIC" || catalogSource) && view === "catalog" ? a.category.localeCompare(b.category, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant") : 0);
    });
  const isInactiveItem=(item:Room|Template)=>view==="rooms"?!item.isActive:!item.isActive||item.visibility==="OFF";
  const activeFilteredItems=filteredItems.filter(item=>!isInactiveItem(item));
  const inactiveFilteredItems=filteredItems.filter(isInactiveItem);
  const inactiveForced=status===(view==="rooms"?"inactive":"OFF")||!!query||category!=="all"||roomFilter!=="all"||classFilter!=="all"||rentalFilter!=="all";
  const inactiveExpanded=inactiveForced||showInactive||inactiveFilteredItems.some(item=>item.id===savedTemplateId);
  const visibleItems=[...activeFilteredItems,...(inactiveExpanded?inactiveFilteredItems:[])];
  function changeStatus(item: Room, visibility?:string) {
    if(catalogSource){if(!pending)startTransition(async()=>{const result=await catalogSource.status.apply({kind:view=== "rooms"?"room":"subject",ids:[item.id],active:visibility?visibility!=="OFF":!item.isActive});if(!result.success)setError(result.error);else if(result.failed.length)setError(result.failed.map(f=>f.error).join("；"));else refreshWorkspace();});return;}
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
        publishMusicFinanceChange();
        refreshWorkspace();
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
  const [repeatMode, setRepeatMode] = useState<"once" | "weekly" | "dates">("once");
  const repeat = repeatMode === "weekly";
  const multipleDates = repeatMode === "dates";
  const [scheduleCreated, setScheduleCreated] = useState<string[] | null>(null);
  const [scheduleSummary, setScheduleSummary] = useState("");
  const [scheduleValidationError, setScheduleValidationError] = useState("");
  const [editing, setEditing] = useState<
    | { kind: "room"; value: Room }
    | { kind: "template"; value: Template }
    | { kind: "session"; value: Session }
    | null
  >(null);
  const compactSessionEdit = sportsNative && panel === "edit" && editing?.kind === "session";
  const month = selectedDate.slice(0, 7),
    first = `${month}-01`;
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(year, mon, 0).getDate();
  const filteredScheduleSessions = sessions.filter(
    (s) =>
      !s.rentalCancelled &&
      (calendarSource || businessProfile === "MUSIC" || roomFilter === "all" || s.roomId === roomFilter) &&
      (calendarSource || businessProfile === "MUSIC" || coachFilter === "all" || s.coachId === coachFilter) &&
      (calendarSource || (sportsNative ? sportsCalendarMatches(s,classFilter) : businessProfile === "MUSIC" ? true : courseClassMatches(classFilter, allTemplates.find(t => t.id === s.templateId)?.classType, !!(s.isTrial || allTemplates.find(t => t.id === s.templateId)?.musicTrialMode), !!s.rentalId || /租借|RENTAL/i.test(allTemplates.find(t => t.id === s.templateId)?.category ?? "")))) &&
      (calendarSource ? assignedCoachFilter === "all" || (assignedCoachFilter === "none" ? !s.serviceCustomer?.assignedStaffId : s.serviceCustomer?.assignedStaffId === assignedCoachFilter) : businessProfile === "MUSIC" || assignedCoachFilter === "all" || scheduleAssignedBookings(s.bookings, assignedCoachFilter).length > 0) &&
      (calendarSource ? serviceCustomerMatches(s.serviceCustomer??{name:s.service?.personName??s.nameSnapshot,phone:""},scheduleQuery) : !scheduleQuery.trim() || [s.nameSnapshot, ...s.bookings.map(booking => booking.customerName)].some(text=>text.toLocaleLowerCase().includes(scheduleQuery.trim().toLocaleLowerCase()))),
  ).map((session) => ({
    ...session,
    displayBookings: businessProfile !== "MUSIC" && assignedCoachFilter !== "all" ? scheduleAssignedBookings(session.bookings, assignedCoachFilter) : undefined,
    previewKind: session.rentalId || /租借|RENTAL/i.test(allTemplates.find((template) => template.id === session.templateId)?.category ?? "")
      ? "RENTAL" as const
      : undefined,
  }));
  const withPendingAttendance = (session: Session) => ({
    ...session,
    teacherAttendance: pendingTeacherAttendance[session.id] ?? session.teacherAttendance,
    previewStudentNames: session.bookings.length ? undefined : cancelledBookings.filter(booking => booking.sessionId === session.id && ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")).map(booking => booking.customerName),
    bookings: session.bookings.map(booking => pendingAttendance[booking.id] ? { ...booking, status: pendingAttendance[booking.id], absenceKind: pendingAttendance[booking.id] === "RESERVED" ? null : pendingLeaveIds.includes(booking.id) ? "STUDENT_LEAVE" : booking.absenceKind } : booking),
    displayBookings: session.displayBookings?.map(booking => pendingAttendance[booking.id] ? { ...booking, status: pendingAttendance[booking.id], absenceKind: pendingAttendance[booking.id] === "RESERVED" ? null : pendingLeaveIds.includes(booking.id) ? "STUDENT_LEAVE" : booking.absenceKind } : booking),
  });
  const monthSummary = scheduleMonthSummary(filteredScheduleSessions.map(withPendingAttendance), month);
  const monthTotals = monthSummary.totals;

  const monthServices=serviceScheduleTotals(monthSummary.records);
  const scheduleFiltered = calendarSource ? assignedCoachFilter !== "all" || !!scheduleQuery.trim() : businessProfile === "MUSIC" ? !!scheduleStudentId : coachFilter !== "all" || roomFilter !== "all" || classFilter !== "all" || assignedCoachFilter !== "all" || !!scheduleQuery.trim();
  const dailySessions = sessions.filter((session) => !session.rentalCancelled && toLocalDateStr(new Date(session.startsAt)) === selectedDate);
  const absentStudents: DailyAttendanceRow[] = dailySessions.flatMap((session) => {
    const teacherStatus = pendingTeacherAttendance[session.id] ?? session.teacherAttendance;
    if (teacherStatus === "LEAVE" || teacherStatus === "NO_SHOW") return [];
    return session.bookings.filter((booking) => (pendingAttendance[booking.id] ?? booking.status) === "RESERVED").map((booking) => ({ id:booking.id,sessionId:session.id,status:"RESERVED" as const, startsAt:session.startsAt,endsAt:session.endsAt,course:session.nameSnapshot,teacher:allCoaches.find(coach=>coach.id===session.coachId)?.displayName??personnelText("未指定教師"),name:booking.customerName }));
  });
  const leaveStudents: DailyAttendanceRow[] = cancelledBookings.filter(booking=>["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")).flatMap((booking) => {
    const session = dailySessions.find((item) => item.id === booking.sessionId);
    return session ? [{ id:booking.id,sessionId:session.id,status:"CANCELLED" as const,startsAt:session.startsAt,endsAt:session.endsAt,course:session.nameSnapshot,teacher:allCoaches.find(coach=>coach.id===session.coachId)?.displayName??personnelText("未指定教師"),name:booking.customerName,note:booking.notes }] : [];
  });
  const [sportsAttendanceOpen,setSportsAttendanceOpen]=useState(false);
  const [dailyList, setDailyList] = useState<"leave" | "unmarked" | null>(null);
  const byDate = new Map<string, Session[]>();
  for (const session of filteredScheduleSessions.map(withPendingAttendance)) {
    const day = toLocalDateStr(new Date(session.startsAt));
    byDate.set(day, [...(byDate.get(day) ?? []), session]);
  }
  for (const list of byDate.values()) list.sort((a,b)=>a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id));
  function go(date: string) {
    calendarSource?.onDateChange?.(date);
    if(sportsNative){setNativeDate(date);nativeDateRef.current=date;const month=date.slice(0,7);if(month!==(nativeCalendar?.month??loadedDate.slice(0,7)))void refreshNativeCalendar(date,true);else if(calendarTargetMonth.current!==month){++calendarRequest.current;calendarTargetMonth.current=month;setCalendarReading(false);}return;}
    const next = new URLSearchParams(params.toString());
    next.set("date", date);
    if (date.slice(0, 7) === loadedDate.slice(0, 7)) {
      // All sessions for this month are already loaded. Keep the open sheet,
      // filters and scroll position instead of remounting through navigation.
      window.history.replaceState(null, "", `${pathname}?${next}`);
    } else startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }
  function open(next: typeof panel) {
    if (pending) return;
    if (templateSave.uncertain || roomSave.uncertain) return;
    if (next === "catalog") roomCreate.reset();
    templateSave.reset();roomSave.reset();
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
  const [localMoveClipboard, setMoveClipboard] = useState<CourseMoveClipboard | null>(null);
  const moveClipboard=calendarSource?.move?.clipboard??localMoveClipboard;
  const [moveWeeksOpen, setMoveWeeksOpen] = useState(false);
  const [moveClipboardLoaded, setMoveClipboardLoaded] = useState(false);
  const moveStorageKey = `course-move:${pathname}`;

  useEffect(() => {
    if (calendarSource || businessProfile !== "MUSIC") return;
    try {
      const saved = window.sessionStorage.getItem(moveStorageKey);
      if (saved) setMoveClipboard((current) => current ?? JSON.parse(saved) as CourseMoveClipboard);
    } catch {
      // A stale clipboard must never block the schedule.
    } finally {
      setMoveClipboardLoaded(true);
    }
  }, [businessProfile, moveStorageKey,calendarSource]);

  useEffect(() => {
    if (businessProfile !== "MUSIC" || !moveClipboardLoaded) return;
    try {
      if (moveClipboard) window.sessionStorage.setItem(moveStorageKey, JSON.stringify(moveClipboard));
      else window.sessionStorage.removeItem(moveStorageKey);
    } catch {
      // sessionStorage is only a convenience for cross-month moves.
    }
  }, [businessProfile, moveClipboard, moveClipboardLoaded, moveStorageKey]);

  const [arrangement,setArrangement]=useState<"choose"|"class"|"fixed"|"single"|"trial"|"rental">(businessProfile === "MUSIC" ? "single" : "class");
  const [scheduleDate, setScheduleDate] = useState(selectedDate);

  const [scheduleSeed,setScheduleSeed]=useState<{single?:boolean;date?:string;time?:string;roomId?:string;coachId?:string;durationMinutes?:number}>({});
  const [moveTarget,setMoveTarget]=useState<{date:string;time:string;roomId:string;coachId:string}|null>(null);
  const movePreflight=useRef(false);
  const [checkingMove,setCheckingMove]=useState(false);
  async function beginMove(session: Session, scope: CourseMoveClipboard["scope"], weeks?: number) {
    if(sportsNative){
      if(movePreflight.current)return;
      if(moveClipboard?.sessionId!==session.id&&moveClipboard&&!window.confirm(`改為剪下「${session.nameSnapshot}」？原本待貼上的課程不會變動。`))return;
      movePreflight.current=true;setCheckingMove(true);
      try{const result=await checkSportsCourseMove(session.id);if(!result.success){setError(result.error??"暫時無法調課");return;}}
      catch{setError("無法核對調課條件，請重試");return;}
      finally{movePreflight.current=false;setCheckingMove(false);}
    }
    const durationMinutes = Math.max(5, Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000));
    setMoveClipboard({
      sessionId: session.id,
      startsAt:session.startsAt,
      templateId: session.templateId,
      coachId: session.coachId,
      roomId: session.roomId,
      durationMinutes,
      scope,
      weeks,
      label: sportsNative ? session.nameSnapshot : session.bookings[0]?.customerName || session.nameSnapshot,
    });
    setMoveChoice(null);
    setMoveWeeksOpen(false);
    setCourseDialog(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setNotice("");
    setError("");
  }
  function pasteMove(value: {date?:string;time:string;roomId:string;coachId:string}) {
    if(calendarSource?.move){calendarSource.move.onPaste({...value,date:value.date??selectedDate});return;}
    if(sportsNative&&moveClipboard){setMoveTarget({date:value.date??selectedDate,time:value.time,roomId:value.roomId,coachId:value.coachId});return;}
    if (!moveClipboard || pending) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await moveCourseSessions({
          id: moveClipboard.sessionId,
          scope: moveClipboard.scope,
          weeks: moveClipboard.weeks,
          date: value.date ?? selectedDate,
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
        publishMusicFinanceChange();
        refreshWorkspace();
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
        publishMusicFinanceChange();
        refreshWorkspace();
      } catch {
        setError("恢復失敗，課程保留在目前時段。");
      }
    });
  }
  function updateScheduleForm(e: FormEvent<HTMLFormElement>) {
    previewSchedule(e.currentTarget, e.target);
  }
  function previewSchedule(form: HTMLFormElement, target?: EventTarget | null, dates?: string[], weekly?: {weeks:string;weekdays:number[]}) {
    const fields = new FormData(form);
    if (dates) {
      fields.delete("additionalDates");
      dates.forEach(date => fields.append("additionalDates", date));
    }
    if (fields.get("repeatMode") === "weekly" && !fields.has("repeatWeeks")) fields.set("repeatWeeks", "1");
    if (weekly) {
      fields.set("repeatWeeks", weekly.weeks);
      fields.delete("weekday");
      weekly.weekdays.forEach(day => fields.append("weekday", String(day)));
    }
    const templateChanged = target instanceof HTMLSelectElement && target.name === "templateId";
    const nextTemplate = templates.find(item => item.id === fields.get("templateId"));
    if (templateChanged && nextTemplate) {
      // Template-dependent controls remount after this event; preview their new defaults.
      fields.set("duration", String(scheduleSeed.durationMinutes ?? nextTemplate.durationMinutes));
      fields.set("capacity", String(nextTemplate.capacity));
      fields.set("roomId", scheduleSeed.roomId ?? nextTemplate.defaultRoomId ?? rooms[0]?.id ?? "");
    }
    try {
      const occurrences = buildCourseOccurrences(courseScheduleFormFields(fields, {templateId: chosen, requestKey}));
      const first = occurrences[0];
      setScheduleValidationError("");
      setScheduleSummary(`共 ${occurrences.length} 堂 · ${formatTWDateTime(first.startsAt)}–${formatTWDateTime(first.endsAt).slice(11)}${occurrences.length > 1 ? ` · 至 ${toLocalDateStr(occurrences[occurrences.length - 1].startsAt)}` : ""}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "請完成日期與時段，確認排課範圍";
      setScheduleValidationError(message);
      setScheduleSummary(fields.get("repeatMode") === "weekly" ? message : "請完成日期與時段，確認排課範圍");
    }
    const limit = rooms.find(room => room.id === fields.get("roomId"))?.capacity;
    setRoomCapacityNotice(limit && Number(fields.get("capacity")) > limit ? `人數上限超過教室容納 ${limit} 人，請確認容量` : "");
  }
  const scheduleOpenIntent=useRef(false);
  useEffect(()=>{scheduleOpenIntent.current=panel==="schedule";},[panel]);
  function openSchedule(seed: {single?:boolean;date?:string;time?:string;roomId?:string;coachId?:string;durationMinutes?:number} = {}) {
    if(pending||(scheduleOpenIntent.current&&!scheduleCreated))return;
    scheduleOpenIntent.current=true;
    setCopySource(null);
    setArrangement(businessProfile === "MUSIC" ? "single" : "class");
    setScheduleSeed(seed);
    setScheduleDate(seed.date ?? selectedDate);
    setChosen(templates[0]?.id ?? "");
    setRequestKey(crypto.randomUUID());
    setRepeatMode("once");
    setScheduleCreated(null);
    setExtraDateKeys([]);
    setScheduleSummary("");
    setScheduleValidationError("");
    open("schedule");
  }
  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (
      data: FormData,
    ) => Promise<{ success: boolean; error?: string; conflicts?:ConflictItem[]; data?: unknown; syncWarning?: boolean }>,
    after?: (data: FormData) => void,
  ) {
    event.preventDefault();
    if (pending || submitLock.current) return;
    submitLock.current=true;
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
          result.syncWarning ? "已儲存；其他頁面更新失敗，請重新整理核對。" : typeof count === "number" ? `已建立 ${count} 堂課程` : "已儲存",
        );
        setDirty(false);
        form.reset();
        after?.(data);
        if (panel === "catalog" || (panel === "edit" && editing?.kind !== "session")) {
          restoreScrollY.current = window.scrollY;
        }
        if (panel === "catalog") setPanel(null);
        publishMusicFinanceChange();
        // Setting actions already revalidate this route. Keep the refresh for
        // operational actions, whose authoritative schedule may need reconciling.
        if (panel !== "catalog" && !(panel === "edit" && editing?.kind !== "session")) refreshWorkspace();
      } catch {
        setError(catalogSource?"連線中斷，請先重新整理核對是否已儲存，再決定是否重送。":"連線失敗，請重試；重複送出不會重複排課。");
      } finally {submitLock.current=false;}
    });
  }
  const template = templates.find((t) => t.id === chosen);
  const scheduleLegend = <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-earth-700" aria-label="課表課型圖例">{(businessProfile === "MUSIC" ? [["每週固定","bg-blue-600"],["隔週固定","bg-violet-600"],["單次課","bg-emerald-600"],["體驗","bg-orange-500"],["空間租借","bg-pink-500"]] : sportsNative?sportsScheduleKinds.map(item=>[item.label,item.dot]):[["團體課","bg-emerald-600"],["個別課","bg-blue-600"],["自組課","bg-yellow-600"],["體驗","bg-orange-500"],["空間租借","bg-pink-500"]]).map(([label,color]) => <span key={label} className="inline-flex items-center gap-1.5" title={label}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${color}`} /><span className={businessProfile === "MUSIC" ? styles.legendFull : undefined}>{label}</span>{businessProfile === "MUSIC" && <span aria-hidden="true" className={styles.legendShort}>{label.replace("固定", "").replace("課", "").replace("空間", "")}</span>}</span>)}{scheduleFiltered && <strong className="text-primary-800">僅顯示符合目前條件的課程</strong>}</div>;
  const repeatControl = (
    <label className="min-w-0 flex-1">
      重複
      <select
        className={`${field} min-h-11`}
        name="repeatMode"
        value={repeatMode}
        onChange={(e) => {setRepeatMode(e.target.value as "once" | "weekly" | "dates");setExtraDateKeys([]);}}
      >
        <option value="once">僅此一堂</option>
        <option value="weekly">每週重複</option>
        <option value="dates">指定多日</option>
      </select>
    </label>
  );
  const serviceWeekStart=courseWeekStart(selectedDate);
  const serviceHasResults=scheduleMode==='month'?monthSummary.records.length>0:filteredScheduleSessions.some(s=>{const d=toLocalDateStr(new Date(s.startsAt));return scheduleMode==='day'?d===selectedDate:d>=serviceWeekStart&&d<addTaiwanDuration(serviceWeekStart,1,'WEEK');});
  const serviceFilters=<>
    <div className="relative min-w-0 flex-1 basis-44 max-w-72"><input type="search" aria-label="課表搜尋" placeholder="搜尋顧客姓名／電話" className={`${button} min-h-11 w-full bg-white py-1 pr-11 [&::-webkit-search-cancel-button]:hidden`} value={scheduleQuery} onChange={event=>setScheduleQuery(event.target.value)}/>{scheduleQuery&&<button type="button" aria-label="清除顧客搜尋" className="absolute right-0 top-0 min-h-11 min-w-11 text-earth-600" onClick={()=>setScheduleQuery("")}>×</button>}</div>
    <label className="flex min-w-0 items-center gap-1 text-sm">所屬店長<select aria-label="課表所屬店長篩選" className={`${button} min-h-11 min-w-0 max-w-48 bg-white py-1`} value={assignedCoachFilter} onChange={e=>setAssignedCoachFilter(e.target.value)}><option value="all">全部所屬店長</option>{calendarSource?.assignmentStaff.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}<option value="none">未指定所屬店長</option></select></label>
  </>;
  return (
    <>
      {!panel && <CourseConflicts items={conflicts}/>}
      {sportsNative&&<span hidden data-operation-background-refresh/>}
      {sportsNative&&moveTarget&&moveClipboard&&<SportsMoveConfirm clipboard={moveClipboard} seed={moveTarget} rooms={allRooms.filter(r=>r.isActive)} coaches={allCoaches.filter(c=>c.status==="ACTIVE"&&c.courseCoachEnabled)} onClose={()=>setMoveTarget(null)} onReview={()=>{setCourseDialog({sessionId:moveClipboard.sessionId,kind:"roster"});setMoveTarget(null);}} onSaved={(date,patches)=>{const ensure=date.slice(0,7)!==(nativeCalendar?.month??loadedDate.slice(0,7));++calendarRequest.current;setNativeCalendar(previous=>({...previous??{month:loadedDate.slice(0,7),sessions:sourceSessions,cancelledBookings:sourceCancelledBookings,calendarDays:sourceCalendarDays,staffAvailabilityExceptions:sourceStaffAvailabilityExceptions},sessions:applySportsMovePatches(previous?.sessions??sourceSessions,patches??[])}));setNativeDate(date);nativeDateRef.current=date;setMoveTarget(null);setMoveClipboard(null);setNotice("已調課");void refreshNativeCalendar(date,ensure);}}/>}
      {sportsNative&&calendarReading&&<p role="status" className="text-sm text-earth-500">課表讀取中…</p>}
      {view === "schedule" && (
        <div className={`${styles.workspace} flex min-w-0 flex-col gap-1`}>
          {sportsNative&&nativeCalendarWarning&&<p role="status" className="text-sm text-amber-800">{nativeCalendarWarning}</p>}
          {!courseDialog&&monthlyReturnHref(params.toString())&&<DashboardLink className="inline-flex min-h-11 items-center px-3 text-primary-800" href={monthlyReturnHref(params.toString())!}>返回月結</DashboardLink>}
          {!courseDialog&&params.get("returnStudentId") && <nav aria-label="返回學員資料" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-earth-200 bg-primary-50 px-3 text-sm"><span>學員資料</span><DashboardLink className="inline-flex min-h-11 items-center px-3 font-medium text-primary-800" href={studentReturnHref(params.get("returnStudentId")!, params.get("returnStudentQuery") ?? "", "bookings")}>返回原學員 →</DashboardLink></nav>}
          <div className={businessProfile === "MUSIC" ? styles.musicHeader : "flex flex-wrap items-center justify-between gap-2"}>
            <div className={businessProfile === "MUSIC" ? "contents" : "flex min-w-0 flex-wrap items-center gap-2"}>
              <div className={businessProfile === "MUSIC" ? "sr-only" : "mr-1 shrink-0"}>
                <h1 className="admin-page-title">{calendarSource?"班表":businessProfile === "MUSIC" ? "課表" : "課表排程"}</h1>

              </div>
              <div
                className="inline-flex shrink-0 rounded-lg border border-earth-200 bg-white p-0.5"
                aria-label="課表視角"
              >
                {(["month", "week", "day"] as CourseScheduleMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={pending}
                    onClick={() => changeScheduleMode(mode)}
                    className={`${styles.touchControl} min-h-8 rounded-md px-2 text-sm ${
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
                  className={`${styles.touchControl} ${button} min-h-9 px-2.5`}
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
                  className={`${styles.touchControl} ${button} min-h-9 px-2`}
                  disabled={pending}
                  onClick={() => go(today)}
                >
                  今天
                </button>
                <button
                  className={`${styles.touchControl} ${button} min-h-9 px-2.5`}
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
              {businessProfile === "MUSIC" && scheduleMode !== "month" && <div role="group" aria-label="當日資訊" className="flex shrink-0 items-center gap-1">
                <button type="button" aria-label={`請假學員 ${leaveStudents.length}`} className={`${button} min-h-11 !px-2`} onClick={() => setDailyList("leave")}>請假 {leaveStudents.length}</button>
                <button type="button" aria-label={`待點名學員 ${absentStudents.length}`} className={`${button} min-h-11 !px-2`} onClick={() => setDailyList("unmarked")}>待點名 {absentStudents.length}</button>
              </div>}
            </div>
            {(cashbookShortcut || canCreate || canEdit) && (
              <div className={calendarSource?"flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-2":businessProfile === "MUSIC"?"ml-auto flex shrink-0 gap-1":"flex shrink-0 gap-2"}>
                {calendarSource&&<ServiceCalendarLegend/>}{cashbookShortcut}
                {sportsNative&&!calendarSource&&<button type="button" className={`${button} min-h-11`} disabled={pending||calendarReading} onClick={()=>setSportsAttendanceOpen(true)}>出席狀況</button>}

                {canCreate && (
                  <button
                    className={`${primary} min-h-9`}
                    disabled={pending}
                    onClick={()=>openSchedule()}
                  >
                    {calendarSource?"新增預約":"＋ 排課"}
                  </button>
                )}
              </div>
            )}
          </div>

            {businessProfile === "MUSIC" && scheduleMode === "month" && <div className="basis-full flex items-center gap-3"><div className={styles.scheduleSearch}><CourseCustomerPicker name="scheduleStudent" compact initial={scheduleStudentSelection} onChange={setScheduleStudentSelection}/></div>{scheduleLegend}</div>}
          {!calendarSource&&businessProfile !== "MUSIC" && <div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary-100 bg-primary-50/50 px-2 py-1">
            <label className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-medium text-earth-700 [&_select]:min-w-0 [&_select]:flex-1" htmlFor="course-coach-filter">{personnelText(courseDisplayText("授課教練", businessProfile))}
            <select
              id="course-coach-filter"
              aria-label={calendarSource?"技師篩選":personnelText(courseDisplayText("教練篩選", businessProfile))}
              className={`${button} min-h-11 bg-white py-1 ${coachFilter !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
            >
              <option value="all">{personnelText("全部授課教練")}</option>
              {allCoaches.map((coach) => (
                <option key={coach.id} value={coach.id}>
                  {coach.displayName}
                </option>
              ))}
            </select>
            </label><label className="flex min-w-0 items-center gap-2 text-sm font-medium text-earth-700 [&_select]:min-w-0 [&_select]:flex-1" htmlFor="course-room-filter">教室
            <select
              id="course-room-filter"
              aria-label={calendarSource?"位置篩選":"教室篩選"}
              className={`${button} min-h-11 bg-white py-1 ${roomFilter !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
              value={roomFilter}
              onChange={(e)=>{setSelectedIds([]);setRoomFilter(e.target.value);}}
            >
              <option value="all">全部空間</option>
              {allRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            </label>{sportsNative ? <label className="flex items-center gap-2 text-xs font-medium text-earth-700">排課類型<select aria-label="排課類型篩選" className={`${button} min-h-11 bg-white py-1`} value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option value="all">全部排課類型</option>{sportsScheduleKinds.map(item=><option key={item.kind} value={item.kind}>{item.label}</option>)}</select></label> : <label className="flex items-center gap-2 text-xs font-medium text-earth-700">班別<select aria-label="課表班別篩選" className={`${button} min-h-11 bg-white py-1 ${classFilter !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`} value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option value="all">全部班別</option><option value="GROUP">團體課</option><option value="PRIVATE">個別課</option><option value="SELF_ORGANIZED">自組課</option><option value="TRIAL">體驗</option><option value="RENTAL">空間租借</option><option value="unset">未設定</option></select></label>}{<label className="flex items-center gap-2 text-xs font-medium text-earth-700">所屬店長<select aria-label="課表所屬店長篩選" className={`${button} min-h-11 bg-white py-1 ${assignedCoachFilter !== "all" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`} value={assignedCoachFilter} onChange={event => setAssignedCoachFilter(event.target.value)}><option value="all">全部所屬店長</option>{allCoaches.filter(coach => sessions.some(session => session.bookings.some(booking => booking.assignedCoachId === coach.id))).map(coach => <option key={coach.id} value={coach.id}>{coach.displayName}</option>)}<option value="none">未指定所屬店長</option></select></label>}
            <input aria-label="課表搜尋" placeholder="搜尋課程或學員" className={`${button} min-h-11 min-w-0 w-full @min-[48rem]/course-schedule:w-44 bg-white py-1`} value={scheduleQuery} onChange={event => setScheduleQuery(event.target.value)} />
            {(coachFilter !== "all" || roomFilter !== "all" || category !== "all" || classFilter !== "all" || assignedCoachFilter !== "all" || !!scheduleQuery) && (
              <button
                type="button"
                className="min-h-11 rounded-lg px-2.5 text-xs text-earth-600 hover:bg-white"
                onClick={() => {
                  setAssignedCoachFilter("all");
                  setScheduleQuery("");
                  setCoachFilter("all");
                  setRoomFilter("all");
                  setCategory("all");setClassFilter("all");setRentalFilter("all");
                }}
              >
                清除篩選
              </button>
            )}
          </div>}
          {calendarSource&&(scheduleQuery.trim()||assignedCoachFilter!=="all")&&!serviceHasResults&&<p role="status" className="text-sm text-earth-600">查無符合顧客</p>}
          {calendarSource&&scheduleMode==="month"&&<div className="flex flex-wrap items-center gap-2">{serviceFilters}</div>}
            {(businessProfile === "MUSIC"||sportsNative) && moveClipboard && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                <strong>✂ {moveClipboard.label} · {moveClipboard.startsAt?formatTWDateTime(new Date(moveClipboard.startsAt)):""} · {moveClipboard.durationMinutes}分</strong>
                <span className="text-xs text-indigo-700">選白格貼上</span>
                <button className="ml-auto text-xs" type="button" onClick={()=>calendarSource?.move?calendarSource.move.onCancel():setMoveClipboard(null)}>取消</button>
              </div>
            )}
          {scheduleMode === "month" ? (
            <>
              {businessProfile === "MUSIC" ? (
              <p className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm font-medium text-earth-800" aria-label="本月課表總計">
                {scheduleFiltered ? "篩選結果" : "本月已排課程"} {monthTotals.classes} 堂{monthTotals.rentals > 0 && `・${monthTotals.rentals} 筆租借`}｜名單 {monthTotals.people} 人次｜有課 {monthSummary.activeDays} 天{monthSummary.changes > 0 && `｜異動 ${monthSummary.changes} 筆`}
              </p>
              ) : <CourseScheduleToolbar>
                <span className="font-medium text-earth-800" aria-label="本月課表總計">
                {calendarSource?<>{monthServices.groups} 筆預約・{monthServices.people} 人次{monthTotals.rentals>0&&`・${monthTotals.rentals} 筆租借`}</>:<>{scheduleFiltered ? "篩選結果" : "本月已排課程"} {monthTotals.classes} 堂{monthTotals.rentals > 0 && `・${monthTotals.rentals} 筆租借`}｜{assignedCoachFilter !== "all" ? "所屬" : "名單"} {monthTotals.people} 人次｜有課 {monthSummary.activeDays} 天{monthSummary.changes > 0 && `｜異動 ${monthSummary.changes} 筆`}</>}
                </span>
                {!calendarSource&&<div className="ml-auto [&>div]:flex-nowrap">{scheduleLegend}</div>}
              </CourseScheduleToolbar>}
              <ScheduleMonthGrid offset={parseLocalDate(first).getDay()} pending={pending}>
              {Array.from({ length: days }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, "0")}`,
                  list = byDate.get(date) ?? [],
                  total = scheduleTotals(list),
                  visibleCount = 2,
                  calendarDay = calendarDays[date],
                  isClosed =
                    calendarDay?.status === "closed" ||
                    calendarDay?.status === "training",
                  closureLabel =
                    calendarDay?.status === "training" ? "員工訓練" : "公休";
                return (
                  <div
                    key={date}
                    className={`${styles.monthDay} relative flex min-w-0 h-24 flex-col items-start justify-start border-t border-earth-100 px-1 py-1 text-left sm:px-3 sm:py-1 ${date === today ? "ring-2 ring-inset ring-primary-500" : ""} ${
                      isClosed
                        ? "bg-earth-100 text-earth-500"
                        : date === selectedDate
                            ? "bg-primary-50/60 text-primary-900"
                            : "bg-white text-earth-400"
                    }`}
                  >
                    <button type="button" disabled={pending} aria-label={sportsNative&&moveClipboard?`${date} 貼上課程`:`${date}，${calendarSource?`${serviceScheduleTotals(list).groups}筆預約，${serviceScheduleTotals(list).people}人次，${total.rentals}筆租借`:isClosed ? closureLabel : `${total.classes} 堂課，${total.rentals} 筆租借，${total.people} 人次`}`} className={`${sportsNative?"absolute inset-0":"absolute inset-x-0 top-0 h-11"} focus-visible:ring-2 focus-visible:ring-primary-500`} onClick={() => {go(date);if(sportsNative&&moveClipboard){pasteMove({date,time:moveClipboard.startsAt?formatTWDateTime(new Date(moveClipboard.startsAt)).slice(11,16):"09:00",roomId:moveClipboard.roomId,coachId:moveClipboard.coachId});return;}if(calendarSource){setScheduleMode("day");return;}open("day");}} />
                    <span className={`pointer-events-none shrink-0 text-sm font-medium leading-5 ${date===today?"text-primary-800":"text-earth-700"}`}>{i + 1}{date===today&&<span className="ml-1 hidden text-[10px] sm:inline">今天</span>}</span>
                    {isClosed && (
                      <span
                        className="pointer-events-none mt-1 max-w-full truncate rounded bg-earth-200 px-1.5 py-0.5 text-[10px] font-medium text-earth-700"
                        title={calendarDay?.reason || closureLabel}
                      >
                        {closureLabel}
                      </span>
                    )}
                    {calendarSource?(total.classes>0||total.rentals>0)&&<span className="pointer-events-none text-sm font-semibold text-primary-900">{serviceScheduleTotals(list).groups}筆預約・{serviceScheduleTotals(list).people}人次{total.rentals>0&&`・租借${total.rentals}`}</span>:businessProfile === "MUSIC" ? (total.classes > 0 || total.rentals > 0) && <span className="pointer-events-none max-w-full truncate text-xs font-semibold text-primary-900">{total.classes}堂{total.rentals > 0 && `・租借${total.rentals}`}｜{assignedCoachFilter !== "all" ? "所屬" : ""}{total.people}人次</span> : (total.classes > 0 || total.rentals > 0) && <span className="pointer-events-none block w-full whitespace-nowrap text-[11px] font-semibold leading-4 tabular-nums text-primary-900">{total.classes}堂・{total.people}人次{total.rentals > 0 && `・租借${total.rentals}`}</span>}
                    {!calendarSource&&list.slice(0,visibleCount).map(session => {
                      const type = allTemplates.find(template => template.id === session.templateId)?.classType;
                      const sportsColor=sportsNative?sportsCalendarPresentation(session):null;
                      const color = session.servicePalette?serviceCalendarPresentation(!!session.isTrial,session.previewKind === "RENTAL").dot: businessProfile === "MUSIC" ? musicScheduleColors(session).dot : courseClassPresentation(type, !!(session.isTrial || allTemplates.find(template=>template.id===session.templateId)?.musicTrialMode), session.previewKind === "RENTAL").dot;
                      const primary = type === "PRIVATE" ? scheduleRosterBookings(session.bookings).map(booking => booking.customerName).join("、") || session.nameSnapshot : session.nameSnapshot;
                      const label = `${session.previewFaded ? `【${session.previewFaded}】` : ""}${formatTWDateTime(new Date(session.startsAt)).slice(11)}${sportsNative?`–${formatTWDateTime(new Date(session.endsAt)).slice(11)}`:""} ${primary}${coachFilter === "all" ? ` · ${allCoaches.find(coach => coach.id === session.coachId)?.displayName ?? "未指定"}` : ""}`;
                      return <button type="button" disabled={pending} key={session.id} data-sports-schedule-kind={sportsColor?.kind} title={label} aria-label={sportsNative&&session.previewFaded?`排課 ${label}`:`開啟 ${label} 上課名單`} onClick={() => {go(date);if(sportsNative&&session.previewFaded){if(moveClipboard){pasteMove({date,time:formatTWDateTime(new Date(session.startsAt)).slice(11,16),roomId:session.roomId,coachId:session.coachId});return;}openSchedule({single:true,date,time:formatTWDateTime(new Date(session.startsAt)).slice(11,16),roomId:session.roomId,coachId:session.coachId});return;}setCourseDialog({sessionId:session.id,kind:"roster"});}} className={`${styles.monthAction} relative mt-0.5 flex w-full items-center gap-1 text-left text-xs leading-4 ${sportsColor?`rounded border px-1 ${sportsColor.card} ${session.previewFaded?"opacity-40":""}`:"text-earth-800 hover:text-primary-700"} focus-visible:ring-2 focus-visible:ring-primary-500`}>{!sportsNative&&<span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />}<span className="truncate">{label}</span></button>;
                    })}
                    {list.length > visibleCount && <button type="button" className={`${styles.monthAction} relative text-xs text-primary-800 hover:underline`} onClick={() => {go(date);open("day");}} aria-label={`查看 ${date} 全部 ${list.length} 筆`}>另 {list.length-visibleCount} 筆</button>}
                    {!list.length && scheduleFiltered && sessions.some(session => toLocalDateStr(new Date(session.startsAt)) === date) && <span className="pointer-events-none mt-1 text-xs text-earth-400">無符合課程</span>}
                  </div>
                );
              })}
              </ScheduleMonthGrid>

            </>
          ) : (
            <>

            {dailyList && <DailyAttendanceList kind={dailyList} date={selectedDate} nowIso={nowIso} rows={dailyList==="leave"?leaveStudents:absentStudents} canEdit={canEdit} onClose={()=>setDailyList(null)} onOpenCourse={sessionId=>{setDailyList(null);setCourseDialog({sessionId,kind:"roster"});}} onAttendanceOptimistic={(items,status)=>items.forEach(item=>showPendingAttendance(item.id,status))}/>}
            {Object.keys(pendingAttendance).length>0 && <p role="status" className="text-xs text-primary-700">點名結果同步中，課表色槓已先更新；完成後會以實際紀錄核對。</p>}
            <CourseScheduleBoard toolbarContent={calendarSource?serviceFilters:undefined} serviceMode={!!calendarSource} sportsNative={sportsNative}
              legend={!calendarSource ? scheduleLegend : undefined}
              hideDateHeading={businessProfile === "MUSIC"}
              searchControl={businessProfile === "MUSIC" ? <div className={styles.scheduleSearch}><CourseCustomerPicker name="scheduleStudent" compact initial={scheduleStudentSelection} onChange={setScheduleStudentSelection}/></div> : undefined}
              assignedFiltered={businessProfile !== "MUSIC" && assignedCoachFilter !== "all"}
              businessProfile={businessProfile}
              initialResourceView={params.get("resourceView") === "room" ? "room" : params.get("resourceView") === "coach" ? "coach" : undefined}
              initialWeekRoomId={params.get("resourceId") ?? undefined}
              onResourceChange={(view,resourceId)=>{ if(sportsNative)return;const next=new URLSearchParams(window.location.search);next.set("resourceView",view);if(resourceId) next.set("resourceId",resourceId);else next.delete("resourceId");window.history.replaceState(null,"",`${pathname}?${next}`); }}
              mode={scheduleMode}
              selectedDate={selectedDate}
              today={today}
              sessions={filteredScheduleSessions.map(withPendingAttendance)}
              leaveCounts={[...cancelledBookings,...pendingLeaveIds.filter(id=>!cancelledBookings.some(booking=>booking.id===id)).flatMap(id=>{
                const session=sessions.find(item=>item.bookings.some(booking=>booking.id===id));
                return session?[{id,sessionId:session.id,absenceKind:"STUDENT_LEAVE"}]:[];
              })].reduce<Record<string, number>>((counts, booking) => {
                if (["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "")) {
                  counts[booking.sessionId] = (counts[booking.sessionId] ?? 0) + 1;
                }
                return counts;
              }, {})}
              rooms={calendarSource || businessProfile === "MUSIC" || roomFilter === "all" ? allRooms : allRooms.filter(room => room.id === roomFilter)}
              coaches={allCoaches}
              templates={allTemplates}
              pending={pending}
              staffAvailability={staffAvailability}
              staffAvailabilityExceptions={staffAvailabilityExceptions}
              storePeriods={calendarDays[selectedDate]?.periods ?? []}
              canCreate={canCreate}
              calendarDays={calendarDays}
              occupiedSessions={sessions}
              onOpenEmpty={({date,time,roomId,coachId,durationMinutes,single})=>openSchedule({single,date,time,roomId,coachId:coachId ?? (!calendarSource&&businessProfile !== "MUSIC"&&coachFilter !== "all" ? coachFilter : undefined),durationMinutes})}
              moveClipboard={moveClipboard}
              onPasteMove={pasteMove}
              onSelectDate={go}
              onOpenSession={(sessionId, date) => {
                go(date);
                if(calendarSource){calendarSource.onOpen(sessionId);return;}
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
          aria-label={view === "rooms" ? (businessProfile==="MUSIC"?"教室清單":"空間清單") : catalogSource?"服務清單":"課程清單"}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-40 flex-1 sm:max-w-56">
              <span className="sr-only">搜尋名稱</span>
              <input
                className={field}
                placeholder={view === "rooms" ? "搜尋空間名稱" : catalogSource?"搜尋服務名稱":"搜尋課程名稱"}
                value={query}
                onChange={(e)=>{setSelectedIds([]);setQuery(e.target.value);}}
              />
            </label>
            {view === "rooms" || businessProfile === "MUSIC" || catalogSource ? (
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
            ) : <select aria-label="篩選班別" className={button} value={classFilter} onChange={e=>{setSelectedIds([]);setClassFilter(e.target.value);}}><option value="all">全部班別</option><option value="GROUP">團體課</option><option value="PRIVATE">個別課</option><option value="SELF_ORGANIZED">自組課</option><option value="unset">未設定</option></select>}
            {(!catalogSource||!!catalogSource.rentalModule) && view === "rooms" && <select aria-label="篩選開放租借" className={button} value={rentalFilter} onChange={e=>{setSelectedIds([]);setRentalFilter(e.target.value);}}><option value="all">租借：全部</option><option value="enabled">開放租借</option><option value="disabled">未開放租借</option></select>}
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
              {view === "catalog" && !catalogSource && <option value="HIDDEN">隱藏</option>}
            </select>
            {view === "catalog" && businessProfile === "MUSIC" && <select aria-label="篩選班型" className={button} value={classFilter} onChange={e=>{setSelectedIds([]);setClassFilter(e.target.value);}}><option value="all">全部班型</option><option value="PRIVATE">個別課</option><option value="SELF_ORGANIZED">自組課</option><option value="GROUP">團體課</option><option value="TRIAL">體驗課</option></select>}
            {view === "catalog" && !catalogSource && (
              <select
                aria-label="篩選預設空間"
                className={button}
                value={roomFilter}
                onChange={(e)=>{setSelectedIds([]);setRoomFilter(e.target.value);}}
              >
                <option value="all">{calendarSource?"全部位置":businessProfile === "MUSIC" ? "全部教室" : "全部空間"}</option>
                {allRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            {(query.trim() || status !== "all" || category !== "all" || classFilter !== "all" || rentalFilter !== "all" || roomFilter !== "all") && <button
              className={button}
              onClick={() => {
                setSelectedIds([]);setHideTestData(false);setQuery("");
                setStatus("all");
                setCategory("all");setClassFilter("all");setRentalFilter("all");
                setRoomFilter("all");

              }}
            >
              清除篩選
            </button>}
            {canCreate && (
              <button
                className={businessProfile === "MUSIC" ? `${primary} ml-auto order-first` : "min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-primary-700 px-3 py-2 text-sm text-white hover:bg-primary-800 disabled:opacity-50"}
                disabled={pending}
                onClick={() => open("catalog")}
              >
                ＋ {view === "rooms" ? "新增空間" : catalogSource?"新增服務項目":"新增課程"}
              </button>
            )}
          </div>

<div className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${businessProfile !== "MUSIC" ? "min-h-11" : ""}`}>
          {businessProfile==="MUSIC"&&<CourseTestDataFilter names={catalogItems.map(p=>p.name)} checked={hideTestData} onChange={v=>{setSelectedIds([]);setHideTestData(v);}}/>}
          {view==="rooms" && canEdit && <CourseBatchBar driver={catalogSource?.status} key={`${hideTestData}:${query}:${status}:${category}:${roomFilter}:${classFilter}:${rentalFilter}:${inactiveExpanded}`} canDelete={canDelete} names={Object.fromEntries(visibleItems.map(r=>[r.id,r.name]))} kind="room" blockedIds={busyIds} states={Object.fromEntries(visibleItems.map(item=>[item.id,item.isActive]))} onApplied={applyStatus} onPendingChange={setStatusBusy} ids={visibleItems.map(r=>r.id)} selected={selectedIds} onChange={setSelectedIds}/>}
          {view==="catalog" && canEdit && <CourseBatchBar driver={catalogSource?.status} key={`${hideTestData}:${query}:${status}:${category}:${roomFilter}:${classFilter}:${rentalFilter}:${inactiveExpanded}`} canDelete={canDelete} kind={catalogSource?"subject":"template"} deleteOnly={!catalogSource} onApplied={applyStatus} onPendingChange={setStatusBusy} states={Object.fromEntries(visibleItems.map(item=>[item.id,item.isActive]))} names={Object.fromEntries(visibleItems.map(r=>[r.id,r.name]))} ids={visibleItems.map(r=>r.id)} selected={selectedIds} onChange={setSelectedIds}/>}
          {businessProfile !== "MUSIC" && <p className="ml-auto whitespace-nowrap text-sm text-earth-500">共 {filteredItems.length} 筆／全部 {catalogItems.length} 筆</p>}
</div>
          {!catalogSource && view==="catalog" && canEdit && selectedIds.length>0 && <form className="flex flex-wrap items-center gap-2" onSubmit={e=>submit(e,async d=>batchCourseTemplates({ids:selectedIds,...(businessProfile === "MUSIC" && d.get("batchCategory")!==""?{category:d.get("batchCategory")}:{}),...(d.get("batchVisibility")?{visibility:d.get("batchVisibility")}: {})}),()=>setSelectedIds([]))}>
            <span>已選 {selectedIds.length} 筆</span>{businessProfile === "MUSIC" && <input name="batchCategory" className={button} placeholder="調整分類"/>}<select name="batchVisibility" className={button}><option value="">狀態不變</option><option value="PUBLIC">上架</option><option value="HIDDEN">隱藏</option><option value="OFF">下架</option></select><button className={button} disabled={pending}>套用至選取課程</button>
          </form>}
          {businessProfile === "MUSIC" && <p className="text-sm text-earth-500">
            共 {filteredItems.length} 筆／全部 {catalogItems.length} 筆
          </p>}
          <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-earth-200 bg-white">
            <table className={`${(!catalogSource||!!catalogSource.rentalModule) && businessProfile !== "MUSIC" && view === "rooms" ? "min-w-[860px]" : "min-w-[740px]"} w-full text-left text-sm`}>
              <thead className="bg-earth-50 text-earth-600">
                <tr>
                  {(view === "rooms"
                    ? ["空間名稱", "分類", ...((catalogSource&&!catalogSource.rentalModule) ? [] : [...(businessProfile==="MUSIC"||catalogSource?.rentalModule==="beauty"?[]:["容納人數"]), "開放租借", "每小時租金"]), ...(businessProfile === "MUSIC" || (catalogSource&&!catalogSource.rentalModule) ? ["狀態"] : []), "操作"]
                    : [
                        (catalogSource?"服務項目":"課程名稱"),
                        ...(businessProfile==="MUSIC"||catalogSource?["分類"]:["班別"]),
                        "時長",
                        ...(catalogSource?["整理時間"]:[businessProfile === "MUSIC" ? "學費與堂數" : "每堂扣抵","人數上限"]),
                        ...(businessProfile === "MUSIC" || catalogSource ? ["狀態"] : []),
                        "操作",
                      ]
                  ).map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className={`whitespace-nowrap px-3 py-2 font-medium ${businessProfile!=="MUSIC" ? ({"空間名稱":"w-[28%]","分類":"w-[20%]","課程名稱":"w-[30%]","班別":"w-[16%]","時長":"w-[14%]","每堂扣抵":"w-[20%]","人數上限":"w-[14%]","容納人數":"w-[12%]","開放租借":"w-[14%]","每小時租金":"w-[20%]"} as Record<string,string>)[label] ?? "" : ""} ${label==="操作"?(view==="rooms"?"sticky right-0 z-10 min-w-[128px] bg-earth-50 text-center":businessProfile!=="MUSIC"?"w-[72px] min-w-[72px] max-w-[72px] text-center":""):""}`}
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
                    {isInactiveItem(item)&&(index===0||!isInactiveItem(visibleItems[index-1]))&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={view==="rooms"?(businessProfile==="MUSIC"?6:catalogSource&&!catalogSource.rentalModule?4:catalogSource?.rentalModule==="beauty"?5:6):businessProfile==="MUSIC"?7:6} className="px-3 py-2"><button type="button" disabled={inactiveForced} className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600 disabled:cursor-default" onClick={()=>{setSelectedIds([]);setShowInactive(v=>!v);}}><span>{view==="rooms"?"停用空間":catalogSource?"下架服務":"下架課程"}（{inactiveFilteredItems.length}）</span><span>{inactiveForced?"篩選結果":inactiveExpanded?"收合":"展開"}</span></button></td></tr>}
                    <tr
                      data-new-room={item.id === newRoomId ? "true" : undefined}
                      {...order.rowProps(item.id)}
                      className={(
                        item.id === newRoomId ? "bg-primary-50" : item.isActive && (!template || template.visibility === "PUBLIC")
                          ? "hover:bg-primary-50/40"
                          : "bg-earth-50 text-earth-600"
                      )}
                    >
                      <td
                        className="max-w-60 px-3 py-2 text-left font-medium text-primary-900"
                      >
                        {canEdit&&(view==="rooms"||!!catalogSource?.order)&&order.handle(item.id,item.name)}{canEdit && <input aria-label={`選取 ${item.name}`} type="checkbox" className="mr-2" disabled={busyIds.includes(item.id)} checked={selectedIds.includes(item.id)} onChange={e=>setSelectedIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>}<button type="button" disabled={pending} className="min-h-11 text-left hover:underline disabled:opacity-50" onClick={()=>{setRoomRentalHistory(false);setCopyTemplate(false);setEditing(template?{kind:"template",value:template}:{kind:"room",value:item});open(businessProfile!=="MUSIC" && canEdit?"edit":"inspect");}}>{item.name}</button>{item.id === newRoomId && <span className="ml-2 text-sm font-normal text-primary-700">剛新增</span>}
                        {!item.isActive && <span className="ml-2 text-xs text-earth-500">停用</span>}{template?.visibility === "HIDDEN" && <span className="ml-2 text-xs text-earth-500">隱藏</span>}{template && businessProfile==="MUSIC" && (!item.name.includes(template.classType==="PRIVATE"?"個別":template.classType==="SELF_ORGANIZED"?"自組":"團體")) && <span className="ml-2 whitespace-nowrap font-normal text-xs text-earth-500">{template.musicTrialMode?"體驗":template.classType==="PRIVATE"?"個別課":template.classType==="SELF_ORGANIZED"?"自組課":template.classType==="GROUP"?"團體課":"課型待補"}</span>}

                      </td>
                      {template && !catalogSource && businessProfile!=="MUSIC" && <td className="whitespace-nowrap px-3 py-2">{template.classType==="PRIVATE"?"個別課":template.classType==="SELF_ORGANIZED"?"自組課":template.classType==="GROUP"?"團體課":"未設定"}</td>}
                      {(businessProfile==="MUSIC" || catalogSource || view==="rooms")&&<td className="whitespace-nowrap px-3 py-2">{item.category || (businessProfile==="MUSIC" ? "未分類" : "—")}</td>}
                      {template ? (
                        <>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {template.durationMinutes} 分
                          </td>
                          {catalogSource?<td className="whitespace-nowrap px-3 py-2 tabular-nums">{template.bufferMinutes??0} 分</td>:<>                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {businessProfile === "MUSIC" ? template.musicTrialMode ? `體驗 1 堂 · ${template.musicTrialMode === "FREE" ? "免費" : `NT$ ${template.musicPricePerLesson ?? "待設定"}`}` : `${template.musicTermLessons ?? "待設定"} 堂／期 · NT$ ${template.musicPricePerLesson ?? "待設定"}／堂` : `${template.pointCost} 點／1 堂`}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {template.capacity}
                          </td></>}
                        </>
                      ) : (!catalogSource||!!catalogSource.rentalModule) && (<>
                        {businessProfile!=="MUSIC"&&catalogSource?.rentalModule!=="beauty"&&<td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.capacity ?? "—"}</td>}
                        <td className="whitespace-nowrap px-3 py-2">{item.rentalEnabled ? "開放" : "未開放"}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{item.rentalHourlyRate == null ? "—" : item.rentalHourlyRate === 0 ? (item.rentalEnabled ? "免費" : "—") : `$${item.rentalHourlyRate.toLocaleString("zh-TW")}／時`}</td>
                      </>)}
                      {(businessProfile === "MUSIC" || (catalogSource&&(!catalogSource.rentalModule||!!template))) && (<td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`rounded-md px-2 py-1 text-xs ${item.isActive ? "bg-primary-50 text-primary-700" : "bg-earth-100 text-earth-500"}`}
                        >
                          {template ? ({PUBLIC:"上架",HIDDEN:"隱藏",OFF:"下架"}[template.visibility ?? "PUBLIC"]) : item.isActive ? "啟用":"停用"}
                        </span>
                      </td>)}
                      <td className={`whitespace-nowrap px-3 py-2 align-middle ${view==="rooms"?"sticky right-0 z-10 min-w-[128px] bg-white text-center":businessProfile!=="MUSIC"?"w-[72px] min-w-[72px] max-w-[72px] text-center":""}`}>
                        {sportsNative || businessProfile === "MUSIC" ? <>
                        <div className="flex items-center justify-center gap-1">
                          {view==="rooms"&&canEdit&&<button type="button" className={`${button} min-h-11`} aria-label={`編輯${item.name}`} disabled={pending} onClick={()=>{setRoomRentalHistory(false);setCopyTemplate(false);setEditing({kind:"room",value:item});open("edit");}}>編輯</button>}
                          <ExclusiveMenu quiet triggerText="⋯" label={`${item.name}操作`}>
                          {view!=="rooms"&&canEdit && <button type="button" className="min-h-11 w-full px-3 text-left text-sm" disabled={pending} onClick={()=>{setRoomRentalHistory(false);setCopyTemplate(false);setEditing(template?{kind:"template",value:template}:{kind:"room",value:item});open("edit");}}>編輯</button>}
                          {canEdit && (template ? <>{[...(catalogSource?["PUBLIC","OFF"]:["PUBLIC","HIDDEN","OFF"])].filter(v=>v!==(template.visibility??"PUBLIC")).map(v=><button type="button" key={v} className="min-h-11 w-full px-3 text-left text-sm" disabled={pending} onClick={()=>changeStatus(item,v)}>{v==="PUBLIC"?"上架":v==="HIDDEN"?"隱藏":"下架"}</button>)}{canCreate&&<button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>{setCopyTemplate(true);setEditing({kind:"template",value:{...template,name:courseDisplayName(template.name)+"（複製）"}});open("edit");}}>複製</button>}</> : <><CourseStatusButton driver={catalogSource?.status} quiet kind="room" id={item.id} disabled={busyIds.includes(item.id)} active={item.isActive} onApplied={applyStatus} onPendingChange={setStatusBusy}/>{!catalogSource&&<button type="button" className="min-h-11 w-full px-3 text-left text-sm" onClick={()=>router.push(`${pathname}?date=${selectedDate}&room=${encodeURIComponent(item.id)}`)}>課表</button>}</>)}
                        </ExclusiveMenu></div>
</> : <>
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

                                <select className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" aria-label={`${item.name} 狀態`} value={template.visibility ?? "PUBLIC"} disabled={pending} onChange={e=>changeStatus(item,e.target.value)}><option value="PUBLIC">上架</option><option value="HIDDEN">隱藏</option><option value="OFF">下架</option></select>
                                {canCreate && <button className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" onClick={()=>{setCopyTemplate(true);setEditing({kind:"template",value:{...template,name:courseDisplayName(template.name)+"（複製）"}});open("edit");}}>複製</button>}
                              </> : <><CourseStatusButton driver={catalogSource?.status} kind="room" id={item.id} disabled={busyIds.includes(item.id)} active={item.isActive} onApplied={applyStatus} onPendingChange={setStatusBusy}/><button className="min-h-9 rounded-lg border border-earth-200 px-2 text-sm" onClick={()=>router.push(`${pathname}?date=${selectedDate}&room=${encodeURIComponent(item.id)}`)}>課表</button></>}
                            </>
                          )}
                        </div>
</>}                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
                {!inactiveExpanded&&inactiveFilteredItems.length>0&&<tr className="border-y border-earth-200 bg-earth-100"><td colSpan={view==="rooms"?(businessProfile==="MUSIC"?6:catalogSource&&!catalogSource.rentalModule?4:catalogSource?.rentalModule==="beauty"?5:6):businessProfile==="MUSIC"?7:6} className="px-3 py-2"><button type="button" className="flex min-h-9 w-full items-center justify-between text-left font-medium text-earth-600" onClick={()=>{setSelectedIds([]);setShowInactive(true);}}><span>{view==="rooms"?"停用空間":catalogSource?"下架服務":"下架課程"}（{inactiveFilteredItems.length}）</span><span>展開</span></button></td></tr>}
              </tbody>
            </table>
            {!filteredItems.length && (
              <p className="p-8 text-center text-earth-500">
                沒有符合條件的資料，請調整篩選或新增資料。
              </p>
            )}
          </div>
          {notice && (
            <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-primary-700"><span>{notice}</span>{view === "rooms" && newRoomId && <button type="button" className="min-h-11 px-3 font-medium" onClick={() => { const row = document.querySelector<HTMLElement>('[data-new-room="true"]'); row?.scrollIntoView({block:"nearest", behavior:"smooth"}); row?.querySelector<HTMLButtonElement>("button:not([aria-label])")?.focus({preventScroll:true}); }}>查看新空間</button>}{businessProfile!=="MUSIC"&&canCreate&&<button type="button" className="min-h-11 px-3 font-medium" onClick={()=>router.push(`${pathname}${view==="catalog"?"?view=plans&action=create":"?action=schedule"}`)}>{view==="catalog"?"下一步：建立方案":"去排課"} →</button>}</div>
          )}
          {error && !panel && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </section>
      )}
      {panel === "schedule" && sportsNative && <SportsScheduleDialog fitContent={!!calendarSource} title={calendarSource?"新增預約":copySource?"複製排課":"新增排課"} busy={pending||sportsScheduleBusy} onClose={closePanel} onDraft={()=>setDirty(true)}>
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice&&<p role="status" className="text-sm text-primary-700">{notice}</p>}
        {sportsData?<SportsScheduleFields source={calendarSource?.schedule} waitlistEnabled={waitlistEnabled} waitlistDefaultLimit={waitlistDefaultLimit} waitlistDefaultStopMinutes={waitlistDefaultStopMinutes} seed={{...scheduleSeed,roomId:scheduleSeed.roomId??allRooms.find(room=>room.isActive)?.id}} initial={{...sportsData,customers:[...new Map([...sportsData.customers,...Object.values(sportsCreatedCustomers)].map(c=>[c.id,c])).values()]}} onCustomerAdded={customer=>setSportsCreatedCustomers(old=>({...old,[customer.id]:customer}))} date={scheduleSeed.date??selectedDate} requestKey={requestKey} onGuard={updateMusicScheduleGuard} onCreated={date=>{setDirty(false);setPanel(null);setNativeDate(date);calendarSource?.onDateChange?.(date);void refreshNativeCalendar(date,true);}}/>:<p role="alert">無法讀取排課資料，請確認排課、學員、方案及計酬權限。</p>}
      </SportsScheduleDialog>}
      {panel && !(panel === "schedule" && sportsNative) && (
        <RightSheet className={businessProfile === "MUSIC" ? undefined : "fitness-management-editor"} presentation="centered"
          compact={businessProfile === "MUSIC" && view !== "rooms"}
          fitContent={compactSessionEdit||!!catalogSource&&!catalogSource.rentalModule}
          fixedHeight={view === "rooms"&&(!catalogSource||!!catalogSource.rentalModule)||businessProfile === "MUSIC"&&panel === "schedule"}
          maxHeight={businessProfile === "MUSIC"&&panel === "schedule"?720:panel === "schedule" && scheduleCreated ? 400 : businessProfile !== "MUSIC" ? 680 : 900}
          open
          onClose={closePanel}
          width={view === "rooms" ? 920 : panel === "day" ? 720 : businessProfile !== "MUSIC" ? 920 : panel === "schedule" ? 820 : 520}
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
                  ? "text-base font-semibold text-primary-900"
                  : "text-base font-semibold text-primary-900"
              }
            >
              {panel === "edit"
                ? editing?.kind === "session"
                  ? "編輯單堂排課"
                  : editing?.kind === "room"
                    ? (businessProfile==="MUSIC"?"編輯教室":roomRentalHistory?"租借紀錄":"編輯空間")
                    : copyTemplate ? (catalogSource?"複製服務項目":"複製課程") : catalogSource?"編輯服務項目":"編輯課程"
                : panel === "inspect" ? (editing?.kind === "room" ? (businessProfile === "MUSIC" ? "查看教室" : "查看空間") : catalogSource?"查看服務項目":"查看課程") : panel === "catalog"
                  ? view === "rooms"
                    ? "新增空間"
                    : catalogSource?"新增服務項目":"新增課程"
                  : panel === "schedule"
                    ? scheduleCreated ? "排課成功" : copySource
                      ? "複製排課"
                      : arrangement==="rental"?"新增租借":arrangement==="trial"?"新增體驗課":"新增排課"
                    : selectedDate}
              {panel === "schedule" && arrangement !== "rental" && arrangement !== "trial" ? <CourseSetupStepBadge step="schedule" /> : panel === "catalog" || panel === "edit" || panel === "inspect" ? <CourseSetupStepBadge step={view === "rooms" || editing?.kind === "room" ? "room" : "course"} /> : null}
            </h2>
            <div className="flex items-center gap-2">{(!catalogSource||!!catalogSource.rentalModule) && panel === "edit" && editing?.kind === "room" && (!catalogSource?.rentalModule||rentalPermissions.customerRead) && <button type="button" className="min-h-11 px-3 text-sm text-primary-700 hover:underline" onClick={()=>{if(pending || roomSave.uncertain || rentalGuard.current.pending)return;setDirty(false);setRoomRentalHistory(v=>!v);}}>{roomRentalHistory?"← 空間設定":"租借紀錄 →"}</button> }
            {
              <button
                className={button}
                disabled={pending || templateSave.uncertain || roomSave.uncertain || (sportsNative&&panel==="schedule"&&sportsScheduleBusy)}
                onClick={closePanel}
              >
                關閉
              </button>
            }
            </div>
          </div>
          <div
            onChangeCapture={(event) => { if ((event.target as HTMLElement).closest("form") && !(panel === "schedule" && arrangement === "rental") && !roomRentalHistory) setDirty(true); }}
            className={`${compactSessionEdit ? styles.sessionEditBody : ""} ${
              panel === "schedule" && (arrangement === "rental" || businessProfile === "MUSIC") || roomRentalHistory
                ? "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3"
                : view === "schedule"
                ? "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 [&_label]:min-w-0 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:appearance-none"
                : "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [&_label]:space-y-1 [&_label]:text-sm [&_label]:font-medium [&_label]:text-earth-700 [&_input:not([type=checkbox]):not([type=radio])]:min-h-11 [&_input]:rounded-xl [&_input]:px-3 [&_input]:font-normal [&_input]:outline-none [&_input:focus]:border-primary-500 [&_input:focus]:ring-2 [&_input:focus]:ring-primary-100 [&_select]:min-h-11 [&_select]:rounded-xl [&_select]:px-3 [&_select]:font-normal [&_form]:gap-3"
            }`}
          >
            {((view === "rooms" && panel === "catalog" ? roomCreate.error : "") || error) && (
              <p role="alert" className="text-sm text-red-700">
                {view === "rooms" && panel === "catalog" ? roomCreate.error || error : error}
              </p>
            )}
            {notice && !scheduleCreated && (
              <p role="status" className="text-sm text-primary-700">
                {notice}
              </p>
            )}
            {panel === "day" &&
              (() => {
                const daySessions = byDate.get(selectedDate) ?? [];
                const dayTotals = scheduleTotals(daySessions);
                const booked = dayTotals.people;
                const pendingCount = daySessions.filter(item => !item.previewFaded && item.previewKind !== "RENTAL").reduce((count, source) => {
                  const session = withPendingAttendance(source);
                  const attendance = courseAttendanceState(session.displayBookings ?? session.bookings, 0, session.teacherAttendance);
                  return count + (attendance.teacherAbsent ? 0 : attendance.total - attendance.processed);
                }, 0);
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
                          refreshWorkspace();
                          setLastUpdated(new Date());
                        }}
                      >
                        立即更新
                      </button>
                    </div>
                    <div aria-label="當日課程統計" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-earth-600">
                      <span><strong className="text-primary-800">{dayTotals.classes}</strong> 堂</span>
                      {dayTotals.rentals > 0 && <span>租借 <strong className="text-primary-800">{dayTotals.rentals}</strong></span>}
                      <span>{assignedCoachFilter !== "all" && businessProfile !== "MUSIC" ? "所屬" : "名單"} <strong className="text-primary-800">{booked}</strong></span>
                      {pendingCount > 0 && <span>待點名 <strong className="text-amber-700">{pendingCount}</strong></span>}
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
                    {daySessions.map((sourceSession) => {
                      const session = withPendingAttendance(sourceSession);
                      const rental = session.previewKind === "RENTAL";
                      const attendance = courseAttendanceState(session.displayBookings ?? session.bookings, 0, session.teacherAttendance);
                      const template = allTemplates.find(item => item.id === session.templateId);
                      const presentation = courseClassPresentation(template?.classType, Boolean(session.isTrial || template?.musicTrialMode), rental);
                      const sessionState = courseSessionStatus(session, nowIso);
                      return (
                        <article
                          key={session.id}
                          className="rounded-xl border border-earth-200 bg-white px-3 py-2"
                        >
                          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-primary-900">
                            <span className="whitespace-nowrap tabular-nums">
                              {formatTWDateTime(new Date(session.startsAt)).slice(11)}–
                              {formatTWDateTime(new Date(session.endsAt)).slice(0, 10) !== selectedDate ? "翌日 " : ""}
                              {formatTWDateTime(new Date(session.endsAt)).slice(11)}
                            </span>
                            <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${presentation.dot}`} />{session.nameSnapshot}</span>
                            {!rental && (attendance.total > 0 || attendance.teacherAbsent) && <span title="點名完成度" className={`text-sm tabular-nums ${attendance.complete ? "text-emerald-700" : attendance.processed > 0 ? "text-amber-700" : "text-earth-500"}`}>{attendance.teacherAbsent ? "免點名" : `${attendance.complete ? "✓ " : ""}${attendance.processed}/${attendance.total}`}</span>}
                          </h3>
                          <p className="mt-1 truncate text-sm text-earth-600">
                            {!rental && <>{allCoaches.find((coach) => coach.id === session.coachId)?.displayName ?? personnelText(courseDisplayText("未指定教練", businessProfile))}{" · "}</>}
                            {allRooms.find((room) => room.id === session.roomId)?.name ??
                              "未指定教室"}
                            {["upcoming", "ongoing", "ended"].includes(sessionState.kind) && <span>{" · "}{sessionState.label}</span>}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className={`${button} border-primary-300 bg-primary-50 text-primary-800`}
                              onClick={() => { setPanel(null); setCourseDialog({
                                  sessionId: session.id,
                                  kind: "roster",
                                }); }}
                            >
                              {rental ? "租借資訊" : session.displayBookings ? `所屬 ${session.displayBookings.length}｜全班 ${scheduleRosterBookings(session.bookings).length}` : `上課名單 ${scheduleRosterBookings(session.bookings).length}`}
                            </button>
                            {canCreate && !rental && <ExclusiveMenu label="新增預約" triggerText="＋預約" quiet>
                              <div className="grid gap-1">
                                <button type="button" className="min-h-11 rounded px-3 text-left text-sm text-primary-700 hover:bg-primary-50" onClick={()=>{setPanel(null);setCourseDialog({sessionId:session.id,kind:"member-booking"});}}>學員預約</button>
                                <button type="button" className="min-h-11 rounded px-3 text-left text-sm text-primary-700 hover:bg-primary-50" onClick={()=>{setPanel(null);setCourseDialog({sessionId:session.id,kind:"trial-booking"});}}>體驗預約</button>
                              </div>
                            </ExclusiveMenu>}
                            {(canCreate || canEdit) && (
                              <ExclusiveMenu label="更多" triggerText="⋯" quiet className="ml-auto">
                                                                <div className="grid gap-1">
                                  {canCreate && (
                                    <button
                                      type="button"
                                      className={button}
                                      disabled={pending}
                                      onClick={() => {
                                        setCopySource(session);setScheduleDate("");setArrangement(session.isTrial?"trial":"class");
                                        setChosen(session.templateId);
                                        setRepeatMode("once");
                                        setScheduleCreated(null);
                                        setScheduleSummary("");
                                        setScheduleValidationError("");
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
                        onInvalidCapture={businessProfile === "MUSIC" ? undefined : e=>{const target=e.target as HTMLElement;const section=target.closest("details");if(section)section.open=true;target.scrollIntoView?.({block:"nearest"});}}
                        onSubmit={e => {if(catalogSource){submit(e,data=>saveExternalCatalog("room",Object.fromEntries(data)));return;}e.preventDefault(); if (!pending) void roomCreate.save(new FormData(e.currentTarget)); }}
                        className={businessProfile === "MUSIC" ? "grid gap-2 sm:grid-cols-2" : "grid gap-2 sm:grid-cols-[2fr_1fr_1fr]"}
                      >
                        <fieldset disabled={roomCreate.pending || roomCreate.uncertain} className="contents">
                        <CourseCatalogNameField label="空間名稱" requiredMarker={businessProfile!=="MUSIC"}/>
                        {businessProfile==="MUSIC"&&(<label className="col-span-full">
                          分類
                          <input
                            className={field}
                            name="category"
                            maxLength={40}
                            list="course-category-options"
                            placeholder="輸入或選擇分類"
                          />
                        </label>)}
                        <RoomMore hideCapacity={catalogSource?.rentalModule === "beauty"} service={!!catalogSource&&!catalogSource.rentalModule} music={businessProfile === "MUSIC"} />
                      </fieldset>
                      </form>
                    )}
                    {view !== "rooms" && (
                      <form
                        id="course-template-create-form"
                        onInvalidCapture={e=>{const target=e.target as HTMLElement;const section=target.closest("details");if(section)section.open=true;target.scrollIntoView?.({block:"nearest"});}}
                        className={`grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 ${businessProfile!=="MUSIC"?"sm:grid-cols-6":""}`}
                        onSubmit={(e) =>
                          submit(e, (data) =>
                            saveTemplate({
                              ...(catalogSource?{bufferMinutes:Number(data.get("buffer")||0)}:{}),
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
                        <fieldset disabled={pending || templateSave.uncertain} className="contents">
                        {catalogSource?<ServiceCatalogFields/>:<>                        <CourseCatalogNameField label="課程名稱" requiredMarker={businessProfile!=="MUSIC"} className={businessProfile!=="MUSIC"?"sm:col-span-4":"col-span-full"}/>

                        {businessProfile === "MUSIC" ? <><ClassType required/><MusicCourseFields/></> : <FitnessClassField/>}
                        {businessProfile === "MUSIC" && <label className="col-span-full">分類<input className={field} name="category" list="course-category-options" /></label>}
                        <CourseCatalogDurationField music={businessProfile==='MUSIC'} duration={60} className={businessProfile!=="MUSIC"?"sm:col-span-2":""}/>

                        <label className={businessProfile!=="MUSIC"?"sm:col-span-2":""}>
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
                        {businessProfile !== "MUSIC" && <label className="sm:col-span-2">
                          每堂扣點
                          <input
                            className={field}
                            name="cost"
                            type="number"
                            defaultValue={2}
                            min={1}
                            max={10000}
                            required
                          />

                        </label>}
                        {businessProfile==="MUSIC" && (<label>
                          預設空間
                          <select className={field} name="roomId">
                            <option value="">不指定</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>)}
                        {waitlistEnabled && (
                          <WaitlistFields
                            key={`create:${waitlistDefaultLimit}:${waitlistDefaultStopMinutes}`}
                            defaultEnabled={false}
                            defaultLimit={waitlistDefaultLimit}
                            defaultStopMinutes={waitlistDefaultStopMinutes}
                          />
                        )}
                        <DebitRule music={businessProfile === "MUSIC"}/><TemplateMore fitness={businessProfile !== "MUSIC"} roomField={businessProfile!=="MUSIC"?<label>
                          預設空間
                          <select className={field} name="roomId">
                            <option value="">不指定</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </label>:undefined} />
  </>}
                      </fieldset>
                      </form>
                    )}
                  </>
                )}
              </>
            )}
            {panel === "inspect" && editing && editing.kind !== "session" && <section className="space-y-3">
              <dl className="divide-y divide-earth-100">{[
                ["名稱",editing.kind === "template" ? courseDisplayName(editing.value.name) : editing.value.name],...(businessProfile === "MUSIC" || catalogSource || editing.kind === "room" ? [["分類",editing.value.category || (businessProfile === "MUSIC" ? "未分類" : "—")]] : []),
                ["狀態",editing.kind === "room" ? (editing.value.isActive ? "啟用":"停用") : ({PUBLIC:"上架",HIDDEN:"隱藏",OFF:"下架"}[editing.value.visibility ?? "PUBLIC"])],
                ...(catalogSource?(editing.kind==="template"?[["服務時長",`${editing.value.durationMinutes} 分鐘`],["整理時間",`${editing.value.bufferMinutes??0} 分鐘`]]:[]):editing.kind === "template" ? [[businessProfile === "MUSIC" ? "課型":"班別",editing.value.classType === "PRIVATE" ? "個別課" : editing.value.classType === "SELF_ORGANIZED" ? "自組課" : editing.value.classType === "GROUP" ? "團體課":businessProfile === "MUSIC" ? "待補設定" : "未設定"],["排課預設",`${editing.value.durationMinutes} 分鐘 · 上限 ${editing.value.capacity} 人`],["方案扣抵",businessProfile === "MUSIC" ? `每位學員 1 堂；${editing.value.musicTermLessons ?? "待設定"} 堂／期；每堂 NT$ ${editing.value.musicPricePerLesson ?? "待設定"}` : `點數卡每人 ${editing.value.pointCost} 點；堂數卡每人 1 堂`],["候補", editing.value.waitlistEnabled ? `開啟・${editing.value.waitlistLimit ?? waitlistDefaultLimit} 人・${waitlistStopLabel(editing.value.waitlistStopMinutes ?? waitlistDefaultStopMinutes)}` : "關閉"],["預設空間",allRooms.find(r=>r.id===editing.value.defaultRoomId)?.name ?? "不指定"]] : businessProfile === "MUSIC" ? [] : [["容納人數",editing.value.capacity ?? "未設定"]]),
              ].map(([label,value])=><div key={String(label)} className="grid grid-cols-[7rem_1fr] gap-3 py-3"><dt className="text-earth-500">{label}</dt><dd>{value}</dd></div>)}</dl>
              {!catalogSource && editing.kind === "template" && <DebitRule music={businessProfile === "MUSIC"}/>}
              <details hidden={!!catalogSource&&editing.kind==='template'} name="course-workspace-details"><summary className="min-h-11 cursor-pointer py-3">{editing.kind === "template" ? "課程介紹與注意事項":"設備、位置與備註"}</summary>{(editing.kind === "template" ? [editing.value.description,editing.value.precautions]:[editing.value.equipment,editing.value.location,editing.value.details]).map((value,i)=><p key={i} className="whitespace-pre-wrap py-2">{value || "未填"}</p>)}</details>
            </section>}
            {panel === "edit" && editing?.kind === "room" && roomRentalHistory && <RentalHistory module={catalogSource?.rentalModule} customers={rentalCustomers} roomId={editing.value.id} rooms={allRooms} permissions={{...rentalPermissions,edit:canEdit&&(!catalogSource?.rentalModule||rentalPermissions.edit)}} onGuard={updateRentalGuard}/>}

            {panel === "edit" && editing && canEdit && !roomRentalHistory && (
              <form
                id="course-edit-form"
                        onInvalidCapture={e=>{const target=e.target as HTMLElement;const section=target.closest("details");if(section)section.open=true;target.scrollIntoView?.({block:"nearest"});}}
                key={`${editing.kind}-${editing.value.id}`}
                className={`grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 ${businessProfile!=="MUSIC"?(editing.kind==="template"?"sm:grid-cols-6":editing.kind==="room"?"sm:grid-cols-[2fr_1fr_1fr]":""):""} ${compactSessionEdit ? styles.sessionEditForm : ""}`}
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
                        return saveRoom({
                          ...common,
                          expectedRevision:courseRoomRevision(editing.value),
                          ...(catalogSource?{catalogSnapshot:editing.value.catalogSnapshot}:{}),
                          capacity: data.has("roomCapacity") ? (data.get("roomCapacity") ? Number(data.get("roomCapacity")) : null) : editing.value.capacity ?? null,
                          details: data.get("details") || "",
                              equipment:data.get("equipment") || "",location:data.get("location") || "",
                              rentalEnabled:data.get("rentalEnabled")==="yes",rentalHourlyRate:Number(data.get("rentalHourlyRate")||0),rentalBufferMinutes:Number(data.get("rentalBufferMinutes")||0),
                        }, editing.value);
                      const details = {
                        durationMinutes: Number(data.get("duration")),
                        capacity: Number(data.get("capacity")),
                        pointCost: businessProfile === "MUSIC" ? 1 : Number(data.get("cost")),
                      };
                      if (editing.kind === "template")
                        return saveTemplate({
                          ...common,
                          id:copyTemplate?undefined:editing.value.id,
                          ...(catalogSource?{bufferMinutes:Number(data.get("buffer")||0),catalogRevision:copyTemplate?undefined:editing.value.catalogRevision,catalogSnapshot:copyTemplate?undefined:editing.value.catalogSnapshot}:{}),
                          expectedRevision:copyTemplate?undefined:courseTemplateRevision(editing.value),
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
                <fieldset disabled={pending || templateSave.uncertain || roomSave.uncertain} className="contents">
                {catalogSource&&editing.kind==="template"?<ServiceCatalogFields value={editing.value}/>:<>
                <p className="col-span-full text-sm text-earth-600">
                  {editing.kind === "session"
                    ? "修改範圍可選這堂或同一批次的這堂及後續，撞期時整批不會儲存。"
                    : editing.kind === "template"
                      ? "僅套用新排課；已排課請從課表修改。"
                      : catalogSource ? "名稱會同步顯示於使用此位置的服務與租借。" : businessProfile === "MUSIC" ? "名稱會同步顯示於使用此教室的課程。" : "名稱會同步顯示於使用此空間的課程。"}
                </p>
                {editing.kind === "session" && editing.value.bookings.length > 0 && <div role="note" className="col-span-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  本堂已有 {editing.value.bookings.length}{personnelText(courseDisplayText("人次預約。修改日期、時間、教室或教練會影響這些學員；預約會保留，不會自動取消或退款。請先確認調整並通知受影響學員（本次儲存不自動發送通知）。", businessProfile))}<p className="mt-1">已有預約不可更換課程或{businessProfile === "MUSIC" ? "堂數" : "點數"}；已完成出席不可修改。選「這堂及後續」還會影響同批後續課次，儲存時逐堂檢查，有衝突整批不儲存。</p>
                </div>}
                {editing.kind==="session" && <label className="col-span-full">{sportsNative ? "教學項目" : "課程項目"}<select className={field} name="templateId" value={editTemplateId || editing.value.templateId} onChange={e=>setEditTemplateId(e.target.value)}>{allTemplates.filter(t=>(t.currentTeaching!==false&&t.isActive) || t.id===editing.value.templateId).map(t=><option key={t.id} value={t.id}>{courseTemplateLabel(t)}{t.visibility==="OFF"?"（下架：保留原課）":""}</option>)}</select></label>}
                {compactSessionEdit && editing.kind === "session" ? <SportsSessionNameField
                  defaultName={editing.value.nameSnapshot}
                  originalTemplateName={courseTemplateLabel(allTemplates.find(t => t.id === editing.value.templateId) ?? {name: editing.value.nameSnapshot})}
                  templateName={courseTemplateLabel(allTemplates.find(t => t.id === (editTemplateId || editing.value.templateId)) ?? {name: editing.value.nameSnapshot})}
                /> : <label className={businessProfile!=="MUSIC"?(editing.kind==="template"?"sm:col-span-4":editing.kind==="room"?"":"col-span-full"):"col-span-full"}>
                  {editing.kind === "room" ? "空間名稱" : "課程名稱"}{businessProfile!=="MUSIC"&&" *"}
                  <input
                    className={field}
                    name="name"
                    required
                    maxLength={catalogSource?100:80}
                    defaultValue={
                      editing.kind === "session"
                        ? editing.value.nameSnapshot
                        : editing.kind === "template" ? courseDisplayName(editing.value.name) : editing.value.name
                    }
                  />
                </label>}
                {editing.kind === "template" && (businessProfile === "MUSIC" ? <ClassType value={editing.value.classType} required={copyTemplate}/> : <FitnessClassField classType={editing.value.classType} trialMode={editing.value.musicTrialMode} locked={!copyTemplate && editing.value.hasSessions}/>)}
                {editing.kind === "template" && businessProfile === "MUSIC" && <MusicCourseFields value={editing.value}/>}
                {editing.kind !== "session" && businessProfile === "MUSIC" && (
                  <label className={editing.kind==="room"?"":"col-span-full"}>
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
                  <RoomMore hideCapacity={catalogSource?.rentalModule === "beauty"} service={!!catalogSource&&!catalogSource.rentalModule} music={businessProfile === "MUSIC"}
                    capacity={editing.value.capacity}
                    equipment={editing.value.equipment} location={editing.value.location}
                    details={editing.value.details}
                    rentalEnabled={editing.value.rentalEnabled} rentalHourlyRate={editing.value.rentalHourlyRate} rentalBufferMinutes={editing.value.rentalBufferMinutes} category={editing.value.category}
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
                    <label className="col-span-full">{personnelText(courseDisplayText("教練", businessProfile))}<select
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
                              {c.displayName}{personnelText(courseDisplayText("（已停用，請另選教練）", businessProfile))}</option>
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
                    <label className={editing.kind==="template" && businessProfile!=="MUSIC"?"sm:col-span-2":""}>
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
                          {[30, MUSIC_DEFAULT_DURATION_MINUTES, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分鐘</option>)}
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
                    <label className={editing.kind==="template" && businessProfile!=="MUSIC"?"sm:col-span-2":""}>
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
                    {businessProfile !== "MUSIC" && <label className={editing.kind==="template"?"sm:col-span-2":""}>
                      每堂扣點
                      <input
                        className={field}
                        name="cost"
                        type="number"
                        min={1}
                        max={10000}
                        required
                        defaultValue={editing.value.pointCost}
                      />

                    </label>}
                    {editing.kind === "template" && waitlistEnabled && (
                      <WaitlistFields
                        key={`edit:${editing.value.id}`}
                        defaultEnabled={editing.value.waitlistEnabled ?? false}
                        defaultLimit={editing.value.waitlistLimit ?? waitlistDefaultLimit}
                        defaultStopMinutes={editing.value.waitlistStopMinutes ?? waitlistDefaultStopMinutes}
                      />
                    )}
                    {(editing.kind==="session" || businessProfile==="MUSIC") && (<label className="col-span-full">
                      {businessProfile === "MUSIC" ? (editing.kind === "template" ? "預設教室" : "教室") : (editing.kind === "template" ? "預設空間" : "空間")}
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
                    </label>)}
                  </>
                )}
                {editing.kind !== "room" && <DebitRule music={businessProfile === "MUSIC"}/>}
                {editing.kind === "template" && (
                  <TemplateMore
                    description={editing.value.description}
                    precautions={editing.value.precautions}
                    fitness={businessProfile !== "MUSIC"}
                    category={editing.value.category}
                    roomField={businessProfile!=="MUSIC"?<label className="block">預設空間<select className={field} name="roomId" defaultValue={editing.value.defaultRoomId??""}><option value="">不指定</option>{allRooms.filter(r=>r.isActive || r.id===editing.value.defaultRoomId).map(r=><option key={r.id} value={r.id}>{r.name}{!r.isActive?"（已停用）":""}</option>)}</select></label>:undefined}
                  />
                )}
                </>}
</fieldset>
              </form>
            )}
            {panel === "schedule" && !calendarSource && sportsNative && (sportsData?<SportsScheduleFields schedulingModes={activeSchedulingModes} waitlistEnabled={waitlistEnabled} waitlistDefaultLimit={waitlistDefaultLimit} waitlistDefaultStopMinutes={waitlistDefaultStopMinutes} seed={{...scheduleSeed,customerId:params.get("scheduleCustomer")??undefined,templateId:params.get("scheduleTemplate")??undefined,roomId:scheduleSeed.roomId??allRooms.find(room=>room.isActive)?.id}} initial={{...sportsData,customers:[...new Map([...sportsData.customers,...Object.values(sportsCreatedCustomers)].map(c=>[c.id,c])).values()]}} onCustomerAdded={customer=>setSportsCreatedCustomers(old=>({...old,[customer.id]:customer}))} date={scheduleSeed.date??selectedDate} requestKey={requestKey} onGuard={updateMusicScheduleGuard} onCreated={date=>{setDirty(false);setPanel(null);setNativeDate(date);void refreshNativeCalendar(date,true);}}/>:<p role="alert">無法讀取排課資料，請確認排課、學員、方案及計酬權限。</p>)}
            {panel === "schedule" && businessProfile === "MUSIC" && (
              <div className={`${arrangement==="rental"?"hidden":"flex"} min-h-0 flex-1 flex-col`}>
              <MusicScheduleWizard
                schedulingModes={activeSchedulingModes}
                key={requestKey}
                onGuard={updateMusicScheduleGuard}
                onRefresh={()=>refreshWorkspace()}
                onPositionChange={setScheduleSeed}
                onArrangementChange={kind=>{if(!musicScheduleGuard.current.pending&&!rentalGuard.current.pending)setArrangement(kind);}}
                active={arrangement!=="rental"}
                onCancel={closePanel}
                autoRoom={!!scheduleSeed.coachId&&!scheduleSeed.roomId}
                subjects={Array.from(new Map(allTemplates.filter(t=>t.musicSubject).map(t=>[t.musicSubject!.id,t.musicSubject!])).values())}
                templates={allTemplates}
                isTrial={arrangement==="trial"}
                initialScheduleKind={arrangement==="fixed"?"FIXED":"SINGLE"}
                canCreateCustomer={rentalPermissions.customerCreate}
                rooms={allRooms.filter(r=>r.isActive||r.id===scheduleSeed.roomId)}
                coaches={coaches}
                seed={scheduleSeed}
                initialDate={scheduleSeed.date ?? selectedDate}
                initialTemplateId={copySource?.templateId??params.get("scheduleTemplate")??undefined}
                initialLearner={rentalCustomers.find(c=>c.id===params.get("scheduleCustomer"))?{customerId:params.get("scheduleCustomer")!,name:rentalCustomers.find(c=>c.id===params.get("scheduleCustomer"))!.name,cardId:""}:undefined}
                sourceSessionId={copySource?.id}
                requestKey={requestKey}
                onCreated={(_sessionId,date) => {
                  setNotice("排課已儲存");
                  setPanel(null);
                  publishMusicFinanceChange();
                  go(date);
                  publishMusicFinanceChange();
                  refreshWorkspace();
                }}
              />
              </div>
            )}
            {panel === "schedule" && businessProfile === "MUSIC" && <div className={`${arrangement==="rental"?"flex":"hidden"} min-h-0 flex-1 flex-col`}><RentalPanel active={arrangement==="rental"} onCancel={closePanel} onPositionChange={setScheduleSeed} allowWeekly customers={rentalCustomers} key={requestKey} rooms={allRooms} permissions={{...rentalPermissions,edit:canEdit}} seed={{...scheduleSeed,date:scheduleSeed.date??selectedDate}} onGuard={updateRentalGuard} onSaved={()=>{setPanel(null);setNotice("租借已儲存");router.refresh();}} typeControl={<label className="block rounded-lg border-l-4 border-pink-500 bg-pink-50 p-3">排課類型<select aria-label="安排類型" className={field} value={arrangement} onChange={e=>{if(!rentalGuard.current.pending)setArrangement(e.target.value as "fixed"|"single"|"trial"|"rental");}}><option value="fixed">固定課</option><option value="single">單次課</option><option value="trial">體驗課</option><option value="rental">空間租借</option></select></label>}/></div>}
            {panel === "schedule" && scheduleCreated && <section className="space-y-3" role="status" aria-label="排課成功日期">
              <h3 className="text-base font-semibold text-primary-900">已成功建立 {scheduleCreated.length} 堂課程</h3>
              <p className="text-sm text-earth-600">{templates.find(item => item.id === chosen)?.name} · 以下日期已建立</p>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">{scheduleCreated.map(date => <span key={date} className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-900">{date}</span>)}</div>
              <div className="flex justify-end gap-2"><button type="button" className={button} onClick={() => openSchedule()}>再排課</button><button type="button" className={primary} onClick={() => setPanel(null)}>完成</button></div>
            </section>}
            {panel === "schedule" && !sportsNative && businessProfile !== "MUSIC" && !scheduleCreated && <>
              <div className="mb-2 flex gap-2" aria-label="安排類型">{([["class","排課"],["trial","體驗課"],["rental","租借"]] as const).map(([kind,label])=><button type="button" key={kind} className={`${button} ${arrangement===kind?"bg-primary-50 text-primary-800":""}`} onClick={()=>{if(pending || roomSave.uncertain || rentalGuard.current.pending)return;setArrangement(kind);}}>{label}</button>)}</div>
              {arrangement === "choose" && <p className="text-earth-500">選擇這個時段的安排</p>}
              {arrangement === "rental" && <RentalPanel customers={rentalCustomers} key={requestKey} rooms={allRooms} permissions={{...rentalPermissions,edit:canEdit}} seed={{...scheduleSeed,date:scheduleSeed.date??selectedDate}} onGuard={updateRentalGuard} />}
            </>}
            {panel === "schedule" && !sportsNative && businessProfile !== "MUSIC" && !scheduleCreated && (arrangement==="class" || arrangement==="trial") && (
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
                  <p>{personnelText(courseDisplayText("本店尚無可排課的教練，請先完成人員建檔。", businessProfile))}</p>
                ) : !rooms.length ? (
                  <p>
                    目前沒有可使用的教室，請至左側「空間管理」新增或恢復使用後再排課。
                  </p>
                ) : (
                  <form
                    data-course-entry
                    id="course-schedule-form"
                    onChange={updateScheduleForm}
                    className="grid grid-cols-1 gap-x-3 gap-y-2 min-[500px]:grid-cols-6"
                    onSubmit={(e) =>
                      submit(
                        e,
                        (data) =>
                          createCourseSchedule({
                            ...courseScheduleFormFields(data, {templateId: chosen, requestKey}),
                            isTrial: arrangement === "trial",
                            sourceSessionId: copySource?.id,
                          }),
                        (data) => {
                          setScheduleCreated(courseScheduleCreatedDates(data, {templateId: chosen, requestKey}));
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
                              {courseTemplateLabel(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="min-[500px]:col-span-3">{personnelText(courseDisplayText("授課教練", businessProfile))}<select
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
                      {!coaches.some(c=>c.courseQualificationsConfirmed && c.courseQualifiedTemplateIds.includes(chosen)) && <span className="block text-sm text-amber-800">{personnelText(courseDisplayText("本課程尚無具授課資格的啟用教練，請先至教練管理設定資格。", businessProfile))}<a className="block min-h-11 py-2 underline" href={pathname.replace(/\/courses$/, "/teachers")} target="_blank" rel="noopener noreferrer">{personnelText(courseDisplayText("開啟教練管理（保留此排課草稿）", businessProfile))}</a><button type="button" className={button} onClick={()=>refreshWorkspace()}>{personnelText(courseDisplayText("已設定，更新教練名單", businessProfile))}</button></span>}
                    </label>
                    <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-earth-600"><span>點數卡 {template?.pointCost} 點／堂數卡 1 堂</span><details name="course-workspace-details"><summary aria-label="扣抵說明" className="min-h-11 cursor-pointer inline-flex items-center px-2">ⓘ</summary><p>依學員方案扣抵，不會同時扣兩種額度。預約先占用，出席才正式扣抵。</p></details></div>
                    <label className="min-[500px]:col-span-2">
                      日期
                      <input
                        className={`${field} min-h-11`}
                        name="date"
                        type="date"
                        value={scheduleDate}
                        onChange={event => {setScheduleDate(event.target.value);setExtraDateKeys(current => current.filter(date => date !== event.target.value));}}
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
                    {!repeat && <div className="col-span-full">{repeatControl}</div>}
                    {!repeat && multipleDates && (
                      <div className="col-span-full space-y-2">
                        <MultiDateCalendar
                          baseDate={scheduleDate}
                          initialMonth={scheduleSeed.date ?? selectedDate}
                          dates={extraDateKeys}
                          disabled={pending}
                          onChange={dates => {
                            setExtraDateKeys(dates);
                            const form = document.getElementById("course-schedule-form");
                            if (form instanceof HTMLFormElement) previewSchedule(form, undefined, dates);
                          }}
                        />
                        {extraDateKeys.map(date => <input key={date} type="hidden" name="additionalDates" value={date} />)}
                        <p className="text-xs text-earth-500">{personnelText(courseDisplayText("同時間、教練與空間；如有撞期，整批不會建立。", businessProfile))}</p>
                      </div>
                    )}
                    {repeat && <WeeklyRepeatFields repeatControl={repeatControl} date={scheduleDate} disabled={pending} onChange={(weeks, weekdays) => {
                      const form = document.getElementById("course-schedule-form");
                      if (form instanceof HTMLFormElement) previewSchedule(form, undefined, undefined, {weeks, weekdays});
                    }} />}
                    <div className="col-span-full text-sm text-earth-500">
                      {waitlistEnabled && template?.waitlistEnabled ? `候補 ${template.waitlistLimit ?? waitlistDefaultLimit} 位 · ${(template.waitlistStopMinutes ?? waitlistDefaultStopMinutes) === 0 ? "自動遞補至開課前" : `開課前 ${waitlistStopLabel(template.waitlistStopMinutes ?? waitlistDefaultStopMinutes)}停止自動遞補`}` : "候補未開放"}
                      <details name="course-workspace-details"><summary className="inline-flex min-h-11 cursor-pointer items-center text-xs">候補規則</summary><p className="text-xs">沿用課程候補設定；停止自動遞補後保留名單。建立時檢查撞期。</p></details>
                    </div>
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
          {!catalogSource && panel === "inspect" && canEdit && <footer className="flex shrink-0 justify-end gap-2 border-t border-earth-100 bg-white p-3"><button className={`${primary} flex-1`} onClick={()=>open("edit")}>編輯{editing?.kind === "room" ? "教室":"課程"}</button>{editing?.kind === "template" && <button type="button" className={`${button} text-red-700`} disabled={pending} onClick={()=>{if(!window.confirm("確認刪除此課程？已有排課或方案紀錄的課程會保留，請改用下架。"))return;startTransition(async()=>{const result=await deleteUnusedCourseTemplate({id:editing.value.id});if(!result.success){setError(result.error ?? "刪除失敗");return;}setPanel(null);setEditing(null);setNotice("已刪除未使用課程");refreshWorkspace();});}}>刪除</button>}</footer>}
          {panel === "schedule" && !sportsNative && businessProfile !== "MUSIC" && !scheduleCreated && (arrangement==="class" || arrangement==="trial") && (
            <footer className="shrink-0 border-t border-earth-100 bg-white p-3">
              <p className="mb-2 text-xs text-earth-700" aria-live="polite">{scheduleSummary || (copySource ? "請選擇新日期與時段" : (() => {const date = scheduleSeed.date ?? selectedDate;const time = scheduleSeed.time ?? "18:00"; const start = parseTaipeiDateTime(date,time); return start ? `共 1 堂 · ${date} ${time}–${formatTWDateTime(new Date(start.getTime() + (scheduleSeed.durationMinutes ?? template?.durationMinutes ?? 60)*60000)).slice(11)}` : "請選擇日期與時段";})())}</p>
              <button
                form="course-schedule-form"
                type="submit"
                className={`${primary} w-full`}
                disabled={pending || (repeat && !!scheduleValidationError)}
              >
                {pending ? "建立中…" : "確認建立排課"}
              </button>
            </footer>
          )}
          {panel === "edit" && editing && !roomRentalHistory && (
            <footer className={businessProfile === "MUSIC" ? "flex shrink-0 justify-end gap-2 border-t border-earth-100 bg-white p-3" : `${fitnessEditorFooter} flex items-center justify-end gap-2`}>
              <button
                className={button}
                disabled={pending || templateSave.uncertain || roomSave.uncertain}
                onClick={() => {

                  open(editing.kind === "session" ? "day" : null);
                  setEditing(null);
                }}
              >
                取消
              </button>
              <button
                form="course-edit-form"
                type="submit"
                className={`${primary} ${businessProfile === "MUSIC" ? "" : fitnessEditorSave}`}
                disabled={pending}
              >
                {templateSave.uncertain || roomSave.uncertain ? "重試確認儲存結果" : copyTemplate && editing.kind === "template" ? catalogSource?"建立服務項目":"建立課程" : "儲存"}
              </button>
            </footer>
          )}
          {panel === "catalog" && canCreate && (
            <div className={businessProfile === "MUSIC" ? "flex shrink-0 gap-2 border-t border-earth-200 bg-white p-3" : `${fitnessEditorFooter} flex items-center justify-end gap-2`}>
              {businessProfile!=="MUSIC" && <button type="button" className={`${button} min-h-11`} disabled={pending} onClick={closePanel}>取消</button>}<button
                type="submit"
                form={
                  view === "rooms"
                    ? "course-room-create-form"
                    : "course-template-create-form"
                }
                className={`${primary} ${businessProfile!=="MUSIC" ? fitnessEditorSave : "w-full"}`}
                disabled={pending}
              >
                {pending
                  ? "儲存中…"
                  : view === "rooms"
                    ? roomCreate.uncertain ? "重試確認儲存結果" : "儲存"
                    : templateSave.uncertain ? "重試確認儲存結果" : catalogSource?"建立服務項目":"建立課程"}
              </button>
            </div>
          )}
        </RightSheet>
      )}
      {sportsNative&&sportsAttendanceOpen&&<SportsAttendancePanel date={selectedDate} sessions={dailySessions} leaves={cancelledBookings} canEdit={canEdit} onClose={()=>setSportsAttendanceOpen(false)} onChanged={async()=>{await refreshNativeCalendar(selectedDate);}}/>}
      {courseDialog &&
        sessions.find((session) => session.id === courseDialog.sessionId) &&
        (() => {
          const dialogSession = sessions.find(
            (session) => session.id === courseDialog.sessionId,
          )!;
          const rentalDialog = dialogSession.previewKind === "RENTAL" || /租借|RENTAL/i.test(allTemplates.find(template=>template.id===dialogSession.templateId)?.category ?? "");
          const sportsRosterDialog = !rentalDialog && (courseDialog.kind === "roster"||sportsNative) && businessProfile !== "MUSIC";
          const oneToOneMusicDialog = courseDialog.kind === "roster" && businessProfile === "MUSIC"
            && dialogSession.capacity === 1;
          const dialogTitle = sportsNative&&!rentalDialog?"上課名單":rentalDialog ? "租借資訊" :
            courseDialog.kind === "roster"
              ? businessProfile === "MUSIC" ? "課程詳情" : "上課名單"
              : courseDialog.kind === "member-booking"
                ? "＋ 學員預約"
                : "＋ 新顧客／體驗客";
          const rosterContent=(kind:"roster"|"member-booking"|"trial-booking")=>(<CourseRoster
                  sportsNative={sportsNative}
                  key={`${dialogSession.id}-${kind}`}
                  sessionId={dialogSession.id}
                  capacity={dialogSession.capacity}
                  canCreate={canCreate}
                  canEdit={canEdit}
                  view={kind}
                  initialAssignedCoach={businessProfile === "MUSIC" ? "all" : assignedCoachFilter}
                  onSessionCancelled={() => setCourseDialog(null)}
                  musicLayout={businessProfile === "MUSIC"}
                  classType={allTemplates.find(template=>template.id===dialogSession.templateId)?.classType}
                  teacherName={allCoaches.find((coach) => coach.id === dialogSession.coachId)?.displayName ?? personnelText("未指定老師")}
                  teacherPhone={allCoaches.find((coach) => coach.id === dialogSession.coachId)?.phone ?? ""}
                  coachId={dialogSession.coachId}
                  roomId={dialogSession.roomId}
                  roomName={allRooms.find((room) => room.id === dialogSession.roomId)?.name ?? "未指定教室"}
                  courseName={dialogSession.nameSnapshot}
                  onDone={() => {setRosterRevision(v=>v+1);inlineDirty.current=false;setCourseDialog({sessionId:dialogSession.id,kind:"roster"});}}
                  refreshVersion={sportsNative&&kind==="roster"?rosterRevision:0}
                  onBusyChange={sportsNative&&kind!=="roster"?setInlineBusy:undefined}

                  onCommitted={sportsNative?refreshWorkspace:undefined}
                  onAttendanceOptimistic={showPendingAttendance}
                  onTeacherAttendanceOptimistic={status=>setPendingTeacherAttendance(previous=>{if(status)return {...previous,[dialogSession.id]:status};const next={...previous};delete next[dialogSession.id];return next;})}
                  onMemberBookingReadyChange={setMemberBookingReady}
                  onCreateCustomer={() =>
                    changeBooking("trial-booking",dialogSession.id)
                  }
                />);
          return (
            <RightSheet
              className={scheduleControls.panel}
              open
              presentation="centered"
              fitContent={rentalDialog ? businessProfile !== "MUSIC" && !dialogSession.rentalId : (courseDialog.kind === "roster" || sportsNative)}
              onClose={closeRentalDialog}
              maxHeight={rentalDialog ? businessProfile === "MUSIC" ? 680 : 400 : 900}
              width={rentalDialog ? businessProfile === "MUSIC" ? 760 : 640 : oneToOneMusicDialog ? 1000 : courseDialog.kind === "roster" && businessProfile === "MUSIC" ? 1120 : courseDialog.kind === "roster"||sportsNative ? 1200 : 560}
              labelledById="course-operation-title"
            >
              <header className={`flex shrink-0 justify-between gap-4 border-b border-earth-200 px-4 ${rentalDialog ? "items-center bg-primary-50/60 py-2" : sportsRosterDialog ? "items-start bg-primary-50 py-2" : "items-start bg-primary-50 py-3"}`}>
                <div className="min-w-0">
                  {businessProfile==="MUSIC"&&!rentalDialog&&<p className="text-sm text-earth-600">{dialogSession.bookingAudience==="ASSIGNED"?"指定學員 · 僅由店家安排":"開放選課 · 依店家預約規則"}</p>}
                  <h2
                    id="course-operation-title"
                    className={`truncate font-semibold text-primary-900 ${rentalDialog ? "text-base" : "text-lg"}`}
                  >
                    {dialogTitle}
                  </h2>
                  {!rentalDialog&&<p className="mt-1 text-sm text-earth-600">
                    {formatTWDateTime(new Date(dialogSession.startsAt))} ·{" "}
                    {dialogSession.nameSnapshot} ·{" "}
                    {allRooms.find((room) => room.id === dialogSession.roomId)?.name ??
                      "未指定教室"}
                  </p>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {sportsNative&&!rentalDialog&&canEdit&&<SportsCancelCourse key={dialogSession.id} sessionId={dialogSession.id} name={dialogSession.nameSnapshot} onChanged={()=>{setCourseDialog(null);refreshWorkspace();}}/>}
                  {!rentalDialog && courseDialog.kind === "roster" && (businessProfile === "MUSIC"||sportsNative) && canEdit && dialogSession.rescheduledFromStartsAt && (
                    <button type="button" className={button} disabled={pending} onClick={() => restoreMove(dialogSession)}>恢復原時段</button>
                  )}
                  {!rentalDialog && courseDialog.kind === "roster" && (businessProfile === "MUSIC"||sportsNative) && canEdit && (!moveClipboard||sportsNative) && (
                    <button type="button" className={sportsNative?button:primary} disabled={sportsNative&&checkingMove} onClick={() => {
                      if (dialogSession.isFixed&&!sportsNative) {
                        setMoveChoice(dialogSession);
                        setMoveWeeksOpen(false);
                      } else {
                        beginMove(dialogSession, "SINGLE");
                      }
                    }}>
                      {sportsNative?(checkingMove?"核對中…":"✂ 剪下"):"✂ 剪下"}
                    </button>
                  )}
                  {!rentalDialog && (courseDialog.kind === "roster"||sportsNative) && canCreate && <><button type="button" disabled={inlineBusy} className={sportsNative?button:primary} onClick={()=>changeBooking("member-booking",dialogSession.id)}>{sportsNative?"＋學員":"＋加入學員"}</button><button type="button" disabled={inlineBusy} className={button} onClick={()=>changeBooking("trial-booking",dialogSession.id)}>＋體驗客</button></>}
                  {(monthlyReturnHref(params.toString())||params.get("returnStudentId"))&&<DashboardLink className={button} aria-disabled={inlineBusy||pending} onClick={e=>{if(inlineBusy||pending)e.preventDefault();}} href={monthlyReturnHref(params.toString())??studentReturnHref(params.get("returnStudentId")!,params.get("returnStudentQuery")??"")}>{monthlyReturnHref(params.toString())?"返回月結":"返回學員"}</DashboardLink>}
                  <button type="button" className={button} onClick={() => { setMoveChoice(null); closeRentalDialog(); }}>關閉</button>
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
                className={`min-h-0 flex-1 overscroll-contain ${sportsRosterDialog ? "p-3" : "p-3 sm:p-4"} ${
                  sportsNative&&!rentalDialog?"flex flex-col overflow-y-auto":courseDialog.kind === "roster"
                    ? rentalDialog?"flex flex-col overflow-hidden":businessProfile === "MUSIC" ? "overflow-y-auto" : "flex overflow-hidden"
                    : "overflow-y-auto"
                }`}
              >
                {rentalDialog && dialogSession.rentalId ? <RentalPanel module={catalogSource?.rentalModule} customers={rentalCustomers} id={dialogSession.rentalId} rooms={allRooms} seed={{}} permissions={{...rentalPermissions,edit:canEdit&&(!catalogSource?.rentalModule||rentalPermissions.edit)}} onGuard={updateRentalGuard} /> : rentalDialog ? <section className="w-full space-y-4 text-sm" aria-label="租借明細"><dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-3"><dt className="text-earth-500">時段</dt><dd>{formatTWDateTime(new Date(dialogSession.startsAt))} ～ {formatTWDateTime(new Date(dialogSession.endsAt))}</dd><dt className="text-earth-500">空間</dt><dd>{allRooms.find(room=>room.id===dialogSession.roomId)?.name ?? "未指定"}</dd><dt className="text-earth-500">租借人</dt><dd>{dialogSession.bookings.filter(booking=>booking.status!=="CANCELLED").map(booking=>booking.customerName).join("、") || "尚未登記"}</dd></dl><p className="text-xs text-earth-500">此時段目前僅記錄空間占用；聯絡電話、費用與租借備註尚未建檔。</p></section> : <>{sportsNative&&courseDialog.kind!=="roster"&&<section aria-label="新增預約" className="@container mb-2 rounded-lg border border-primary-200 p-2" onChangeCapture={()=>{inlineDirty.current=true;}}>
                  <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{courseDialog.kind==="member-booking"?"新增學員":"新增體驗客"}</h3><button type="button" className={button} disabled={inlineBusy} onClick={()=>changeBooking("roster",dialogSession.id)}>收起</button></div>
                  {rosterContent(courseDialog.kind)}
                  <button type="submit" form={courseDialog.kind==="member-booking"?"course-member-booking-form":"course-trial-booking-form"} disabled={inlineBusy||(courseDialog.kind==="member-booking"&&!memberBookingReady)} className={`${primary} mt-3`}>{inlineBusy?"處理中…":"確認新增"}</button>
                </section>}<div className={sportsNative?"min-h-64 shrink-0":"contents"} inert={sportsNative&&inlineBusy}>{rosterContent(sportsNative?"roster":courseDialog.kind)}</div></>}
              </div>
              {!sportsNative && !rentalDialog && courseDialog.kind !== "roster" && (
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

export function RoomMore({ rentalEnabled=false,rentalHourlyRate=0,rentalBufferMinutes=0,category,
  music=false, service=false, hideCapacity=false, capacity,
  details, equipment, location,
}: {
  service?:boolean;music?:boolean; hideCapacity?:boolean; capacity?: number | null;
  details?: string;
  equipment?:string;location?:string;visibility?:string;classType?:string|null;rentalEnabled?:boolean;rentalHourlyRate?:number;rentalBufferMinutes?:number;category?:string;
}) {
  return (
    <>
      {!music && <label>分類<input className={field} name="category" maxLength={service?100:40} defaultValue={category}/></label>}
      {!music && !service && !hideCapacity && <label>
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
      {!service && <SpaceRentalFields enabled={rentalEnabled} rate={rentalHourlyRate} buffer={rentalBufferMinutes}/>}
      <details name="course-workspace-details" className="col-span-full">
        <summary className="min-h-11 cursor-pointer py-3">{music?"其他資料（選填）":"更多資料（選填）"}</summary>

        <div className="grid gap-3 sm:grid-cols-2"><RoomFields equipment={equipment} location={location}/></div>
        <label>
          備註
          <textarea
            className={field}
            name="details"
            rows={2}
            maxLength={service?1000:5000}
            defaultValue={details}
          />
        </label>
      </details>
    </>
  );
}
function TemplateMore({
  description,
  precautions, fitness=false, category, roomField,
}: {
  description?: string;
  precautions?: string; fitness?:boolean; category?:string; roomField?:ReactNode;
}) {
  return (
    <details name="course-workspace-details" className="col-span-full">
      <summary className="min-h-11 cursor-pointer py-3">{fitness?"更多設定":"選填：課程介紹與注意事項"}</summary>
      {roomField}
      {fitness && <input type="hidden" name="category" value={category ?? ""} />}
      <div className={fitness ? "grid gap-3 sm:grid-cols-2" : ""}><label>
        課程介紹
        <textarea
          className={field}
          name="description"
          rows={2}
          maxLength={5000}
          defaultValue={description}
        />
      </label>
      <label>
        注意事項
        <textarea
          className={field}
          name="precautions"
          rows={2}
          maxLength={5000}
          defaultValue={precautions}
        />
      </label></div>
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
  const personnelText = useCoursePersonnelText();
  return <>
    <label>每位學員每堂售價（元）<input className={field} name="musicPricePerLesson" type="number" min="0" max="1000000" defaultValue={value?.musicPricePerLesson ?? 800} required/></label>
    <label>每期堂數<input className={field} name="musicTermLessons" type="number" min="1" max="1000" step="1" defaultValue={value?.musicTermLessons ?? 4} required/></label>
    <label>排課方式<select className={field} name="musicScheduleMode" defaultValue={value?.musicScheduleMode ?? "FIXED"}><option value="FIXED">固定時段</option><option value="APPOINTMENT">每次約課</option></select></label>
    <label>每期有效天數<input className={field} name="musicValidityDaysPerTerm" type="number" min="1" max="3650" defaultValue={value?.musicValidityDaysPerTerm ?? 35} required/><span className="text-xs text-earth-500">固定課預設 35 天；約課預設 70 天，從第一次上課起算。</span></label>
    <label>體驗課<select className={field} name="musicTrialMode" defaultValue={value?.musicTrialMode ?? ""}><option value="">一般課程</option><option value="FREE">免費體驗（30 分鐘）</option><option value="PAID">付費體驗（完整一堂）</option></select></label>
    <label>{personnelText("免費體驗老師計費基礎（元）")}<input className={field} name="musicTeacherFeeBase" type="number" min="0" max="1000000" defaultValue={value?.musicTeacherFeeBase ?? ""} placeholder="例：個別 400、雙人每位 325"/><span className="text-xs text-earth-500">{personnelText("只供免費體驗計算老師分成，依實際報名座位計，不因曠課減少。")}</span></label>
    <p className="col-span-full text-xs text-earth-600">音樂教室只使用堂數，每位學員每次上課使用 1 堂。團體課請假仍扣堂，自組課請假可在期限內補課。</p>
  </>;
}
function ClassType({value,required=false}:{value?:string|null;required?:boolean}) {return <label className="col-span-full">課型{required ? "（必填）" : ""}<select className={field} name="classType" required={required} defaultValue={value ?? ""}><option value="">{required ? "請選擇課型" : "待補設定"}</option><option value="PRIVATE">個別課</option><option value="SELF_ORGANIZED">自組課（自行組隊，請假可補）</option><option value="GROUP">團體課（店家開班，請假扣堂）</option></select></label>;}
function RoomFields({equipment,location}:{equipment?:string;location?:string}) {return <><label className="block">設備<input className={field} name="equipment" defaultValue={equipment}/></label><label className="block">位置<input className={field} name="location" defaultValue={location}/></label></>;}

function DebitRule({music=false}:{music?:boolean}) {
  return <details name="course-workspace-details" className="col-span-full text-xs text-earth-500"><summary className="min-h-9 cursor-pointer">扣抵說明</summary><p>{music ? "只使用堂數方案：每位學員每次固定使用 1 堂；先保留額度，出席或曠課才扣堂。團體課請假也扣堂。" : "點數方案依設定扣點；堂數方案每次 1 堂。預約保留額度，出席正式扣除。"}</p></details>;
}

function FitnessClassField({classType,trialMode,locked=false}:{classType?:string|null;trialMode?:string|null;locked?:boolean}) {
  const [kind,setKind]=useState(classType===null?"":classType??"GROUP");
  return <label className="sm:col-span-2">班別 *<select className={field} required disabled={locked} value={kind} onChange={e=>setKind(e.target.value)}>{kind===""&&<option value="">請選班別</option>}<option value="GROUP">團體課</option><option value="PRIVATE">個別課</option><option value="SELF_ORGANIZED">自組課</option></select><input type="hidden" name="classType" value={kind}/><input type="hidden" name="musicTrialMode" value={trialMode??""}/></label>;
}

function SpaceRentalFields({enabled,rate,buffer}:{enabled:boolean;rate:number;buffer:number}) {
 const [open,setOpen]=useState(enabled);
 return <fieldset className="col-span-full border-t border-earth-100 pt-1"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="rentalEnabled" value="yes" checked={open} onChange={e=>setOpen(e.target.checked)}/>開放租借</label><div className={`grid grid-cols-2 gap-2 ${open?"":"hidden"}`}><label>每小時租金（元）<input className={field} name="rentalHourlyRate" type="number" min={0} max={1000000} defaultValue={rate}/></label><label>租借前／後各留（分鐘）<input className={field} name="rentalBufferMinutes" type="number" min={0} max={120} defaultValue={buffer}/></label></div></fieldset>;
}

function ServiceCatalogFields({value}:{value?:Template}){return <>
 <CourseCatalogNameField name={value?.name} label="服務項目" className="sm:col-span-4" maxLength={100}/>
 <label className="sm:col-span-2">分類<input className={field} name="category" list="course-category-options" defaultValue={value?.category??''} maxLength={100}/></label>
 <CourseCatalogDurationField duration={value?.durationMinutes} service className="sm:col-span-3"/>
 <label className="sm:col-span-3">整理時間（分鐘，選填）<input className={field} name="buffer" type="number" min="0" max="240" defaultValue={value?.bufferMinutes??''}/></label>
 </>;}
