"use client";
import type { FeaturePresentationState } from "@/lib/effective-entitlement";
import { CourseBookingContextIndicator } from "./course-shared-card-indicator";
import { ModalPanel } from "@/components/admin/modal-panel";
import { CourseCompanionEditor } from "@/components/course-companion-editor";
import { useRetainedState, retainedString, retainedPage } from "@/components/operations/operation-scope";
import { previewCourseEnrollment, enrollCourseSeries } from "@/server/actions/course-roster-enrollment";
import { CustomerLabels } from "@/components/customer-labels";
import { RosterToolbar, RosterNotes, rosterRowClassName, rosterStatusButtonClassName } from "@/components/admin/roster-primitives";
import { CustomerListIdentity } from "@/components/customer-list-identity";
import {MusicAssignmentPayment} from "@/components/admin/music-assignment-payment";

import { CollectTrialModal } from "../bookings/collect-trial-modal";
import { type AssignmentSummary } from "@/components/admin/course-assignment-payment";
import { scheduleTeacherMakeup } from "@/server/actions/course";
import { CorrectTrialCollectionModal } from "../bookings/correct-trial-collection-modal";
import {
  createCourseTrial,
  collectCourseTrial,
  voidCourseTrialPayment,
} from "@/server/actions/course-trial";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal, flushSync } from "react-dom";
import { formatTWDateTime, toLocalDateStr } from "@/lib/date-utils";
import { COURSE_PAYMENT_LABELS } from "@/lib/course-checkout";

import { useRouter } from "next/navigation";
import {
  updateCourseRosterBatch,
  loadCourseSessionDetail,
  loadCourseRosterQuick,
  saveCourseRosterNote,
  markCourseTeacherAttendance,
  createCourseBooking,
  loadCourseStudentPurchase,
  assignCoursePointCard,
  saveCourseCustomer,
  updateCourseBookingStatus,
  cancelCourseSession,
  previewFutureCourseStop,
  stopFutureCourseLessons,
} from "@/server/actions/course-members";
import type { CourseCardView } from "./member-workspace";
import type { getCourseRoster } from "@/server/queries/course-members";
import { OperationHistoryButton } from "@/components/operation-history-button";
import { joinManagerCourseWaitlist, promoteCourseWaitlistManually } from "@/server/actions/course-waitlist";

const button =
  "min-h-10 rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50";
const primaryButton =
  "min-h-10 rounded-lg border border-primary-700 bg-primary-700 px-3 py-1.5 text-sm text-white disabled:opacity-50";
const field =
  "min-h-10 w-full rounded-lg border border-earth-200 bg-white px-3 py-1.5 text-base";

type RosterView = "roster" | "member-booking" | "trial-booking";

type RosterBooking = Awaited<ReturnType<typeof getCourseRoster>>[number];
function RosterReminders({booking,canEdit,onOpen,onEdit}:{booking:RosterBooking;canEdit:boolean;onOpen:()=>void;onEdit:()=>void}) {
  return <div className="min-w-0"><RosterNotes customerId={booking.customerId??undefined} name={booking.customerName} readOnly={!canEdit}
    notes={[{label:"店內備註",value:booking.serviceNote},{label:"本次備註",value:booking.notes,emphasis:true}]} onOpen={onOpen} />
    {canEdit && booking.status !== "CANCELLED" && <button type="button" className="min-h-11 text-sm text-primary-700" aria-label={`${booking.customerName} 本次備註`} onClick={onEdit}>{booking.notes?.trim() ? "編輯本次備註" : "＋本次備註"}</button>}
  </div>;
}

function TermPaymentHistory({ booking }: { booking: Awaited<ReturnType<typeof getCourseRoster>>[number] }) {
  if (!booking.termPayment && !booking.nextTerm) return null;
  const payment = (record: NonNullable<typeof booking.termPayment>) =>
    `${record.date ? toLocalDateStr(new Date(record.date)) : "已收款"} · NT$ ${record.amount.toLocaleString()} · ${COURSE_PAYMENT_LABELS[record.method ?? ""] ?? record.method ?? "付款方式未記錄"}`;
  return <div className="space-y-1 border-t border-earth-100 pt-2">
    {booking.termPayment && <p>本期付款：{payment(booking.termPayment)}</p>}
    {booking.nextTerm && <div>
      <p className="font-medium">下期已繳 {booking.nextPaidLessons} 堂 · {payment(booking.nextTerm.payment)}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {booking.nextTerm.lessons.length
          ? booking.nextTerm.lessons.map((lesson, index) => <span key={`${lesson.date}-${index}`} className="rounded-md bg-earth-50 px-2 py-1">{index + 1}. {toLocalDateStr(new Date(lesson.date))} {lesson.status}</span>)
          : <span className="text-earth-500">下期尚未排課</span>}
      </div>
    </div>}
  </div>;
}

export function CourseRoster({
  sessionId,
  capacity,
  canEdit,
  canCreate,
  allowTrialActions = true,
  view = "roster",
  onDone,
  onAttendanceOptimistic,
  onTeacherAttendanceOptimistic,
  onCreateCustomer,
  onMemberBookingReadyChange,
  musicLayout = false,
  classType = null,
  teacherName = "",
  teacherPhone = "",
  roomName = "",
  courseName = "",
  coachId = "",
  roomId = "",
  initialAssignedCoach = "all",
}: {
  sessionId: string;
  capacity: number;
  canCreate: boolean;
  canEdit: boolean;
  allowTrialActions?: boolean;
  view?: RosterView;
  onDone?: () => void;
  onAttendanceOptimistic?: (bookingId: string, status: "ATTENDED" | "NO_SHOW" | "CANCELLED" | "RESERVED" | null, leave?:boolean) => void;
  onTeacherAttendanceOptimistic?: (status: "SCHEDULED" | "LEAVE" | "NO_SHOW" | null) => void;
  onCreateCustomer?: () => void;
  onMemberBookingReadyChange?: (ready: boolean) => void;
  musicLayout?: boolean;
  classType?: string | null;
  teacherName?: string;
  teacherPhone?: string;
  roomName?: string;
  courseName?: string;
  coachId?: string;
  roomId?: string;
  initialAssignedCoach?: string;
}) {
  const router = useRouter();
  const [companionEditor, setCompanionEditor] = useState<{bookingId: string; add?: boolean} | null>(null);
  const readVersion = useRef(0);
  const mutationLock = useRef(false);
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const [transitionPending, start] = useTransition();
  const quickInFlight = useRef(new Set<string>());
  const [savingBookingIds, setSavingBookingIds] = useState<string[]>([]);
  const [uncertain, setUncertain] = useState(false);
  const pending = transitionPending || uncertain;
  const bulkPending = pending || savingBookingIds.length > 0;
  const [batchMode, setBatchMode] = useState(false);
  const [paymentMenu, setPaymentMenu] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchTarget, setBatchTarget] = useState<
    "ATTENDED" | "NO_SHOW" | "RESERVED"
  >("ATTENDED");
  const [showCancelled, setShowCancelled] = useState(false);
  const [expandedLessonIds, setExpandedLessonIds] = useState<string[]>([]);
  const [openActionMenu, setOpenActionMenu] = useState<{ bookingId?: string; top: number; left: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sharedCardState, setSharedCardState] = useState<FeaturePresentationState>("ENABLED");
  useEffect(() => {
    if (sharedCardState !== "ENABLED" && companionEditor?.add) setCompanionEditor(null);
  }, [sharedCardState, companionEditor]);
  const [roster, setRoster] = useState<
    Awaited<ReturnType<typeof getCourseRoster>>
  >([]);
  const [pendingMakeups, setPendingMakeups] = useState<Array<{id:string;customerId:string | null;cardId:string;date:string}>>([]);
  const [waitlist, setWaitlist] = useState<Array<{id:string;customerId:string | null;customerName:string;groupKey:string;position:number;createdAt:string}>>([]);
  const [makeupForBookingId, setMakeupForBookingId] = useState("");
  const [cards, setCards] = useState<CourseCardView[]>([]);
  const [session, setSession] = useState<{
    startsAt: string;
    pointCost: number;
    teacherNote: string;
    teacherAttendance:string;
    teacherAttendanceReason:string;
    teacherMakeupForSessionId:string|null;
    waitlistStopMinutes:number;
    waitlistEnabled?:boolean;
  } | null>(null);
  const [trial, setTrial] = useState<
    Extract<
      Awaited<ReturnType<typeof loadCourseSessionDetail>>,
      { success: true }
    >["data"]["trial"] | null
  >(null);
  const [canPurchase, setCanPurchase] = useState(false);
  const [purchaseFor, setPurchaseFor] = useState<string | null>(null);
  const [purchaseOptions, setPurchaseOptions] = useState<Extract<Awaited<ReturnType<typeof loadCourseStudentPurchase>>, {success:true}>["data"] | null>(null);
  const [purchasePlanId, setPurchasePlanId] = useState("");
  const [purchaseKey, setPurchaseKey] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseSummary, setPurchaseSummary] = useState<AssignmentSummary>({paid:null,valid:false});
  const [paymentBooking, setPaymentBooking] = useState<string | null>(null);
  const [correctPayment, setCorrectPayment] = useState(false);
  const [noShowBooking, setNoShowBooking] = useState<{
    id: string;
    name: string;
    trial: boolean;
    term: boolean;
  } | null>(null);
  const [cancelBooking, setCancelBooking] = useState<{
    id: string;
    name: string;
    status: "RESERVED" | "ATTENDED" | "NO_SHOW" | "CANCELLED";
    refund: number;
    unit: string;
  } | null>(null);
  const [enrollmentScope,setEnrollmentScope]=useState("SINGLE");
  const [enrollmentSessions,setEnrollmentSessions]=useState<Array<{id:string;startsAt:string;pointCost:number;full:boolean}>>([]);
  const [enrollmentLoading,setEnrollmentLoading]=useState(false);
  const [cardId, setCardId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [memberQuery, setMemberQuery] = useRetainedState(`course-roster:${sessionId}:${view}:query`,"",retainedString);
  const [statusFilter, setStatusFilter] = useRetainedState(`course-roster:${sessionId}:statusFilter`,"all",retainedString);
  const [paymentFilter, setPaymentFilter] = useRetainedState(`course-roster:${sessionId}:paymentFilter`,"all",retainedString);
  const [kindFilter, setKindFilter] = useRetainedState(`course-roster:${sessionId}:kindFilter`,"all",retainedString);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assignedFilter, setAssignedFilter] = useRetainedState(`course-roster:${sessionId}:${initialAssignedCoach}:assigned`,initialAssignedCoach,retainedString);
  const [rosterScroll,setRosterScroll]=useRetainedState(`course-roster:${sessionId}:scroll`,0,retainedPage);
  const [retainedRows, setRetainedRows] = useState<string[]>([]);
  function resetFilterSelection() { setSelected([]); setRetainedRows([]); }

  const [trialQuery, setTrialQuery] = useState("");
  const [trialMode, setTrialMode] = useState<"existing" | "new">("new");
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [futureStopTarget, setFutureStopTarget] = useState<{ bookingId?: string; name: string } | null>(null);
  const [futureStopPreview, setFutureStopPreview] = useState<{ sessionIds: string[]; bookingIds: string[]; customerName?: string } | null>(null);
  const [futureEffectiveDate, setFutureEffectiveDate] = useState("");
  const futurePreviewVersion = useRef(0);
  const [futureStopError, setFutureStopError] = useState("");
  const [futureStopPending, setFutureStopPending] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [editingNote, setEditingNote] = useState<{bookingId?:string;name:string;value:string}|null>(null);
  const [noteDraft,setNoteDraft]=useState("");
  const [infoBooking,setInfoBooking]=useState<{id:string;sessionId:string}|null>(null);
  const infoBookingId=infoBooking?.sessionId===sessionId?infoBooking.id:null;
  const setInfoBookingId=useCallback((id:string|null)=>{setInfoBooking(id?{id,sessionId}:null);},[sessionId]);
  useEffect(()=>{
    if(!infoBookingId || !musicLayout)return;
    const escape=(event:KeyboardEvent)=>{if(event.key!=="Escape" || document.querySelector('[role="dialog"][aria-label="顧客標籤"]'))return;event.preventDefault();event.stopImmediatePropagation();setInfoBookingId(null);};
    document.addEventListener("keydown",escape,true);
    return ()=>document.removeEventListener("keydown",escape,true);
  },[infoBookingId,musicLayout,setInfoBookingId]);
  const [studentLeave, setStudentLeave]=useState<{id:string;name:string}|null>(null);
  const [teacherDialog,setTeacherDialog]=useState<"NO_SHOW"|"LEAVE"|"SCHEDULED"|null>(null);
  const [teacherReason,setTeacherReason]=useState("");
  const [makeupDialog,setMakeupDialog]=useState(false);
  const [makeupDate,setMakeupDate]=useState("");
  const [makeupTime,setMakeupTime]=useState("09:00");

  async function load() {

    const version = ++readVersion.current;
    const result = await loadCourseRosterQuick(sessionId);
    if (version !== readVersion.current || currentSession.current !== sessionId) return;

    if (result.success) {
      setRoster(result.data.roster);
      setSharedCardState(result.data.sharedCardState ?? "ENABLED");
      setWaitlist(result.data.waitlist ?? []);
      setSession(old=>old ? {...old,teacherNote:result.data.teacherNote,teacherAttendance:result.data.teacherAttendance,teacherAttendanceReason:result.data.teacherAttendanceReason,waitlistStopMinutes:result.data.waitlistStopMinutes}:old);
      setLoaded(true);
    } else {
      setMessage(result.error);
    }
  }

  useEffect(() => {
    let active = true;

    const refresh = () => {
      if (mutationLock.current || quickInFlight.current.size > 0) return Promise.resolve();
      const version = ++readVersion.current;
      return loadCourseSessionDetail(sessionId, view === "roster")

        .then((result) => {
          if (!active || version !== readVersion.current || currentSession.current !== sessionId) return;
          if (result.success) {
            setSession(result.data.session);
            setTrial(result.data.trial);
            setRoster(result.data.roster);
            setSharedCardState(result.data.sharedCardState ?? "ENABLED");
            setCards(result.data.cards);
            setPendingMakeups(result.data.pendingMakeups ?? []);
            setWaitlist(result.data.waitlist ?? []);
            setCanPurchase(result.data.canPurchase);
            setLoaded(true);
            setRequestKey((current) => current || crypto.randomUUID());
          } else {
            setMessage(result.error);
          }
        })
        .catch(() => {
          if (active && version === readVersion.current) setMessage("讀取失敗，現有名單已保留，請重試");
        });
    };
    void refresh();
    const refreshVisibleRoster = () => {
      if (view === "roster" && document.visibilityState === "visible") {
        void refresh();
      }
    };
    const timer =
      view === "roster"
        ? window.setInterval(refreshVisibleRoster, 60_000)
        : undefined;
    window.addEventListener("focus", refreshVisibleRoster);
    document.addEventListener("visibilitychange", refreshVisibleRoster);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisibleRoster);
      document.removeEventListener("visibilitychange", refreshVisibleRoster);
    };
  }, [sessionId, view]);

  function run(
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage = "已完成",
    optimistic?: {bookingId:string;status:"ATTENDED"|"NO_SHOW"|"CANCELLED"|"RESERVED";absenceKind?:string} | {bookingId:string;status:"ATTENDED"|"NO_SHOW"|"CANCELLED"|"RESERVED";absenceKind?:string}[],
    teacherStatus?:"SCHEDULED"|"LEAVE"|"NO_SHOW",
  ) {
    if (teacherStatus) { setStatusFilter("all"); setRetainedRows([]); setSelected([]); }
    const updates = optimistic ? Array.isArray(optimistic) ? optimistic : [optimistic] : [];
    const quickAttendance = view === "roster" && updates.length === 1 && !teacherStatus;
    const bookingId = quickAttendance ? updates[0].bookingId : null;
    if (mutationLock.current || uncertain ||
        (bookingId ? quickInFlight.current.has(bookingId) || !musicLayout && quickInFlight.current.size > 0 : quickInFlight.current.size > 0)) return;
    if (bookingId) {
      quickInFlight.current.add(bookingId);
      setSavingBookingIds([...quickInFlight.current]);
    } else {
      mutationLock.current = true;
    }
    ++readVersion.current;
    setMessage("處理中…");

    if (statusFilter === "pending") setRetainedRows(ids => [...new Set([...ids, ...updates.map(row => row.bookingId)])]);
    const previous = roster;
    const previousRow = bookingId ? roster.find(row => row.id === bookingId) : null;
    const previousSession = session;
    const applyOptimisticRoster = () => {
      if (updates.length) {
        const changes = new Map(updates.map(item => [item.bookingId, item]));
        const deltas = new Map<string, number>();
        for (const update of updates) {
          const old = roster.find(row => row.id === update.bookingId);
          if (musicLayout || !old?.cardId) continue;
          const wasDebited = old.status === "ATTENDED" || old.status === "NO_SHOW" || old.absenceKind === "GROUP_LEAVE_FORFEITED";
          const willDebit = update.status === "ATTENDED" || update.status === "NO_SHOW" || update.absenceKind === "GROUP_LEAVE_FORFEITED";
          deltas.set(old.cardId, (deltas.get(old.cardId) ?? 0) + (Number(wasDebited) - Number(willDebit)) * old.pointCost);
        }
        setRoster(rows => rows.map(row => {
          const change = changes.get(row.id);
          const balanced = row.cardRemaining != null && row.cardId ? {...row, cardRemaining: row.cardRemaining + (deltas.get(row.cardId) ?? 0)} : row;
          return change ? {
            ...balanced,
            status: change.status,
            ...(change.status === "RESERVED"
              ? { absenceKind: null, checkedInAt: null }
              : change.absenceKind ? { absenceKind: change.absenceKind } : {}),
          } : balanced;
        }));
      }
    };
    flushSync(applyOptimisticRoster);
    updates.forEach(item => onAttendanceOptimistic?.(item.bookingId, item.status, Boolean(item.absenceKind)));
    if (teacherStatus) {
      setSession(old => old ? { ...old, teacherAttendance: teacherStatus } : old);
      onTeacherAttendanceOptimistic?.(teacherStatus);
    }

    const rollback = () => {
      if (updates.length) {
        if (bookingId && previousRow && musicLayout) {
          setRoster(rows => rows.map(row => row.id === bookingId ? previousRow : row));
        } else {
          setRoster(previous);
        }
        updates.forEach(item => onAttendanceOptimistic?.(item.bookingId, null));
      }
      if (teacherStatus) {
        setSession(previousSession);
        onTeacherAttendanceOptimistic?.(null);
      }
    };

    const perform = async () => {
      try {
        const result = await action();
        if (currentSession.current !== sessionId) return;
        if (!result.success) {
          rollback();
          setMessage(result.error ?? "操作失敗");
          if (!bookingId) {
            await load();
            router.refresh();
          }
          return;
        }
        setMessage(successMessage);
        if (!bookingId) {
          setSelected([]);
          setRequestKey(crypto.randomUUID());
          await load();
          router.refresh();
          if (view !== "roster") onDone?.();
        }
      } catch {
        if (currentSession.current === sessionId) {
          rollback();
          setUncertain(true);
          setMessage("結果待確認，請重新開啟名單核對後再操作。");
          if (!bookingId) {
            try { await load(); } catch { /* Keep the last confirmed roster and warning. */ }
          }
        }
      } finally {
        if (bookingId) {
          quickInFlight.current.delete(bookingId);
          if (currentSession.current === sessionId) {
            setSavingBookingIds([...quickInFlight.current]);
            // Reconcile once the last individual write finishes. A newer click
            // invalidates any older read, so it cannot overwrite optimistic rows.
            if (quickInFlight.current.size === 0) {
              void load().catch(() => setMessage("已儲存，名單更新失敗，請重新開啟核對"));
            }
          }
        } else {
          mutationLock.current = false;
        }
      }
    };
    if (bookingId) void perform();
    else start(perform);
  }

  async function openFutureStop(bookingId?: string, name = "整班", effectiveDate = "") {
    const version = ++futurePreviewVersion.current;
    setFutureEffectiveDate(effectiveDate);
    setFutureStopTarget({ bookingId, name });
    setFutureStopPreview(null);
    setFutureStopError("");
    setFutureStopPending(true);
    const result = await previewFutureCourseStop({ sessionId, bookingId, effectiveDate: effectiveDate || undefined });
    if (currentSession.current !== sessionId || version !== futurePreviewVersion.current) return;
    if (result.success) setFutureStopPreview(result.data);
    else setFutureStopError(result.error);
    setFutureStopPending(false);
  }

  function toggleRosterMenu(target: HTMLElement, bookingId?: string) {
    const key = bookingId ?? "course";
    if ((openActionMenu?.bookingId ?? "course") === key && openActionMenu) {
      setOpenActionMenu(null);
      return;
    }
    setExpandedLessonIds([]);
    requestAnimationFrame(() => {
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const menuHeight = bookingId ? 280 : 112;
      setOpenActionMenu({
        bookingId,
        top: rect.bottom + menuHeight + 8 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4),
        left: Math.max(8, Math.min(rect.right - 192, window.innerWidth - 200)),
      });
    });
  }

  useEffect(() => {
    if (!openActionMenu) return;
    const close = () => setOpenActionMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); } };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && (target.closest("[data-roster-action-menu]") || target.closest("[data-roster-action-trigger]"))) return;
      close();
    };
    document.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openActionMenu]);

  async function openStudentPurchase(bookingId: string) {
    if (purchasePending) return;
    setPurchaseFor(bookingId);
    setPurchaseOptions(null);
    setPurchaseError("");
    const result = await loadCourseStudentPurchase(bookingId);
    if (result.success) {
      setPurchaseOptions(result.data);
      setPurchasePlanId(result.data.plans[0]?.id ?? "");
      setPurchaseKey(crypto.randomUUID());
      setPurchaseSummary({paid:null,valid:false});
    } else setPurchaseError(result.error);
  }

  const actionBooking = roster.find((booking) => booking.id === openActionMenu?.bookingId);
  const payBooking = roster.find((booking) => booking.id === paymentBooking);
  const receipt = payBooking?.trialPayments.find(
    (payment) => payment.status === "SUCCESS",
  );
  const paymentSettings = trial
    ? {
        allowEdit: trial.settings.trialAllowPriceEdit,
        defaultPrice: trial.settings.trialDefaultPrice,
        minPrice: trial.settings.trialMinPrice,
        maxPrice: trial.settings.trialMaxPrice,
      }
    : null;
  const activeRows = roster.filter((booking) => booking.status !== "CANCELLED" || (["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED","TEACHER_ABSENT"].includes(booking.absenceKind ?? "")));
  const cancelledRows = roster.filter(
    (booking) => booking.status === "CANCELLED" && (!["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED","TEACHER_ABSENT"].includes(booking.absenceKind ?? "")),
  );
  const rows = showCancelled ? cancelledRows : activeRows;
  const normalizedRosterQuery = memberQuery.trim().toLocaleLowerCase();
  const coachOptions = [...new Map(activeRows.filter(row => row.assignedCoachId).map(row => [row.assignedCoachId!, row.assignedCoachName])).entries()];
  const matchesStatus = (booking: typeof roster[number], value: string) => value === "all" ||
    value === "pending" && booking.status === "RESERVED" || value === "attended" && booking.status === "ATTENDED" ||
    value === "deducted" && (booking.status === "NO_SHOW" || booking.absenceKind === "GROUP_LEAVE_FORFEITED") ||
    value === "leave" && booking.absenceKind === "STUDENT_LEAVE";
  const matchesPayment = (booking: typeof roster[number]) => paymentFilter === "all" || booking.bookingKind === "TRIAL" && (paymentFilter === "paid" ? booking.trialPayments.some(payment => payment.status === "SUCCESS") : !booking.trialPayments.some(payment => payment.status === "SUCCESS"));
  const scopedRows = rows.filter(booking =>
    (!normalizedRosterQuery || booking.customerName.toLocaleLowerCase().includes(normalizedRosterQuery) || booking.customerPhone.includes(normalizedRosterQuery)) &&
    (kindFilter === "all" || booking.bookingKind === kindFilter) && matchesPayment(booking) &&
    (musicLayout || assignedFilter === "all" || (assignedFilter === "none" ? !booking.assignedCoachId : booking.assignedCoachId === assignedFilter)));
  const searchedRows = scopedRows.filter(booking => matchesStatus(booking, statusFilter) || retainedRows.includes(booking.id));
  const rosterFiltered = !!normalizedRosterQuery || statusFilter !== "all" || paymentFilter !== "all" || kindFilter !== "all" || !musicLayout && assignedFilter !== "all";
  const clearRosterFilters = () => {setMemberQuery("");setStatusFilter("all");setPaymentFilter("all");setKindFilter("all");setAssignedFilter("all");resetFilterSelection();};
  const rosterFilterClass = (value: string) => `${button} mt-1 block min-h-11 bg-white ${value !== "all" ? "border-primary-500 bg-primary-50 font-semibold text-primary-800" : ""}`;
  const activeFilterLabels = [normalizedRosterQuery && `搜尋：${memberQuery.trim()}`, statusFilter !== "all" && `點名：${({pending:"待點名",attended:"已出席",deducted:"缺席・扣堂",leave:"缺席・不扣堂"} as Record<string,string>)[statusFilter]}`, paymentFilter !== "all" && `收款：${paymentFilter === "unpaid" ? "體驗未收款" : "體驗已收款"}`, kindFilter !== "all" && `類型：${({CARD:"一般",TRIAL:"體驗",TEACHER_MAKEUP:"免費券"} as Record<string,string>)[kindFilter]}`, !musicLayout && assignedFilter !== "all" && `所屬店長：${assignedFilter === "none" ? "未指定" : coachOptions.find(([id]) => id === assignedFilter)?.[1] ?? "所選店長"}`].filter((label): label is string => Boolean(label));
  const trialBadge = (booking: typeof roster[number]) => {
    if (booking.bookingKind !== "TRIAL") return null;
    const paid = booking.trialPayments.find(payment => payment.status === "SUCCESS");
    return <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-normal"><span className="text-amber-700">體驗 ·</span>{paid ? <><span>已收 ${paid.amount}</span>{allowTrialActions && trial?.canCorrect && <button type="button" className="min-h-11 min-w-11 rounded text-earth-600" aria-label={`更正 ${booking.customerName} 收款`} onClick={() => setPaymentMenu(booking.id)}>✎</button>}</> : allowTrialActions && trial?.canCollect && booking.status !== "CANCELLED" ? <button type="button" className="min-h-11 rounded px-1 font-medium text-amber-800" disabled={pending} onClick={() => {setRequestKey(crypto.randomUUID());setCorrectPayment(false);setPaymentBooking(booking.id);}}>待收 ${booking.trialPrice}</button> : <span className="text-amber-800">待收 ${booking.trialPrice}</span>}</span>;
  };
  const selectableRows = searchedRows.filter((booking) => {
    if (booking.status === "CANCELLED") return false;
    if (batchTarget === "ATTENDED") return booking.status === "RESERVED";
    if (batchTarget === "RESERVED") return booking.status === "ATTENDED" || booking.status === "NO_SHOW";
    if (batchTarget === "NO_SHOW") return booking.status === "RESERVED" || booking.status === "ATTENDED";
    return booking.status === "RESERVED";
  });
  const chosen = selectableRows.filter((booking) =>
    selected.includes(booking.id),
  );
  useEffect(()=>{
    if(view!=="member-booking" || !customerId)return;
    let current=true;
    setEnrollmentLoading(true);setEnrollmentSessions([]);setEnrollmentScope("SINGLE");
    previewCourseEnrollment({sessionId,customerId}).then(result=>{
      if(!current)return;
      if(result.success && "sessions" in result)setEnrollmentSessions(result.sessions);else if(!result.success)setMessage(result.error ?? "後續課程讀取失敗");
    }).catch(()=>{if(current)setMessage("後續課程讀取失敗，仍可加入本堂");}).finally(()=>{if(current)setEnrollmentLoading(false);});
    return()=>{current=false;};
  },[view,sessionId,customerId]);
  const count = activeRows.length;
  const occupiedCount=activeRows.filter(row=>row.status!=="CANCELLED").length;
  const oneToOneMusic = musicLayout && classType === "PRIVATE" && capacity === 1;
  const largeMusicGroup = musicLayout && capacity >= 10;
  const groupCohortProgress = classType === "GROUP" ? activeRows[0]?.groupCohortProgress : null;
  const teacherAbsent = (session?.teacherAttendance === "LEAVE" || session?.teacherAttendance === "NO_SHOW");
  const waitingCount = activeRows.filter(
    (booking) => booking.status === "RESERVED",
  ).length;
  const unpaidTrialCount = activeRows.filter(
    (booking) =>
      booking.bookingKind === "TRIAL" &&
      !booking.trialPayments.some((payment) => payment.status === "SUCCESS"),
  ).length;

  const learners = useMemo(
    () =>
      Array.from(
        new Map(
          cards
            .flatMap((item) => item.members)
            .map((member) => [member.id, member] as const),
        ).values(),
      ),
    [cards],
  );
  const normalizedMemberQuery = memberQuery.trim().toLocaleLowerCase();
  const normalizedMemberPhoneQuery = memberQuery.replace(/\D/g, "");
  const filteredLearners = normalizedMemberQuery
    ? learners.filter(
        (member) =>
          member.name.toLocaleLowerCase().includes(normalizedMemberQuery) ||
          (normalizedMemberPhoneQuery &&
            member.phone.replace(/\D/g, "").includes(normalizedMemberPhoneQuery)),
      )
    : [];
  const eligibleCardsFor = (memberId: string) =>
    cards
      .filter(
        (item) =>
          item.members.some((member) => member.id === memberId) &&
          !item.expired &&
          !item.closed &&
          item.available >=
            (item.unit === "SESSION" ? 1 : session?.pointCost ?? 1) &&
          (!session || item.expiresAt >= session.startsAt),
      )
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const eligibleCards = eligibleCardsFor(customerId);
  const memberBookingReady = Boolean(
    customerId && cardId && eligibleCards.some((item) => item.id === cardId),
  );

  useEffect(() => {
    if (view !== "member-booking") return;
    onMemberBookingReadyChange?.(memberBookingReady);
    return () => onMemberBookingReadyChange?.(false);
  }, [memberBookingReady, onMemberBookingReadyChange, view]);

  const normalizedTrialQuery = trialQuery.trim().toLocaleLowerCase();
  const normalizedTrialPhoneQuery = trialQuery.replace(/\D/g, "");
  const filteredTrialCustomers =
    normalizedTrialQuery && trial
      ? trial.customers.filter(
          (customer) =>
            customer.name.toLocaleLowerCase().includes(normalizedTrialQuery) ||
            (normalizedTrialPhoneQuery &&
              customer.phone.replace(/\D/g, "").includes(normalizedTrialPhoneQuery)),
        )
      : [];

  if (!loaded) {
    return (
      <div className="flex min-h-40 items-center justify-center text-earth-600">
        {message || "讀取中…"}
      </div>
    );
  }

  // Refresh the scope whenever the chosen student changes; ignore stale responses.
  if (view === "member-booking") {
    return (
      <form
        id="course-member-booking-form"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!customerId || !cardId) {
            setMessage("請先選擇學員與有效方案");
            return;
          }
          const chosenCard=cards.find(card=>card.id===cardId);
          const totalCost=enrollmentSessions.reduce((total,item)=>total+(chosenCard?.unit==="SESSION"?1:item.pointCost),0);
          if(enrollmentScope==="FUTURE" && (enrollmentLoading || !enrollmentSessions.length || !chosenCard || chosenCard.available<totalCost || enrollmentSessions.some(item=>item.startsAt>chosenCard.expiresAt))){setMessage("請確認後續日期與方案額度、有效期限");return;}
          const allowOverCapacity = enrollmentScope==="FUTURE" ? enrollmentSessions.some(item=>item.full) : occupiedCount >= capacity;
          if(allowOverCapacity && !window.confirm(`所選課程已滿班（本堂 ${occupiedCount}/${capacity} 人）${waitlist.length ? `，另有 ${waitlist.length} 位候補` : ""}。確認超額加入這位學員？`)) return;
          const data = new FormData(event.currentTarget);
          if(enrollmentScope==="FUTURE") {
            run(()=>enrollCourseSeries({allowOverCapacity,sessionId,cardId,customerId,requestKey,notes:data.get("notes"),sessionIds:enrollmentSessions.map(item=>item.id)}),`已加入 ${enrollmentSessions.length} 堂課程`);
            return;
          }
          run(() =>
            createCourseBooking({
              allowOverCapacity,
              sessionId,
              cardId,
              customerId,
              requestKey,
              notes: data.get("notes"),
              makeupForBookingId: makeupForBookingId || null,
            }),
          );
        }}
      >
        {message && <p role="status" className="text-sm text-primary-700">{message}</p>}
        <div>
          <label htmlFor="course-member-search" className="mb-1 block text-sm font-medium">
            先找學員
          </label>
          <input
            id="course-member-search"
            className={field}
            value={memberQuery}
            onChange={(event) => {
              setMemberQuery(event.target.value);
              setCustomerId("");
              setCardId("");
            }}
            placeholder="輸入部分姓名或手機末幾碼"
            autoFocus
          />
          {!normalizedMemberQuery && (
            <p className="mt-2 text-sm text-earth-500">輸入關鍵字後才會顯示符合的學員。</p>
          )}
          {normalizedMemberQuery && (
            <div className="mt-2 max-h-52 divide-y overflow-y-auto rounded-lg border border-earth-200 bg-white">
              {filteredLearners.length ? (
                filteredLearners.map((member) => {
                  const memberCards = eligibleCardsFor(member.id);
                  const available = memberCards.length;
                  const alreadyJoined=roster.some(row=>row.customerId===member.id && (row.status!=="CANCELLED" || ["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED","TEACHER_ABSENT"].includes(row.absenceKind ?? "")));
                  return (
                    <button
                      type="button"
                      key={member.id}
                      disabled={alreadyJoined}
                      className={`flex w-full items-center justify-between px-3 py-3 text-left hover:bg-primary-50 ${customerId === member.id ? "bg-primary-50" : ""}`}
                      onClick={() => {
                        setCustomerId(member.id);
                        const makeup = pendingMakeups.find(item => item.customerId === member.id && memberCards.some(card=>card.id===item.cardId));
                        setMakeupForBookingId(makeup?.id ?? "");
                        setCardId(makeup?.cardId ?? memberCards[0]?.id ?? "");
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      <span>
                        <strong className="block">{member.name}</strong>
                        <span className="text-xs text-earth-500">{member.phone || "未填電話"}</span>
                      </span>
                      <span className="text-xs text-earth-500">
                        {alreadyJoined ? "已加入本堂" : available ? `${available} 個可用方案` : "沒有可用方案"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="space-y-2 p-4">
                  <p className="text-sm text-earth-500">找不到符合的學員。</p>
                  {allowTrialActions && onCreateCustomer && (
                    <button
                      type="button"
                      className={button}
                      onClick={onCreateCustomer}
                    >
                      ＋ 直接建立新顧客
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {allowTrialActions && onCreateCustomer && !normalizedMemberQuery && (
            <button
              type="button"
              className={`${button} mt-2`}
              onClick={onCreateCustomer}
            >
              ＋ 直接建立新顧客
            </button>
          )}
          {allowTrialActions && onCreateCustomer && (
            <p className="mt-2 text-xs text-earth-500">
              新顧客可直接建檔並以體驗預約加入本堂，不必先前往顧客管理。
            </p>
          )}
        </div>

        {customerId && cardId && occupiedCount>=capacity && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm">
          <span>全班 {occupiedCount}/{capacity} 人{waitlist.length?` · 候補 ${waitlist.length} 人`:""}</span>
          {session?.waitlistEnabled && <button type="button" className={button} disabled={pending} onClick={()=>run(()=>joinManagerCourseWaitlist({sessionId,cardId,customerIds:[customerId],requestKey}),"已加入本堂候補")}>加入候補</button>}
          <span className="text-xs text-earth-600">直接預約會再次確認超額加入。</span>
        </div>}
        {customerId && !makeupForBookingId && enrollmentSessions.length>1 && <fieldset className="rounded-lg border border-earth-200 p-3 text-sm">
          <legend>加入範圍</legend>
          <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={enrollmentScope==="SINGLE"} className={button} onClick={()=>setEnrollmentScope("SINGLE")}>僅本堂</button><button type="button" aria-pressed={enrollmentScope==="FUTURE"} className={button} onClick={()=>setEnrollmentScope("FUTURE")}>本堂及後續 · {enrollmentSessions.length} 堂</button></div>
          {enrollmentScope==="FUTURE" && <><p className="mt-2">已排定 {enrollmentSessions.length} 堂，已加入、已停課或已取消的堂次不重複加入。</p><ul className="mt-1 max-h-28 overflow-auto text-xs text-earth-600">{enrollmentSessions.map(item=><li key={item.id}>{formatTWDateTime(new Date(item.startsAt))}{item.full?" · 已滿班":""}</li>)}</ul><p className="mt-2">需要 {enrollmentSessions.reduce((sum,item)=>sum+(cards.find(card=>card.id===cardId)?.unit==="SESSION"?1:item.pointCost),0)} {cards.find(card=>card.id===cardId)?.unit==="SESSION"?"堂":"點"} · 可用 {cards.find(card=>card.id===cardId)?.available ?? "—"}</p></>}
        </fieldset>}
        {enrollmentLoading && <p role="status" className="text-xs text-earth-500">確認後續堂次中…</p>}
        {customerId && (
          <div className="space-y-3 rounded-xl border border-earth-200 bg-earth-50 p-3">
            <p className="text-sm text-earth-600">已選學員</p>
            <p className="font-medium">
              {learners.find((member) => member.id === customerId)?.name}
            </p>
            {musicLayout && pendingMakeups.some(item=>item.customerId===customerId) && <label className="block text-sm font-medium">
              待補課 {pendingMakeups.filter(item=>item.customerId===customerId).length} 堂
              <select aria-label="補課紀錄" className={`${field} mt-1`} value={makeupForBookingId} onChange={event=>{
                const value=event.target.value; setMakeupForBookingId(value);
                const source=pendingMakeups.find(item=>item.id===value);
                if(source)setCardId(source.cardId);
                setRequestKey(crypto.randomUUID());
              }}>
                <option value="">不安排補課</option>
                {pendingMakeups.filter(item=>item.customerId===customerId).map(item=><option key={item.id} value={item.id} disabled={!eligibleCards.some(card=>card.id===item.cardId)}>{toLocalDateStr(new Date(item.date))} 請假{!eligibleCards.some(card=>card.id===item.cardId) ? "（原方案無可用堂數或已到期）" : ""}</option>)}
              </select>
            </label>}
            <label className="block text-sm font-medium">
              有效方案
              {eligibleCards.length > 1 && !makeupForBookingId && (
                <span className="ml-2 font-normal text-earth-500">
                  已優先帶入最快到期方案
                </span>
              )}
              <select
                className={`${field} mt-1`}
                value={cardId}
                required
                onChange={(event) => {
                  setCardId(event.target.value);
                  setMakeupForBookingId("");
                  setRequestKey(crypto.randomUUID());
                }}
              >
                <option value="">請選擇</option>
                {eligibleCards.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · 可用 {item.available} {item.unit === "SESSION" ? "堂" : "點"} · 到期{" "}
                    {formatTWDateTime(new Date(item.expiresAt)).slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
            {!eligibleCards.length && (
              <p className="text-sm text-earth-600">
                沒有可用方案，請先指派方案。
              </p>
            )}
            <label className="block text-sm font-medium">
              本次備註
              <textarea className={`${field} mt-1 min-h-20`} name="notes" maxLength={1000} />
            </label>
          </div>
        )}
      </form>
    );
  }

  if (view === "trial-booking") {
    if (!allowTrialActions || !trial?.canCreate || !trial.settings.trialEnabled) {
      return <p className="text-sm text-earth-600">目前未開放建立體驗預約。</p>;
    }
    const priceField = (
      <label className="block text-sm font-medium">
        體驗金額
        <input
          name="price"
          type="number"
          required
          readOnly={!trial.settings.trialAllowPriceEdit}
          min={trial.settings.trialMinPrice}
          max={trial.settings.trialMaxPrice}
          defaultValue={trial.settings.trialDefaultPrice}
          className={`${field} mt-1`}
        />
      </label>
    );
    const noteField = (
      <label className="block text-sm font-medium">
        本次備註
        <textarea
          name="notes"
          maxLength={1000}
          className={`${field} mt-1 min-h-20`}
        />
      </label>
    );
    return (
      <section className="space-y-4">

      {message && (
          <p role="status" className="text-sm text-primary-700">
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className={`${button} ${trialMode === "new" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
            onClick={() => setTrialMode("new")}
          >
            ＋ 新增體驗客
          </button>
          <button
            type="button"
            className={`${button} ${trialMode === "existing" ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
            onClick={() => setTrialMode("existing")}
          >
            已有顧客資料
          </button>
        </div>

        {trialMode === "existing" ? (
          <form
            id="course-trial-booking-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const allowOverCapacity = occupiedCount >= capacity;
              if(allowOverCapacity && !window.confirm(`所選課程已滿班（本堂 ${occupiedCount}/${capacity} 人）${waitlist.length ? `，另有 ${waitlist.length} 位候補` : ""}。確認超額加入這位學員？`)) return;
              const data = new FormData(event.currentTarget);
              run(() =>
                createCourseTrial({
                  allowOverCapacity,
                  sessionId,
                  customerId: data.get("trial-customer-choice"),
                  price: Number(data.get("price")),
                  notes: data.get("notes"),
                  requestKey,
                }),
              );
            }}
          >
            <div>
              <label
                htmlFor="course-trial-search"
                className="mb-1 block text-sm font-medium"
              >
                找到既有顧客就直接加入
              </label>
              <input
                id="course-trial-search"
                className={field}
                value={trialQuery}
                onChange={(event) => setTrialQuery(event.target.value)}
                placeholder="輸入部分姓名或手機末幾碼"
                autoFocus
              />
              {!normalizedTrialQuery && (
                <p className="mt-2 text-sm text-earth-500">
                  輸入關鍵字後才會顯示符合的顧客。
                </p>
              )}
            </div>
            {normalizedTrialQuery && (
              <div className="max-h-52 divide-y overflow-y-auto rounded-lg border border-earth-200">
                {filteredTrialCustomers.length ? (
                  filteredTrialCustomers.map((customer) => (
                    <label
                      key={customer.id}
                      className="flex min-h-12 cursor-pointer items-center gap-3 px-3 hover:bg-primary-50"
                    >
                      <input
                        type="radio"
                        name="trial-customer-choice"
                        value={customer.id}
                        required
                      />
                      <span>
                        <strong className="block">{customer.name}</strong>
                        <span className="text-xs text-earth-500">{customer.phone || "未填電話"}</span>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="p-4 text-sm text-earth-500">
                    找不到既有顧客，可切換「建立新體驗客」快速建檔。
                  </p>
                )}
              </div>
            )}
            {priceField}
            {noteField}
            <p className="text-sm text-earth-600">
              先建立未收款預約並保留名額；收款與出席分開，不占用其他方案。
            </p>
          </form>
        ) : (
          <form
            id="course-trial-booking-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const allowOverCapacity = occupiedCount >= capacity;
              if(allowOverCapacity && !window.confirm(`所選課程已滿班（本堂 ${occupiedCount}/${capacity} 人）${waitlist.length ? `，另有 ${waitlist.length} 位候補` : ""}。確認超額加入這位學員？`)) return;
              const data = new FormData(event.currentTarget);
              run(async () => {
                const saved = await saveCourseCustomer({
                  name: data.get("name"),
                  phone: data.get("phone"),
                });
                if (!saved.success) return saved;
                return createCourseTrial({
                  allowOverCapacity,
                  sessionId,
                  customerId: saved.data.id,
                  price: Number(data.get("price")),
                  notes: data.get("notes"),
                  requestKey,
                });
              });
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                姓名
                <input
                  name="name"
                  required
                  maxLength={80}
                  className={`${field} mt-1`}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium">
                手機
                <input
                  name="phone"
                  required
                  maxLength={30}
                  inputMode="tel"
                  placeholder="09xxxxxxxx"
                  className={`${field} mt-1`}
                />
              </label>
            </div>
            <p className="text-sm text-earth-500">
              若手機已存在，請改用「選擇既有顧客」，避免重複建檔。
            </p>
            {priceField}
            {noteField}
            <p className="text-sm text-earth-600">
              建立顧客後會直接加入本堂，並先保留一位名額。
            </p>
          </form>
        )}
      </section>
    );
  }

  return (

    <section className={`flex min-h-0 w-full flex-col gap-2 ${oneToOneMusic ? "" : "flex-1 overflow-hidden"}`}>
      <aside className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm" aria-label={`教師資訊：${teacherName}、${courseName}、${roomName}`}>
        <span className="text-xs text-earth-500">{musicLayout ? "老師" : "授課教練"}</span><strong>{teacherName}</strong>
        {teacherPhone && <a className="inline-flex min-h-11 items-center text-primary-700" href={`tel:${teacherPhone}`}>{teacherPhone}</a>}
        {canEdit ? <button className="min-h-11 max-w-64 truncate text-xs text-earth-600" title={session?.teacherNote || "教師備註"} onClick={() => {setEditingNote({name:teacherName,value:session?.teacherNote??""});setNoteDraft(session?.teacherNote??"");}}>{session?.teacherNote || "備註 ✎"}</button> : session?.teacherNote && <span className="max-w-64 truncate text-xs">{session.teacherNote}</span>}
        {canEdit && <select aria-label="教師出勤狀態" className={`${button} ml-auto bg-white`} disabled={pending || savingBookingIds.length > 0} value={session?.teacherAttendance ?? "SCHEDULED"} onChange={event => {setTeacherDialog(event.target.value as "SCHEDULED" | "LEAVE" | "NO_SHOW");setTeacherReason("");}}><option value="SCHEDULED">正常授課</option><option value="LEAVE">{musicLayout ? "老師" : "教練"}請假</option><option value="NO_SHOW">{musicLayout ? "老師" : "教練"}曠課</option></select>}
        {musicLayout && canEdit && session?.teacherAttendance === "NO_SHOW" && <button className={button} disabled={pending} onClick={() => {setMakeupDate("");setMakeupDialog(true);}}>安排免費補課</button>}
        {session?.teacherAttendanceReason && <span className="w-full text-xs text-earth-600">{session.teacherAttendanceReason}</span>}
      </aside>
      {teacherAbsent && <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">{musicLayout ? "老師" : "教練"}{session?.teacherAttendance === "LEAVE" ? "請假" : "曠課"} · 本堂免點名，已扣額度已返還，預留已釋放。</p>}

      {waitlist.length > 0 && (
        <details name="course-roster-details" className="rounded-lg border border-amber-200 bg-amber-50/60">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-amber-900">
            <span>候補名單 · {waitlist.length} 人</span>
            <span className="text-xs font-normal">依加入順序</span>
          </summary>
          <div className="border-t border-amber-100 px-3 py-2">
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-900">
              <span>目前空位 {Math.max(0, capacity - activeRows.filter(row => row.status !== "CANCELLED").length)}</span>
              <span>開課前 {Math.round((session?.waitlistStopMinutes ?? 240) / 60)} 小時停止自動遞補</span>
            </div>
            <ol className="space-y-1 text-sm text-earth-800">
              {waitlist.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 rounded-md bg-white/80 px-2 py-1.5">
                  <span className="w-10 shrink-0 font-semibold text-amber-900">#{entry.position}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.customerName}</span>
                  {waitlist.filter(item => item.groupKey === entry.groupKey).length > 1 && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">同行</span>
                  )}
                </li>
              ))}
            </ol>
            {canEdit && (
              activeRows.filter(row => row.status !== "CANCELLED").length >= capacity ? (
                <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-amber-900">目前滿班，暫無可遞補名額</p>
              ) : (
                <button
                  type="button"
                  className="mt-3 min-h-10 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 disabled:opacity-50"
                  disabled={pending}
                  onClick={() => run(
                    () => promoteCourseWaitlistManually({ sessionId }),
                    "已依順位處理候補",
                  )}
                >
                  依順位立即遞補
                </button>
              )
            )}
          </div>
        </details>
      )}

      {<RosterToolbar label="上課統計">
        <button
          className={`${button} ${!showCancelled && !rosterFiltered ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
          aria-pressed={!showCancelled && !rosterFiltered}
          onClick={() => {setShowCancelled(false);clearRosterFilters();}}
        >
          上課名單 {activeRows.length}
        </button>
        {!teacherAbsent && waitingCount > 0 && <button type="button" aria-pressed={statusFilter === "pending"} className={`${button} min-h-11 ${statusFilter === "pending" ? "border-primary-500 bg-primary-50 font-semibold text-primary-800" : ""}`} onClick={() => {setShowCancelled(false);setStatusFilter(statusFilter === "pending" ? "all" : "pending");resetFilterSelection();}}>待點名 <strong>{waitingCount}</strong></button>}
        {unpaidTrialCount > 0 && <button type="button" aria-pressed={paymentFilter === "unpaid"} className={`${button} min-h-11 text-amber-800 ${paymentFilter === "unpaid" ? "border-primary-500 bg-primary-50 font-semibold" : ""}`} onClick={() => {setShowCancelled(false);setPaymentFilter(paymentFilter === "unpaid" ? "all" : "unpaid");resetFilterSelection();}}>未收款 {unpaidTrialCount}</button>}
        {musicLayout && groupCohortProgress && <span className="text-xs text-primary-800">整班第 {groupCohortProgress.index}/{groupCohortProgress.count} 堂</span>}
        {(showCancelled || cancelledRows.length > 0) && <button
          className={`${button} ${showCancelled ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`}
          onClick={() => {setShowCancelled(true);setStatusFilter("all");resetFilterSelection();}}
        >
          已取消（{cancelledRows.length}）
        </button>}
        {<input
          className="min-h-11 min-w-48 flex-1 rounded-lg border border-earth-200 px-3 py-1.5 text-sm sm:max-w-[14rem]"
          value={memberQuery}
          onChange={(event) => { setMemberQuery(event.target.value); resetFilterSelection(); }}
          placeholder="搜尋姓名或手機"
          aria-label="搜尋上課學員"
        />}
        <button type="button" className={`${button} ${rosterFiltered ? "border-primary-500 bg-primary-50 text-primary-800" : ""}`} aria-expanded={filtersOpen} aria-controls="roster-filters" onClick={() => setFiltersOpen(value => !value)}>篩選{activeFilterLabels.length > 0 ? ` ${activeFilterLabels.length}` : ""}</button>
        <div id="roster-filters" hidden={!filtersOpen} className={`${filtersOpen ? "flex" : "hidden"} order-last w-full flex-wrap items-end gap-2 rounded-lg border border-primary-200 bg-primary-50/50 px-2 py-1.5`} aria-label="名單篩選條件">
          {!musicLayout && <label className="text-xs font-medium text-earth-700">學員所屬店長<select aria-label="所屬店長篩選" className={rosterFilterClass(assignedFilter)} value={assignedFilter} onChange={event => {setAssignedFilter(event.target.value);resetFilterSelection();}}><option value="all">全部</option>{coachOptions.map(([id,name]) => <option key={id} value={id}>{name}（{activeRows.filter(row => row.assignedCoachId === id).length}）</option>)}<option value="none">未指定（{activeRows.filter(row => !row.assignedCoachId).length}）</option></select></label>}
          <label className="text-xs font-medium text-earth-700">點名狀態<select aria-label="點名狀態篩選" className={rosterFilterClass(statusFilter)} value={statusFilter} onChange={event => {setStatusFilter(event.target.value);resetFilterSelection();}}>{[["all","全部"],["pending","待點名"],["attended","已出席"],["deducted","缺席・扣堂"],["leave","缺席・不扣堂"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-medium text-earth-700">收款狀態<select aria-label="收款狀態篩選" className={rosterFilterClass(paymentFilter)} value={paymentFilter} onChange={event => {setPaymentFilter(event.target.value);resetFilterSelection();}}><option value="all">全部</option><option value="unpaid">體驗未收款</option><option value="paid">體驗已收款</option></select></label>
          <label className="text-xs font-medium text-earth-700">預約類型<select aria-label="預約類型篩選" className={rosterFilterClass(kindFilter)} value={kindFilter} onChange={event => {setKindFilter(event.target.value);resetFilterSelection();}}><option value="all">全部</option><option value="CARD">一般</option><option value="TRIAL">體驗</option><option value="TEACHER_MAKEUP">免費券</option></select></label>
        </div>
        {canEdit && !oneToOneMusic && !showCancelled && !teacherAbsent && activeRows.length > 1 && <button type="button" className={`${button} self-start`} onClick={() => { setBatchMode(!batchMode); setSelected([]); }}>{batchMode ? "結束批次" : "批次點名"}</button>}
        {canEdit && <button type="button" aria-label="課程更多操作" className={`${button} min-w-11`} aria-expanded={!!openActionMenu && !openActionMenu.bookingId} data-roster-action-trigger onClick={event=>toggleRosterMenu(event.currentTarget)}>⋯</button>}
      </RosterToolbar>}

      {rosterFiltered && <div className="flex flex-wrap items-center gap-2 text-xs text-earth-700" role="status"><strong>符合 {scopedRows.filter(row => matchesStatus(row,statusFilter)).length}／全班 {activeRows.length} 位</strong>{activeFilterLabels.map(label => <button type="button" key={label} aria-label={`移除${label}`} className="min-h-11 rounded px-2 text-primary-800" onClick={() => {if(label.startsWith("搜尋：")) setMemberQuery(""); else if(label.startsWith("點名：")) setStatusFilter("all"); else if(label.startsWith("收款：")) setPaymentFilter("all"); else if(label.startsWith("類型：")) setKindFilter("all"); else setAssignedFilter("all"); resetFilterSelection();}}>{label} ×</button>)}<button type="button" className="min-h-11 rounded px-2 font-medium text-primary-800 underline" onClick={clearRosterFilters}>清除篩選</button>{searchedRows.some(row => !matchesStatus(row,statusFilter)) && <span>已操作學員暫留，方便更正</span>}</div>}

      {message && (
        <p
          role="status"
          className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800"
        >
          {message}
        </p>
      )}

      {canEdit && batchMode && !oneToOneMusic && !showCancelled && !teacherAbsent && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-earth-200 bg-earth-50/60 px-3 py-2">
          <label className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              aria-label="全選搜尋結果中可操作的學員"
              checked={selectableRows.length > 0 && chosen.length === selectableRows.length}
              disabled={bulkPending || !selectableRows.length}
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? selectableRows.map((booking) => booking.id)
                    : [],
                )
              }
            />
            全選目前可操作的 {selectableRows.length} 人
          </label>
          <span className="text-sm text-earth-600">已選 {chosen.length} 人</span>
          <select
            aria-label="批次點名狀態"
            className={button}
            value={batchTarget}
            disabled={bulkPending}
            onChange={(event) => {
              setSelected([]);
              setBatchTarget(event.target.value as typeof batchTarget);
            }}
          >
            <option value="ATTENDED">簽到即出席</option>
            <option value="RESERVED">批次恢復待點名</option>
            {musicLayout && <option value="NO_SHOW">批次曠課扣堂</option>}
          </select>
          <button
            type="button"
            className={`${button} border-primary-300 bg-white text-primary-800`}
            disabled={
              bulkPending ||
              !chosen.length
            }
            onClick={() =>
              run(
                () =>
                  updateCourseRosterBatch({
                    sessionId,
                    target: batchTarget,
                    ...(batchTarget === "NO_SHOW" ? { noShowChoice: "DEDUCTED" as const } : {}),
                    bookings: chosen.map((booking) => ({
                      id: booking.id,
                      status: booking.status,
                    })),
                  }),
                `已更新 ${chosen.length} 位學員`,
                batchTarget === "ATTENDED" || batchTarget === "RESERVED" || batchTarget === "NO_SHOW" ? chosen.map(booking=>({bookingId:booking.id,status:batchTarget})) : undefined,
              )
            }
          >
            {bulkPending ? "處理中…" : `${batchTarget === "ATTENDED" ? "點名" : batchTarget === "RESERVED" ? "恢復待點名" : "曠課扣堂"}這 ${chosen.length} 人`}
          </button>
          <span className="ml-auto text-xs text-earth-500">每 60 秒自動更新</span>
        </div>
      )}

      {musicLayout ? (
        <div ref={node=>{if(node && node.scrollTop===0)node.scrollTop=rosterScroll;}} onScroll={event=>setRosterScroll(Math.round(event.currentTarget.scrollTop))} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3 [overflow-anchor:none]">
          <section className="rounded-xl border border-earth-200 bg-white" aria-label="學員">
            <h3 className="sticky top-0 z-10 border-b border-earth-200 bg-earth-50 px-3 py-2 text-sm font-semibold text-earth-800">學員 · {searchedRows.length} 人</h3>
            <ul className="divide-y divide-earth-100">
              {searchedRows.map((booking) => <li key={booking.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 px-3 py-2 text-sm ${largeMusicGroup ? "lg:py-1.5" : ""} ${booking.status === "ATTENDED" ? "border-l-emerald-500" : booking.status === "NO_SHOW" ? "border-l-rose-500" : booking.status === "CANCELLED" && ["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind??"") ? "border-l-violet-500" : "border-l-slate-200"}`}>
                <div className={`flex min-w-0 flex-wrap items-center gap-2 ${largeMusicGroup ? "w-full lg:w-auto lg:flex-none lg:flex-nowrap" : "w-full"}`}>
                  {canEdit && batchMode && !oneToOneMusic && !teacherAbsent && booking.status !== "CANCELLED" && <input type="checkbox" aria-label={`選取 ${booking.customerName}`} checked={selected.includes(booking.id)} disabled={bulkPending || !selectableRows.some((row) => row.id === booking.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, booking.id] : old.filter((id) => id !== booking.id))} />}
                  <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded" aria-label={`${booking.customerName}：${booking.status === "ATTENDED" ? "已出席" : "點名"}`} disabled={!canEdit || pending || savingBookingIds.includes(booking.id) || teacherAbsent} data-roster-action-trigger onClick={event => booking.status === "RESERVED" ? run(() => updateCourseBookingStatus({bookingId:booking.id,status:"ATTENDED"}),`已記錄 ${booking.customerName} 出席`,{bookingId:booking.id,status:"ATTENDED"}) : toggleRosterMenu(event.currentTarget,booking.id)}><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${booking.status === "ATTENDED" ? "border-primary-700 bg-primary-700 text-white" : "border-earth-400"}`}>{booking.status === "ATTENDED" ? "✓" : booking.status === "NO_SHOW" || booking.status === "CANCELLED" ? "−" : ""}</span></button>
                  <div className="min-w-[17rem] flex-1"><CustomerListIdentity showLabels={false} name={<span className="inline-flex flex-wrap items-center gap-x-2"><span>{booking.customerName}</span>{trialBadge(booking)}</span>} phone={booking.customerPhone} /></div>
                  {booking.status !== "RESERVED" && booking.status !== "ATTENDED" && <span className="text-xs text-amber-800">{booking.absenceKind === "TEACHER_ABSENT" ? "本堂免扣" : booking.status === "NO_SHOW" ? "曠課・扣堂" : booking.absenceKind === "STUDENT_LEAVE" ? "請假・不扣堂" : booking.absenceKind === "GROUP_LEAVE_FORFEITED" ? "請假・扣堂" : "已取消"}</span>}
                  {!musicLayout && booking.absenceCount > 0 && <details name="course-roster-details" className="text-xs text-amber-800"><summary className="cursor-pointer">累計缺課 {booking.absenceCount} 次</summary><ul className="mt-1 space-y-1">{booking.absenceHistory.map((item,index)=><li key={`${item.date}-${index}`}>{formatTWDateTime(new Date(item.date))} · {item.status}</li>)}</ul></details>}
                  {booking.bookingKind !== "TRIAL" && booking.termIndex !== null && booking.termCount > 0 && <span className="whitespace-nowrap text-xs font-semibold text-primary-800">{booking.bonusPeriod ? "贈課第" : "本期第"} {booking.termIndex}/{booking.termCount} 堂</span>}
                   {musicLayout && booking.nextPaidLessons !== null && <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">下期已繳 {booking.nextPaidLessons} 堂</span>}
                   {booking.bookingKind !== "TRIAL" && booking.termLeaveCount + booking.termNoShowCount > 0 && <span className="whitespace-nowrap text-xs text-amber-800">此方案請假 {booking.termLeaveCount}・曠課 {booking.termNoShowCount}</span>}


                </div>
                <div className="min-w-[14rem] flex-1 lg:order-1"><RosterReminders booking={booking} canEdit={canEdit} onOpen={()=>setInfoBookingId(booking.id)} onEdit={()=>{setEditingNote({bookingId:booking.id,name:booking.customerName,value:booking.notes});setNoteDraft(booking.notes);}} /></div>
                {savingBookingIds.includes(booking.id) && <span className="self-center whitespace-nowrap text-xs text-primary-700" role="status">儲存中…</span>}
                {canEdit && <div className={`flex min-w-0 gap-1 ${largeMusicGroup ? "ml-auto flex-wrap justify-end lg:order-1 lg:flex-nowrap lg:shrink-0" : "ml-auto flex-wrap"}`}>


                  <button type="button" className="min-h-11 min-w-11 text-earth-600" aria-expanded={openActionMenu?.bookingId === booking.id} data-roster-action-trigger onClick={event=>toggleRosterMenu(event.currentTarget,booking.id)} aria-label={`${booking.customerName} 更多操作`}>⋯</button>
                </div>}
                {booking.bookingKind !== "TRIAL" && (booking.termLessons.length > 0 || booking.termPrivateLeaves.length > 0) && (largeMusicGroup ? <>
                  <button type="button" className="whitespace-nowrap py-1 text-xs text-primary-800 lg:order-2" aria-expanded={expandedLessonIds.includes(booking.id)} aria-controls={`lesson-history-${booking.id}`} onClick={() => { setOpenActionMenu(null); setExpandedLessonIds((ids) => ids.includes(booking.id) ? [] : [booking.id]); }}>{expandedLessonIds.includes(booking.id) ? "▼" : "▶"} 查看日期</button>
                  {expandedLessonIds.includes(booking.id) && <div id={`lesson-history-${booking.id}`} className="w-full text-xs text-earth-700 lg:order-3">
                  {booking.unit === "SESSION" && booking.expiresAt && <p className="mb-2 text-earth-600">方案：{booking.planName} · 尚未安排 {booking.available} 堂 · 期限 {toLocalDateStr(new Date(booking.expiresAt))}</p>}
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {booking.termLessons.map((lesson, index) => <span key={index} className="rounded-md bg-earth-50 px-2 py-1">{index + 1}. {toLocalDateStr(new Date(lesson.date))} {lesson.status === "待上課" && toLocalDateStr(new Date(lesson.date)) === toLocalDateStr() ? "今天" : lesson.status}</span>)}
                     {booking.termCount > booking.termLessons.length && Array.from({length: booking.termCount - booking.termLessons.length}, (_, index) => <span key={`upcoming-${index}`} className="rounded-md bg-earth-50 px-2 py-1 text-earth-500">{booking.termLessons.length + index + 1}. 尚未排課</span>)}
                    {booking.termPrivateLeaves.map((date, index) => <span key={`leave-${index}`} className="rounded-md bg-violet-50 px-2 py-1 text-violet-800">{toLocalDateStr(new Date(date))} 請假・不扣堂</span>)}
                    {booking.termMakeups?.map((item,index)=><span key={`makeup-${index}`} className="rounded-md bg-primary-50 px-2 py-1 text-primary-800">{toLocalDateStr(new Date(item.originalDate))} 請假 → {toLocalDateStr(new Date(item.date))} {item.status}</span>)}
                  </div>
                  <TermPaymentHistory booking={booking} />
                  </div>}
                </> : <details name="course-roster-details" className="w-full text-xs text-earth-700">
                  <summary className="cursor-pointer whitespace-nowrap py-1 text-primary-800">查看本期上課日期</summary>
                  {booking.unit === "SESSION" && booking.expiresAt && <p className="mb-2 text-earth-600">方案：{booking.planName} · 尚未安排 {booking.available} 堂 · 期限 {toLocalDateStr(new Date(booking.expiresAt))}</p>}
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {booking.termLessons.map((lesson, index) => <span key={index} className="rounded-md bg-earth-50 px-2 py-1">{index + 1}. {toLocalDateStr(new Date(lesson.date))} {lesson.status === "待上課" && toLocalDateStr(new Date(lesson.date)) === toLocalDateStr() ? "今天" : lesson.status}</span>)}
                     {booking.termCount > booking.termLessons.length && Array.from({length: booking.termCount - booking.termLessons.length}, (_, index) => <span key={`upcoming-${index}`} className="rounded-md bg-earth-50 px-2 py-1 text-earth-500">{booking.termLessons.length + index + 1}. 尚未排課</span>)}
                    {booking.termPrivateLeaves.map((date, index) => <span key={`leave-${index}`} className="rounded-md bg-violet-50 px-2 py-1 text-violet-800">{toLocalDateStr(new Date(date))} 請假・不扣堂</span>)}
                    {booking.termMakeups?.map((item,index)=><span key={`makeup-${index}`} className="rounded-md bg-primary-50 px-2 py-1 text-primary-800">{toLocalDateStr(new Date(item.originalDate))} 請假 → {toLocalDateStr(new Date(item.date))} {item.status}</span>)}
                  </div>
                  <TermPaymentHistory booking={booking} />
                </details>)}
              </li>)}
              {!searchedRows.length && <li className="p-8 text-center text-sm text-earth-500">{rosterFiltered ? "目前條件沒有符合的學員" : "尚未加入學員"}</li>}
            </ul>
          </section>

        </div>
      ) : <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-earth-200 [overflow-anchor:none]" aria-label="學員名單捲動區" tabIndex={0}>
        <div className="grid min-w-[960px] grid-cols-[minmax(20rem,2fr)_6rem_5rem_5rem_minmax(16rem,2fr)_3rem] items-center gap-2 sticky top-0 z-10 bg-earth-50 px-3 py-2 text-xs font-medium text-earth-600">
          <span>學員／電話</span><span>所屬店長</span><span className="text-center">本堂點數</span><span className="text-center">本方案課後剩餘</span><span>標籤／備註</span><span />
        </div>
        <ul className="min-w-[960px] divide-y divide-earth-100">
          {searchedRows.map(booking => {
            const leave = ["STUDENT_LEAVE", "GROUP_LEAVE_FORFEITED"].includes(booking.absenceKind ?? "");
            const deducted = booking.absenceKind === "GROUP_LEAVE_FORFEITED" || booking.status === "NO_SHOW";
            const label = booking.absenceKind === "TEACHER_ABSENT" ? "本堂免扣" : booking.status === "ATTENDED" ? "已出席" : leave ? (booking.absenceKind === "GROUP_LEAVE_FORFEITED" ? "缺席・扣堂" : "缺席・不扣堂") : booking.status === "NO_SHOW" ? (booking.bookingKind === "TRIAL" ? "缺席" : "缺席・扣堂") : booking.status === "CANCELLED" ? "已取消" : "待點名";
            // Shared members see the same balance after every reserved member of this class is settled.
            const classCost = roster.filter(row => row.cardId && row.cardId === booking.cardId && row.status === "RESERVED").reduce((sum, row) => sum + row.pointCost, 0);
            const after = booking.cardRemaining == null ? null : booking.cardRemaining - classCost;
            return <li key={booking.id} className={`grid grid-cols-[minmax(20rem,2fr)_6rem_5rem_5rem_minmax(16rem,2fr)_3rem] ${rosterRowClassName}`}>
              <div className="flex min-w-0 items-center gap-1">
                {batchMode && canEdit && booking.status !== "CANCELLED" && <input type="checkbox" aria-label={`選取 ${booking.customerName}`} checked={selected.includes(booking.id)} disabled={bulkPending} onChange={event => setSelected(old => event.target.checked ? [...old, booking.id] : old.filter(id => id !== booking.id))} />}
                <button type="button" className={rosterStatusButtonClassName} aria-label={`${booking.customerName}：${label}`} title={booking.status === "RESERVED" ? "標記出席" : "更正點名"} disabled={!canEdit || pending || savingBookingIds.includes(booking.id) || teacherAbsent || (booking.status === "CANCELLED" && !leave)} data-roster-action-trigger onClick={event => booking.status === "RESERVED" ? run(() => updateCourseBookingStatus({bookingId:booking.id,status:"ATTENDED"}), `已將 ${booking.customerName} 標記出席`, {bookingId:booking.id,status:"ATTENDED"}) : toggleRosterMenu(event.currentTarget, booking.id)}><span aria-hidden="true" className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${booking.status === "ATTENDED" ? "border-primary-700 bg-primary-700 text-white" : deducted ? "border-amber-600 text-amber-700" : leave ? "border-earth-400 text-earth-600" : "border-earth-400"}`}>{booking.status === "ATTENDED" ? "✓" : leave || booking.status === "NO_SHOW" ? "−" : booking.status === "CANCELLED" ? "×" : ""}</span></button>
                <div className="min-w-0 flex-1"><CustomerListIdentity showLabels={false} name={<span data-roster-name-flow className="inline-flex min-w-0 max-w-full flex-nowrap items-center gap-x-2"><button type="button" className="relative z-20 h-6 min-w-0 flex-1 text-left after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-primary-600" aria-label={`${booking.customerName} 預約詳情`} onClick={()=>setInfoBookingId(booking.id)}><span className="block truncate">{booking.customerName}</span></button><CourseBookingContextIndicator name={booking.customerName} shared={sharedCardState!=="HIDDEN"&&booking.sharedCard} proxy={!!booking.operatorCustomerId&&booking.operatorCustomerId!==booking.customerId&&!booking.companionIndex} onOpen={()=>setInfoBookingId(booking.id)}/>{(leave || booking.status === "NO_SHOW" || booking.status === "CANCELLED") && <span className={`min-w-0 truncate text-xs font-normal ${deducted ? "text-amber-700" : "text-earth-600"}`}>{label}</span>}{trialBadge(booking)}</span>} phone={booking.customerPhone} />

                </div>
              </div>
              <span className="text-xs text-earth-600">{booking.assignedCoachName || ""}</span>
              <span className="text-center tabular-nums">{booking.bookingKind === "TRIAL" ? "" : booking.bookingKind === "TEACHER_MAKEUP" ? "免費券" : <>{booking.pointCost}{booking.unit === "SESSION" && <span className="ml-1 text-xs">堂</span>}</>}</span>
              <span className={`text-center tabular-nums ${after != null && after <= 0 ? "text-amber-700" : ""}`} title="本堂全部共卡預約扣點後的餘額；其他堂預約尚未扣點">{after == null ? "" : after < 0 ? "不足" : after}</span>
              <RosterReminders booking={booking} canEdit={canEdit} onOpen={()=>setInfoBookingId(booking.id)} onEdit={()=>{setEditingNote({bookingId:booking.id,name:booking.customerName,value:booking.notes});setNoteDraft(booking.notes);}} />
              {canEdit && <button type="button" className="min-h-11 min-w-11 rounded text-earth-600 hover:bg-earth-100" aria-label={`${booking.customerName} 更多操作`} aria-expanded={openActionMenu?.bookingId === booking.id} data-roster-action-trigger onClick={event => toggleRosterMenu(event.currentTarget,booking.id)}>⋯</button>}
            </li>;
          })}
          {!searchedRows.length && <li className="p-8 text-center text-sm text-earth-500">{rosterFiltered ? "目前條件沒有符合的學員" : "尚未加入學員"}</li>}
        </ul>
        {activeRows.length > 0 && <p className="px-3 py-1 text-[11px] text-earth-500">○ 待點名　✓ 出席　課後剩餘＝本堂扣點後餘額</p>}
      </div>}



      {infoBookingId && (()=>{const booking=roster.find(row=>row.id===infoBookingId);if(!booking)return null;
        if(!musicLayout) return <ModalPanel open onClose={()=>setInfoBookingId(null)} labelledById="course-roster-info-title" width={512}>
          <header className="flex items-center justify-between gap-3 border-b border-earth-100 px-4 py-2"><h3 id="course-roster-info-title" className="min-w-0 break-words font-semibold">{booking.customerName} · 預約詳情</h3><button type="button" className={button} onClick={()=>setInfoBookingId(null)}>關閉</button></header>
          <div className="min-h-0 space-y-4 overflow-y-auto p-4 text-sm">
            <div><h4 className="text-earth-500">使用方案</h4><p className="break-words">{booking.planName}</p>{booking.sharedCard && <p>共卡：此方案由既有授權成員共用餘額。</p>}</div>
            <div><h4 className="text-earth-500">預約來源</h4><p className="break-words">{booking.bookingSource}</p>{!!booking.operatorCustomerId && booking.operatorCustomerId!==booking.customerId && !booking.companionIndex && <p>代約：由 {booking.operatorName || "已授權成員"} 協助預約，上課人為 {booking.customerName}；不會新增共卡授權。</p>}<p>{formatTWDateTime(new Date(booking.createdAt))}</p></div>
            {booking.customerId && <CustomerLabels customerId={booking.customerId} readOnly={!canEdit}/>}
            <div><h4 className="text-earth-500">店內備註</h4><p className="whitespace-pre-wrap break-words">{booking.serviceNote?.trim() || "尚無備註"}</p></div>
            <div><h4 className="text-earth-500">本次備註</h4><p className="whitespace-pre-wrap break-words">{booking.notes?.trim() || "尚無備註"}</p></div>
            {canEdit && booking.status!=="CANCELLED" && <button type="button" className={button} onClick={()=>{setInfoBookingId(null);setEditingNote({bookingId:booking.id,name:booking.customerName,value:booking.notes});setNoteDraft(booking.notes);}}>編輯本次備註</button>}
          </div>
        </ModalPanel>;
        return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`${booking.customerName} 標籤與備註`}><div className="max-h-[85dvh] w-full max-w-lg space-y-4 overflow-auto rounded-xl bg-white p-5 shadow-xl"><h3 className="font-semibold">{booking.customerName} · 標籤與備註</h3><div className="text-sm"><span className="text-xs text-earth-500">預約時間</span><p>{formatTWDateTime(new Date(booking.createdAt))} · {booking.operatorName || "學員自約"}</p></div>{booking.customerId && <CustomerLabels customerId={booking.customerId} readOnly={!canEdit} />}<div><h4 className="text-xs text-earth-500">店內備註</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm">{booking.serviceNote?.trim() || "尚無備註"}</p></div><div><h4 className="text-xs text-earth-500">本次備註</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm">{booking.notes?.trim() || "尚無備註"}</p></div><div className="flex justify-end gap-2">{canEdit && booking.status !== "CANCELLED" && <button type="button" className={button} onClick={()=>{setInfoBookingId(null);setEditingNote({bookingId:booking.id,name:booking.customerName,value:booking.notes});setNoteDraft(booking.notes);}}>編輯本次備註</button>}<button type="button" className={button} onClick={()=>setInfoBookingId(null)}>關閉</button></div></div></div>;})()}

      {paymentMenu && (() => {
        const booking = roster.find(row => row.id === paymentMenu);
        const payment = booking?.trialPayments.find(item => item.status === "SUCCESS");
        if (!booking || !payment) return null;
        return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="roster-payment-title"><div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl"><h3 id="roster-payment-title" className="font-semibold">{booking.customerName} 收款</h3><p className="my-3">已收 ${payment.amount}</p><div className="flex flex-wrap gap-2">{booking.status === "RESERVED" && trial?.canCorrect && <button className={button} disabled={pending} onClick={() => {setPaymentMenu(null);setRequestKey(crypto.randomUUID());setCorrectPayment(true);setPaymentBooking(booking.id);}}>更正收款</button>}{trial?.canCorrect && <button className={`${button} text-red-700`} disabled={pending} onClick={() => {const reason=window.prompt("請輸入作廢原因");if(reason?.trim()){setPaymentMenu(null);run(() => voidCourseTrialPayment({paymentId:payment.id,reason:reason.trim()}));}}}>作廢收款</button>}<button className={button} onClick={() => setPaymentMenu(null)}>關閉</button></div></div></div>;
      })()}

      {noShowBooking && !musicLayout && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-no-show-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="course-no-show-title" className="text-lg font-semibold">
                  {noShowBooking.name} 未到處理
                </h3>
                <p className="mt-1 text-sm text-earth-600">
                  {noShowBooking.trial
                    ? "體驗客沒有方案額度，將只記錄未到。"
                    : "請選擇本次未到的扣堂方式。"}
                </p>
              </div>
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() => setNoShowBooking(null)}
              >
                關閉
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                className={`${button} w-full text-left`}
                disabled={pending}
                onClick={() => {
                  const booking = noShowBooking;
                  setNoShowBooking(null);
                  run(
                    () =>
                      updateCourseBookingStatus({
                        bookingId: booking.id,
                        status: "NO_SHOW",
                        noShowChoice: "DEDUCTED",
                      }),
                    booking.trial
                      ? `已將 ${booking.name} 標記未到`
                      : `已將 ${booking.name} 標記未到並扣除本次額度`,
                    {bookingId:booking.id,status:"NO_SHOW"},
                  );
                }}
              >
                <strong className="block">
                  {noShowBooking.trial ? "標記體驗客未到" : "未到扣堂"}
                </strong>
                <span className="text-xs text-earth-600">
                  {noShowBooking.trial
                    ? "只記錄未到，不扣方案，也不發補課券。"
                    : "扣除本次方案額度，不發補課券。"}
                </span>
              </button>
              {!noShowBooking.trial && !noShowBooking.term && (
                <button
                  type="button"
                  className={`${button} w-full border-primary-500 text-left`}
                  disabled={pending}
                  onClick={() => {
                    const booking = noShowBooking;
                    setNoShowBooking(null);
                    run(
                      () =>
                        updateCourseBookingStatus({
                          bookingId: booking.id,
                          status: "NO_SHOW",
                          noShowChoice: "DEDUCTED_WITH_MAKEUP",
                        }),
                      `已將 ${booking.name} 標記未到，並發放 7 日補課券`,
                      {bookingId:booking.id,status:"NO_SHOW"},
                    );
                  }}
                >
                  <strong className="block">未到扣堂＋發補課券</strong>
                  <span className="text-xs text-earth-600">
                    扣除本次方案額度，補課券 7 日內有效。
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {studentLeave && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="學員請假">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"><h3 className="text-lg font-semibold">記錄 {studentLeave.name} {musicLayout ? "請假" : "缺席・不扣堂"}？</h3><p className="mt-2 text-sm text-earth-600">{musicLayout && classType === "GROUP" ? "團體課請假會扣一堂且不補課；保留請假日期、累計缺課，老師照原課計費。" : "保留本堂請假日期與紀錄；未扣堂，可在方案期限內另約補課，並計入累計缺課次數。"}</p><div className="mt-5 flex justify-end gap-2"><button className={button} onClick={()=>setStudentLeave(null)}>返回</button><button className={primaryButton} disabled={pending} onClick={()=>{const booking=studentLeave;setStudentLeave(null);run(()=>updateCourseBookingStatus({bookingId:booking.id,status:"STUDENT_LEAVE"}),`已記錄 ${booking.name} 請假`,{bookingId:booking.id,status:"CANCELLED",absenceKind:musicLayout && classType==="GROUP"?"GROUP_LEAVE_FORFEITED":"STUDENT_LEAVE"});}}>確認請假</button></div></div>
      </div>}
      {teacherDialog && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="老師出勤紀錄">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"><h3 className="text-lg font-semibold">{teacherDialog === "SCHEDULED" ? "恢復授課" : `記錄${musicLayout ? "老師" : "教練"}${teacherDialog === "NO_SHOW" ? "曠課" : "請假"}`}</h3><p className="mt-2 text-sm text-earth-600">{teacherDialog === "SCHEDULED" ? `恢復全班 ${count} 位學員為待點名，不自動重扣額度；原始操作紀錄保留。` : `影響全班 ${count} 位學員：返還本堂已扣額度、釋放預留，不計學員缺席；體驗收款保留。`}</p>{teacherDialog !== "SCHEDULED" && <textarea className={`${field} mt-3 min-h-20`} placeholder="原因（選填）" value={teacherReason} maxLength={500} onChange={event=>setTeacherReason(event.target.value)} />}<div className="mt-5 flex justify-end gap-2"><button className={button} onClick={()=>setTeacherDialog(null)}>返回</button><button className={primaryButton} disabled={pending} onClick={()=>{const status=teacherDialog;setTeacherDialog(null);run(()=>markCourseTeacherAttendance({sessionId,status,reason:teacherReason,expectedStatus:session?.teacherAttendance ?? "SCHEDULED"}),"老師出勤紀錄已更新",undefined,status);}}>儲存</button></div></div>
      </div>}
      {makeupDialog && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label="安排免費補課">
        <form className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onSubmit={event=>{event.preventDefault();setMakeupDialog(false);run(()=>scheduleTeacherMakeup({sourceSessionId:sessionId,date:makeupDate,time:makeupTime,coachId,roomId}),"免費補課已加入課表，不計入原課程期數");}}><h3 className="text-lg font-semibold">老師曠課 · 安排免費補課</h3><p className="mt-2 text-sm text-earth-600">為本堂學員排一堂免費課；原課期數不會增加。預設沿用原老師與教室。</p><label className="mt-4 block text-sm">補課日期<input className={`${field} mt-1`} type="date" required value={makeupDate} onChange={event=>setMakeupDate(event.target.value)} /></label><label className="mt-3 block text-sm">開始時間<input className={`${field} mt-1`} type="time" required step="1800" value={makeupTime} onChange={event=>setMakeupTime(event.target.value)} /></label><div className="mt-5 flex justify-end gap-2"><button type="button" className={button} onClick={()=>setMakeupDialog(false)}>取消</button><button type="submit" className={primaryButton} disabled={pending || !makeupDate || !coachId || !roomId}>加入課表</button></div></form>
      </div>}
      {cancelBooking && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-cancel-booking-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="course-cancel-booking-title" className="text-lg font-semibold">
              取消 {cancelBooking.name} 的預約？
            </h3>
            <p className="mt-2 text-sm text-earth-600">
              僅取消本堂預約。{cancelBooking.status === "CANCELLED" ? "清除本堂請假紀錄。" : "釋放本堂名額。"}返還或釋放 {cancelBooking.refund} {cancelBooking.unit}，體驗收款保持原紀錄。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() => setCancelBooking(null)}
              >
                返回
              </button>
              <button
                type="button"
                className={primaryButton}
                disabled={pending}
                onClick={() => {
                  const booking = cancelBooking;
                  setCancelBooking(null);
                  run(
                    () =>
                      updateCourseBookingStatus({
                        bookingId: booking.id,
                        status: "CANCELLED",
                        expectedStatus: booking.status,
                      }),
                    `已取消 ${booking.name} 的預約，並釋放名額與方案額度`,
                    {bookingId:booking.id,status:"CANCELLED"},
                  );
                }}
              >
                確認取消並退還名額
              </button>
            </div>
          </div>
        </div>
      )}

      {editingNote && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-label={`${editingNote.name}${editingNote.bookingId ? "本次備註" : "教師備註"}`}>
        <form className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onSubmit={(event)=>{event.preventDefault();const target=editingNote;run(()=>saveCourseRosterNote({sessionId,bookingId:target.bookingId,note:noteDraft}),"備註已儲存");setEditingNote(null);}}>
          <h3 className="text-lg font-semibold">{editingNote.name} · {editingNote.bookingId ? "本次備註" : "教師備註"}</h3>
          <textarea autoFocus className={`${field} mt-3 min-h-28`} value={noteDraft} maxLength={1000} onChange={(event)=>setNoteDraft(event.target.value)} placeholder="記錄本次上課需要留意的事項" />
          <div className="mt-4 flex justify-end gap-2"><button type="button" className={button} onClick={()=>setEditingNote(null)}>取消</button><button type="submit" className={primaryButton} disabled={pending}>儲存</button></div>
        </form>
      </div>}
      {purchaseFor && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true" aria-label="學員繳費">
        <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-earth-200 p-4"><div><h3 className="font-semibold">學員繳費 · {purchaseOptions?.customerName ?? roster.find((row) => row.id === purchaseFor)?.customerName}</h3><p className="text-sm text-earth-600">完成後保留在這堂課的名單</p></div><button type="button" className={button} disabled={purchasePending} onClick={() => {setPurchaseFor(null);setPurchaseOptions(null);setPurchaseError("");}}>關閉</button></div>
          <div className="min-h-0 overflow-y-auto p-4">
            {purchaseError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{purchaseError}</p>}
            {!purchaseOptions && !purchaseError && <p role="status">讀取購買方案中…</p>}
            {purchaseOptions && <form id="course-roster-purchase-form" className="space-y-4" onSubmit={(event) => {
              event.preventDefault();
              if (!purchaseSummary.valid || !purchasePlanId || purchasePending) return;
              const fields = new FormData(event.currentTarget);
              setPurchasePending(true);
              setPurchaseError("");
              void assignCoursePointCard({
                planId: purchasePlanId,
                customerId: purchaseOptions.customerId,
                expiresDate: "2099-12-31",
                musicPurchaseTerms:Number(fields.get("musicPurchaseTerms")??1),
                      musicValidityDays:fields.get("musicValidityDays")?Number(fields.get("musicValidityDays")):undefined,
                      musicManualBonus:Number(fields.get("musicManualBonus")??0),
                musicJoinSessionId:String(fields.get("musicJoinSessionId")??"")||undefined,
                expectedListPrice: Number(fields.get("expectedListPrice")),
                expectedStoreCost: Number(fields.get("expectedStoreCost")),
                revenueStaffId: "",
                discountKind: fields.get("discountKind"),
                discountValue: Number(fields.get("discountValue")),
                paymentMethod: fields.get("paymentMethod"),
                transferLastFour: String(fields.get("transferLastFour") ?? ""),
                requestKey: purchaseKey,
              }).then(async (result) => {
                if (!result.success) { setPurchaseError(result.error); return; }
                setPurchaseFor(null);
                setPurchaseOptions(null);
                setMessage(`${purchaseOptions.customerName} 的購買及收款已登記`);
                await load();
                router.refresh();
              }).catch(() => setPurchaseError("結果待確認，請核對購買紀錄後再操作。")).finally(() => setPurchasePending(false));
            }}>
              {purchaseOptions.plans.length ? <><label className="block text-sm font-medium">課程方案<select className={field} value={purchasePlanId} onChange={(event) => {setPurchasePlanId(event.target.value);setPurchaseSummary({paid:null,valid:false});}}>{purchaseOptions.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.points} 堂</option>)}</select></label>
              {purchaseOptions.plans.filter((plan) => plan.id === purchasePlanId).map((plan) => <MusicAssignmentPayment key={plan.id} plan={plan} canDiscount={purchaseOptions.canDiscount} onSummary={setPurchaseSummary}/>)}</> : <p className="text-sm text-earth-600">此課程尚未上架可購買的堂數方案。</p>}
            </form>}
          </div>
          {purchaseOptions?.plans.length ? <div className="flex justify-end border-t border-earth-200 p-4"><button className={primaryButton} type="submit" form="course-roster-purchase-form" disabled={purchasePending || !purchasePlanId || !purchaseSummary.valid}>{purchasePending ? "處理中…" : "確認已收款並建立方案"}</button></div> : null}
        </div>
      </div>}
      {payBooking && paymentSettings && !correctPayment && (
        <CollectTrialModal
          key={payBooking.id}
          open
          onClose={() => setPaymentBooking(null)}
          bookingId={payBooking.id}
          customerName={payBooking.customerName}
          dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""}
          expectedAmount={payBooking.trialPrice}
          people={1}
          attendedPeople={null}
          settings={paymentSettings}
          courseMode
          saveAction={(data) => collectCourseTrial({ ...data, requestKey })}
          onCollected={() => {
            setPaymentBooking(null);
            void load();
            router.refresh();
          }}
        />
      )}
      {payBooking && paymentSettings && correctPayment && receipt && (
        <CorrectTrialCollectionModal
          key={receipt.id}
          open
          onClose={() => setPaymentBooking(null)}
          bookingId={payBooking.id}
          originalTransactionId={receipt.id}
          customerName={payBooking.customerName}
          dateLabel={session ? formatTWDateTime(new Date(session.startsAt)) : ""}
          originalAmount={receipt.amount}
          originalMethod={receipt.paymentMethod}
          originalDate={formatTWDateTime(new Date(receipt.createdAt))}
          people={1}
          attendedPeople={null}
          settings={paymentSettings}
          saveAction={(data) =>
            collectCourseTrial({
              ...data,
              originalPaymentId: data.originalTransactionId,
              requestKey,
            })
          }
          onCorrected={() => {
            setPaymentBooking(null);
            void load();
            router.refresh();
          }}
        />
      )}

      {companionEditor && (!companionEditor.add || sharedCardState === "ENABLED") && <CourseCompanionEditor {...companionEditor} onClose={() => setCompanionEditor(null)} onSaved={() => {void load(); router.refresh();}} />}
      {openActionMenu && typeof document !== "undefined" && createPortal(<>
        <div data-roster-action-menu className="fixed z-[141] flex w-48 flex-col gap-1 rounded-lg border border-earth-200 bg-white p-2 text-sm shadow-xl" role="menu" style={{ top: openActionMenu.top, left: openActionMenu.left }}>
          {actionBooking ? <>
            {canEdit && !musicLayout && actionBooking.status !== "CANCELLED" && (actionBooking.companionIndex || (canCreate && sharedCardState === "ENABLED" && actionBooking.canAddCompanion)) && <button type="button" role="menuitem" className={button} onClick={() => {setOpenActionMenu(null); setCompanionEditor({bookingId: actionBooking.id, add: !actionBooking.companionIndex});}}>{actionBooking.companionIndex ? "變更使用方式" : "新增同行"}</button>}
            {canEdit && !musicLayout && !teacherAbsent && actionBooking.status === "RESERVED" && <><button type="button" role="menuitem" className={button} onClick={() => {setOpenActionMenu(null);setNoShowBooking({id:actionBooking.id,name:actionBooking.customerName,trial:actionBooking.bookingKind === "TRIAL",term:actionBooking.termCount > 0});}}>缺席・扣堂</button><button type="button" role="menuitem" className={button} onClick={() => {setOpenActionMenu(null);setStudentLeave({id:actionBooking.id,name:actionBooking.customerName});}}>缺席・不扣堂</button></>}
            {canEdit && !musicLayout && !teacherAbsent && (actionBooking.status === "ATTENDED" || actionBooking.status === "NO_SHOW" || ["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(actionBooking.absenceKind ?? "")) && <button type="button" role="menuitem" className={button} onClick={() => {setOpenActionMenu(null);run(() => updateCourseRosterBatch({sessionId,target:"RESERVED",bookings:[{id:actionBooking.id,status:actionBooking.status}]}),`已恢復 ${actionBooking.customerName} 待點名`,{bookingId:actionBooking.id,status:"RESERVED"});}}>恢復待點名</button>}
            <button type="button" role="menuitem" className={button} onClick={()=>{setOpenActionMenu(null);setInfoBookingId(actionBooking.id);}}>標籤與備註</button>
            <button type="button" role="menuitem" className={button} onClick={() => {setOpenActionMenu(null);setInfoBookingId(actionBooking.id);}}>預約紀錄</button>{canEdit && <OperationHistoryButton targetType="CourseBooking" targetId={actionBooking.id} />}

            {musicLayout && canEdit && actionBooking.status === "RESERVED" && !teacherAbsent && <><button role="menuitem" className={button} disabled={pending} onClick={() => {setOpenActionMenu(null);run(() => updateCourseBookingStatus({bookingId:actionBooking.id,status:"NO_SHOW",noShowChoice:"DEDUCTED"}),`已記錄 ${actionBooking.customerName} 曠課`,{bookingId:actionBooking.id,status:"NO_SHOW"});}}>曠課・扣堂</button><button role="menuitem" className={button} onClick={() => {setOpenActionMenu(null);setStudentLeave({id:actionBooking.id,name:actionBooking.customerName});}}>請假</button></>}
            {musicLayout && canEdit && !teacherAbsent && (actionBooking.status === "ATTENDED" || actionBooking.status === "NO_SHOW" || ["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"].includes(actionBooking.absenceKind ?? "")) && <button role="menuitem" className={button} disabled={pending} onClick={() => {setOpenActionMenu(null);run(() => updateCourseRosterBatch({sessionId,target:"RESERVED",bookings:[{id:actionBooking.id,status:actionBooking.status}]}),`已恢復 ${actionBooking.customerName} 待點名`,{bookingId:actionBooking.id,status:"RESERVED"});}}>恢復待點名</button>}
            {canPurchase && actionBooking.customerId && actionBooking.bookingKind !== "TRIAL" && <button type="button" role="menuitem" className="min-h-10 rounded px-2 text-left text-primary-800 hover:bg-primary-50" onClick={() => { setOpenActionMenu(null); void openStudentPurchase(actionBooking.id); }}>學員繳費</button>}
            {canEdit && !teacherAbsent && <button type="button" role="menuitem" className="min-h-10 rounded px-2 text-left text-red-700 hover:bg-red-50" disabled={pending} onClick={() => { setOpenActionMenu(null); setCancelBooking({ id: actionBooking.id, name: actionBooking.customerName, status: actionBooking.status as "RESERVED" | "ATTENDED" | "NO_SHOW" | "CANCELLED", refund: actionBooking.pointCost, unit: actionBooking.unit === "SESSION" ? "堂" : "點" }); }}>取消本堂</button>}
            {canEdit && actionBooking.customerId && !actionBooking.companionIndex && actionBooking.bookingKind !== "TRIAL" && <button type="button" role="menuitem" className="min-h-10 rounded px-2 text-left text-red-700 hover:bg-red-50" disabled={pending} onClick={() => { setOpenActionMenu(null); void openFutureStop(actionBooking.id, actionBooking.customerName); }}>退出後續課程</button>}
          </> : !openActionMenu.bookingId ? <>
            <button type="button" role="menuitem" className="min-h-10 rounded px-2 text-left text-red-700 hover:bg-red-50" disabled={pending} onClick={() => { setOpenActionMenu(null); setConfirmCancel(true); }}>取消本堂</button>
            <button type="button" role="menuitem" className="min-h-10 rounded px-2 text-left text-red-700 hover:bg-red-50" disabled={pending} onClick={() => { setOpenActionMenu(null); void openFutureStop(undefined, "整班"); }}>停止後續排課</button>
          </> : null}
        </div>
      </>, document.body)}
      {canEdit && futureStopTarget && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="course-future-stop-title">
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <h3 id="course-future-stop-title" className="text-lg font-semibold">{futureStopTarget.bookingId ? `${futureStopTarget.name} 停課？` : "整班停課？"}</h3>
          <label className="mt-3 block text-sm">生效日期<input type="date" aria-label="停課生效日期" className={`${field} mt-1`} value={futureEffectiveDate} onChange={event => {void openFutureStop(futureStopTarget.bookingId, futureStopTarget.name, event.target.value);}} /></label><p className="mt-1 text-xs text-earth-500">留空則停止本堂之後的已排課。</p>
          {futureStopPending && <p role="status" className="mt-3 text-sm text-earth-600">正在核對後續已排課…</p>}
          {futureStopError && <p role="alert" className="mt-3 text-sm text-red-700">{futureStopError}</p>}
          {futureStopPreview && <p className="mt-3 text-sm text-earth-700">
            {futureStopTarget.bookingId
              ? `將移除 ${futureStopTarget.name} 在此班後續 ${futureStopPreview.bookingIds.length} 堂的預約；其他學員照常上課。`
              : `將取消此班後續 ${futureStopPreview.sessionIds.length} 堂課，影響 ${futureStopPreview.bookingIds.length} 筆學員預約。`}
            已上課與本堂紀錄保留，未使用堂數保留在原方案；退款另行處理。
          </p>}
          {futureStopPreview && !(futureStopTarget.bookingId ? futureStopPreview.bookingIds.length : futureStopPreview.sessionIds.length) && <p className="mt-2 text-sm text-earth-600">目前沒有後續已排課可停止。</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={button} disabled={pending} onClick={() => setFutureStopTarget(null)}>返回</button>
            {futureStopPreview && !!(futureStopTarget.bookingId ? futureStopPreview.bookingIds.length : futureStopPreview.sessionIds.length) && <button type="button" className={`${button} border-red-300 text-red-700`} disabled={pending} onClick={() => {
              const target = futureStopTarget;
              const preview = futureStopPreview;
              setFutureStopTarget(null);
              run(() => stopFutureCourseLessons({
                sessionId, bookingId: target.bookingId, effectiveDate: futureEffectiveDate || undefined,
                expectedSessionIds: preview.sessionIds,
                expectedBookingIds: preview.bookingIds,
              }), target.bookingId ? `已停止 ${target.name} 的後續預約` : "已停止整班後續排課");
            }}>確認停課</button>}
          </div>
        </div>
      </div>}
      {canEdit && confirmCancel && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="course-stop-title">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
          <h3 id="course-stop-title" className="text-lg font-semibold">取消本堂課？</h3><p className="mt-2 text-sm text-red-700">影響全班 {activeRows.length} 人，與目前篩選條件無關。</p>
          <p className="mt-2 text-sm text-earth-600">將取消這一堂課，影響 {count} 位學員；未完成預約會釋放額度，紀錄保留。後續堂數不受影響。</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={button} disabled={pending} onClick={() => setConfirmCancel(false)}>返回</button>
            <button type="button" className={`${button} border-red-300 text-red-700`} disabled={pending} onClick={() => { setConfirmCancel(false); run(() => cancelCourseSession({ sessionId, expectedBookings: roster.filter(booking => booking.status !== "CANCELLED").length }), "已取消本堂課"); }}>確認取消本堂課</button>
          </div>
        </div>
      </div>}

    </section>
  );
}
