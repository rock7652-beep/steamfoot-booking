"use client";
import { ShareReferral } from "@/components/share-referral";
import { trackCourseShare } from "@/server/actions/course-referral-share";
import { COURSE_REFUND_METHOD_LABELS } from "@/lib/course-refund-display";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SteamButlerLogo } from "@/components/steam-butler-logo";
import { logoutAction } from "@/server/actions/auth";
import { LogoutButton } from "@/components/logout-button";
import {
  courseDate,
  courseMonthDays,
  courseMemberMarkers,
} from "@/lib/course-calendar";
import {
  addTaiwanDuration,
  parseLocalDate,
  toLocalDateStr,
  formatTWDateTime,
} from "@/lib/date-utils";
import {
  createMemberCourseBooking,
  updateCourseBookingStatus,
} from "@/server/actions/course-members";
import {
  saveCourseAttendance,
  saveCourseCoachNote,
  purchaseCoursePlan,
} from "@/server/actions/course-portal";
import type { CoursePortalData } from "./course-portal";
import { CourseMemberContactForm } from "@/components/course-member-contact-form";
import { CourseHealthWorkspace } from "@/components/course-health-workspace";
import { CopyButton } from "./shop/[planId]/checkout/copy-button";
import "./course-portal.css";
type Session = CoursePortalData["sessions"][number];
type Work = CoursePortalData["work"][number];
type AttendanceUpdate = Pick<Work["bookings"][number], "id" | "status" | "checkedIn" | "updatedAt">;
type Page =
  | "home"
  | "schedule"
  | "bookings"
  | "account"
  | "plans"
  | "shop"
  | "orders"
  | "shared"
  | "health"
  | "store"
  | "guide"
  | "records";
const statusName = (s: string) =>
  ({
    RESERVED: "待上課",
    ATTENDED: "已出席",
    NO_SHOW: "未到",
    CANCELLED: "已取消",
  })[s] ?? s;
const unit = (s: string) => (s === "SESSION" ? "堂" : "點");
const time = (s: string) =>
  formatTWDateTime(new Date(s)).split(" ").slice(-1)[0];
type PortalIconName = "home" | "calendar" | "bookings" | "account" | "records";
function PortalIcon({ name }: { name: PortalIconName }) {
  const paths: Record<PortalIconName, ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    bookings: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    records: <><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}
function Sheet({
  title,
  close,
  children,
  footer,
  busy,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  footer: ReactNode;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  const [viewport, setViewport] = useState<{
    height: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = () =>
      setViewport({ height: view.height, top: view.offsetTop });
    update();
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
    };
  }, []);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const y = scrollY,
      active = document.activeElement as HTMLElement | null;
    const body = document.body,
      old = {
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        overflow: body.style.overflow,
      };
    Object.assign(body.style, {
      position: "fixed",
      top: `-${y}px`,
      width: "100%",
      overflow: "hidden",
    });
    ref.current?.focus();
    return () => {
      Object.assign(body.style, old);
      window.scrollTo(0, y);
      active?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="cp-overlay"
      style={
        viewport
          ? { top: viewport.top, height: viewport.height, bottom: "auto" }
          : undefined
      }
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) closeRef.current();
        if (e.key === "Tab") {
          const a = [
            ...ref.current!.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
            ),
          ];
          if (e.shiftKey && document.activeElement === a[0]) {
            e.preventDefault();
            a.at(-1)?.focus();
          } else if (!e.shiftKey && document.activeElement === a.at(-1)) {
            e.preventDefault();
            a[0]?.focus();
          }
        }
      }}
    >
      <div className="cp-backdrop" onClick={() => !busy && close()} />
      <div
        ref={ref}
        className="cp-sheet"
        style={
          viewport
            ? { maxHeight: Math.max(0, viewport.height - 12) }
            : undefined
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header>
          <h2>{title}</h2>
          <button disabled={busy} onClick={close} aria-label="關閉">
            ×
          </button>
        </header>
        <div className="cp-sheet-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}
export function CoursePortalClient(p: CoursePortalData & { initialDate?: string; initialView?: "home" | "bookings" | "plans" }) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [role, setRole] = useState(p.memberEnabled ? "member" : "coach"),
    [page, setPage] = useState<Page>(p.initialView ?? "home"),
    [date, setDate] = useState(p.initialDate ?? toLocalDateStr(new Date(p.serverNow))),
    [now, setNow] = useState(p.serverNow),
    [history, setHistory] = useState(false),
    [bookingDetails, setBookingDetails] = useState<Record<string, boolean>>({}),
    [cardHistory, setCardHistory] = useState(false),
    [orderHistory, setOrderHistory] = useState(false),
    [roster, setRoster] = useState<string | null>(null),
    [showWorkCalendar, setShowWorkCalendar] = useState(false),
    [editingNote, setEditingNote] = useState<{ id: string; original: string; value: string } | null>(null),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(20),
    [recordFilter, setRecordFilter] = useState("all"),
    [recordEdit, setRecordEdit] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null),
    [cardId, setCardId] = useState(""),
    [learners, setLearners] = useState<string[]>([]),
    [notes, setNotes] = useState(""),
    [confirm, setConfirm] = useState(false),
    [key, setKey] = useState(""),
    [cancelId, setCancelId] = useState<string | null>(null),
    [attendance, setAttendance] = useState<{
      session: Work;
      ids: string[];
      target: "ATTENDED" | "NO_SHOW" | "RESERVED";
      correction?: boolean;
    } | null>(null),
    [buy, setBuy] = useState<CoursePortalData["plans"][number] | null>(null),
    [lastFour, setLastFour] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [refreshing, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [confirmedAttendance, setConfirmedAttendance] = useState<Record<string, AttendanceUpdate>>({});
  const pending = saving || (role !== "coach" && refreshing);
  // Keep confirmed writes visible across an older in-flight refresh; newer server rows win.
  const work = p.work.map(s => ({ ...s, bookings: s.bookings.map(b => {
    const saved = confirmedAttendance[b.id];
    return saved && saved.updatedAt > b.updatedAt ? { ...b, ...saved } : b;
  }) }));
  const busyRef = useRef(false),
    trail = useRef<Array<{ page: Page; y: number }>>([]),
    daily = useRef<HTMLElement>(null),
    transferLastFourInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(t);
  }, [message]);
  const coach = role === "coach",
    today = toLocalDateStr(new Date(now)),
    selected = date.startsWith(p.month) ? date : p.month + "-01",
    card = p.cards.find((c) => c.id === cardId),
    modal = !!(session || attendance || cancelId || buy);
  const needsRoll = (s: Work) => s.bookings.some(b => b.status === "RESERVED");
  const isEnded = (s: Work) => new Date(s.endsAt).getTime() <= now;
  const todayWork = work.filter(s => courseDate(s.startsAt) === today);
  const overdue = work.filter(s => courseDate(s.startsAt) < today && needsRoll(s) && isEnded(s));
  const monthlyWork = work.filter(s => courseDate(s.startsAt).startsWith(p.month));
  const taught = monthlyWork.filter(s => isEnded(s) && !needsRoll(s) && s.bookings.some(b => b.status === "ATTENDED"));
  const taughtHours = Math.round(taught.reduce((n,s) => n + (Date.parse(s.endsAt)-Date.parse(s.startsAt))/3600000,0)*10)/10;
  const weekStart = addTaiwanDuration(selected, -((parseLocalDate(selected).getDay()+6)%7), "DAY");
  const weekDays = Array.from({length:7},(_,i) => addTaiwanDuration(weekStart,i,"DAY"));
  const historyWork = monthlyWork.filter(s => isEnded(s) && (recordFilter !== "pending" || needsRoll(s)));
  const refreshGuard = useRef({ modal, pending });
  useEffect(() => {
    refreshGuard.current = { modal: modal || !!editingNote, pending: pending || refreshing };
  }, [modal, pending, refreshing, editingNote]);
  useEffect(() => {
    if (!editingNote || editingNote.value === (editingNote.original ?? "")) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editingNote]);
  useEffect(() => {
    let lastRefresh = Date.now();
    const refresh = () => {
      if (
        document.visibilityState !== "visible" ||
        refreshGuard.current.modal ||
        refreshGuard.current.pending ||
        busyRef.current ||
        Date.now() - lastRefresh < 15000
      )
        return;
      lastRefresh = Date.now();
      start(() => router.refresh());
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  const nav = coach
    ? [
        ["home", "今日工作", "home"],
        ["schedule", "課表", "calendar"],
        ["records", "授課紀錄", "records"],
      ]
    : [
        ["home", "首頁", "home"],
        ["schedule", "預約", "calendar"],
        ["bookings", "我的預約", "bookings"],
        ["account", "我的", "account"],
      ];
  function switchRole(next: "member" | "coach") {
    if (role === next || !leaveNote()) return;
    setRole(next);
    setDate(today);
    if (next === "coach" && !today.startsWith(p.month)) month(today.slice(0, 7));
    setPage("home");
    setRoster(null);
    setSearch("");
    setError("");
    trail.current = [];
  }
  function go(next: Page) {
    if (!leaveNote()) return;
    if (["home", "schedule", "bookings", "account", "records"].includes(next))
      trail.current = [];
    else trail.current.push({ page, y: scrollY });
    setPage(next);
    setRoster(null);
    setRecordEdit(null);
    if (coach && next === "home") {
      setDate(today);
      setRoster(null);
      if (!today.startsWith(p.month)) month(today.slice(0, 7));
    }
    setLimit(20);
    setSearch("");
    setError("");
    window.scrollTo(0, 0);
  }
  function leaveNote() {
    if (editingNote && editingNote.value !== (editingNote.original ?? "") && !window.confirm("本次備註尚未儲存，要放棄修改嗎？")) return false;
    setEditingNote(null);
    return true;
  }
  function workDate(next: string) {
    if (!leaveNote()) return;
    setDate(next);
    setRoster(null);
    setSearch("");
    if (!next.startsWith(p.month)) month(next.slice(0, 7));
  }
  function back() {
    const prev = trail.current.pop();
    setPage(prev?.page ?? "account");
    requestAnimationFrame(() => window.scrollTo(0, prev?.y ?? 0));
  }
  function month(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set("month", next);
    start(() => router.replace(`${pathname}?${q}`, { scroll: false }));
  }
  function run(
    action: () => Promise<{ success: boolean; error?: string; attendanceUpdates?: AttendanceUpdate[] }>,
    done: () => void,
    successMessage = "已更新",
    bookingIds: string[] = [],
    refreshOnFailure = true,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setSavingIds(bookingIds);
    setError("");
    setMessage("");
    void (async () => {
      try {
        const r = await action();
        if (!r.success) {
          setError(r.error ?? "操作失敗，請重試");
          if (refreshOnFailure) start(() => router.refresh());
          return;
        }
        if (r.attendanceUpdates) setConfirmedAttendance(previous => {
          const next = { ...previous };
          for (const row of r.attendanceUpdates!) {
            if (!next[row.id] || next[row.id].updatedAt <= row.updatedAt) next[row.id] = row;
          }
          return next;
        });
        done();
        setMessage(successMessage);
        start(() => router.refresh());
      } catch {
        setError("連線中斷，請重試；目前選擇已保留。");
      } finally {
        busyRef.current = false;
        setSaving(false);
        setSavingIds([]);
      }
    })();
  }
  function focusTransferLastFour() {
    requestAnimationFrame(() => {
      transferLastFourInput.current?.focus();
      transferLastFourInput.current?.scrollIntoView({ block: "center" });
    });
  }
  function showPurchaseProgress() {
    setBuy(null);
    setSession(null);
    setPage("orders");
    setOrderHistory(false);
    trail.current = [];
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, 0)));
  }
  const eligible = (s: Session) =>
    p.cards
      .filter(
        (c) =>
          !c.expired && !c.closed &&
          c.expiresAt >= s.startsAt &&
          (!c.termSessionIds?.length || c.termSessionIds.includes(s.id)) &&
          (!c.templateIds.length || c.templateIds.includes(s.templateId)),
      )
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const amount = (s: Session, c: CoursePortalData["cards"][number]) =>
    c.unit === "SESSION" ? 1 : s.cost;
  function book(s: Session) {
    setSession(s);
    const options = eligible(s);
    setCardId((options.find(c => c.available >= amount(s,c)) ?? options[0])?.id ?? "");
    setLearners([]);
    setNotes("");
    setConfirm(false);
    setKey(crypto.randomUUID());
    setError("");
  }
  const heading = (name: string, description?: string) => (
    <div className="cp-title">
      <h1>{name}</h1>
      {description && <p>{description}</p>}
    </div>
  );
  const menu = (name: string, next: Page, description?: string) => (
    <button className="cp-menu" onClick={() => go(next)}>
      <span>
        <strong>{name}</strong>
        {description && <small>{description}</small>}
      </span>
      <span>›</span>
    </button>
  );
  const monthPicker = (
    <div className="cp-month">
      <button
        disabled={pending}
        onClick={() =>
          leaveNote() && month(addTaiwanDuration(p.month + "-01", -1, "MONTH").slice(0, 7))
        }
      >
        ‹
      </button>
      <input
        aria-label="月份"
        type="month"
        value={p.month}
        onChange={(e) =>
          /^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value) &&
          leaveNote() &&
          month(e.target.value)
        }
      />
      <button
        disabled={pending}
        onClick={() =>
          leaveNote() && month(addTaiwanDuration(p.month + "-01", 1, "MONTH").slice(0, 7))
        }
      >
        ›
      </button>
    </div>
  );
  function closed(d: string) {
    const special = p.special.find((s) => s.date === d);
    if (special) return special.type !== "custom";
    const weekday = new Date(d + "T12:00:00+08:00").getUTCDay();
    return p.hours.some((h) => h.dayOfWeek === weekday && !h.isOpen);
  }
  const calendar = (
    <section className="cp-card cp-calendar">
      {monthPicker}
      <div className="cp-context">
        <span>{coach ? "我的授課" : "店家課表"}</span>
        <button
          onClick={() => {
            if (!leaveNote()) return;
            setDate(today);
            if (!today.startsWith(p.month)) month(today.slice(0, 7));
          }}
        >
          今天
        </button>
      </div>
      <div className="cp-week">
        {"日一二三四五六".split("").map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cp-days">
        {Array.from({ length: courseMonthDays(p.month).offset }, (_, i) => (
          <span key={"blank" + i} />
        ))}
        {courseMonthDays(p.month).dates.map((d) => {
          const sessions = (coach ? work : p.sessions).filter(
              (s) => courseDate(s.startsAt) === d,
            ),
            marks = courseMemberMarkers(
              p.bookings.filter((b) => courseDate(b.startsAt) === d),
              p.customerId,
            );
          return (
            <button
              key={d}
              className={`${closed(d) ? "closed" : ""} ${selected === d ? "selected" : ""}`}
              aria-pressed={selected === d}
              aria-label={`${d}${closed(d) ? " 公休" : ""} ${sessions.length}堂`}
              onClick={() => {
                if (!leaveNote()) return;
                setDate(d);
                setRoster(null);
                requestAnimationFrame(() =>
                  daily.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
                );
              }}
            >
              <span>{Number(d.slice(-2))}</span>
              {closed(d) && <small>公休</small>}
              {sessions.length > 0 && (
                <small>
                  {sessions.length}堂

                </small>
              )}
              {!coach && (
                <span className="cp-dots">
                  {marks.self && <i className="self" />}
                  {marks.shared && <i className="shared" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="cp-legend">
        {coach ? "日期下方顯示授課堂數。" : "🔵 本人　🟠 共卡"}
        　淡色為公休
      </p>
    </section>
  );
  const notOpenYet = (s: Session) => new Date(s.startsAt).getTime() > new Date(p.bookingWindow.closesAt).getTime() || (!!p.bookingWindow.opensAt && now < new Date(p.bookingWindow.opensAt).getTime());
  function lessonRows(list: Session[]) {
    return list.length ? (
      list.map((s) => (
        <article className="cp-card cp-lesson" key={s.id}>
          <div>
            <strong>
              {time(s.startsAt)} · {s.name}
            </strong>
            <p>
              {s.coach} · {s.room} · {s.cost} 點／堂 · 剩{" "}
              {Math.max(0, s.capacity - s.occupied)} 位
            </p>
            {s.precautions && <p className="cp-important">{s.precautions}</p>}
          </div>
          <button
            className="primary"
            disabled={
              pending ||
              new Date(s.startsAt).getTime() <= now ||
              s.occupied >= s.capacity ||
              closed(courseDate(s.startsAt)) || notOpenYet(s)
            }
            onClick={() => book(s)}
          >
            {new Date(s.startsAt).getTime() <= now
              ? "已開始"
              : s.occupied >= s.capacity
                ? "滿班"
                : notOpenYet(s) ? "尚未開放" : closed(courseDate(s.startsAt)) ? "公休" : "預約"}
          </button>
        </article>
      ))
    ) : (
      <p className="cp-empty">
        {closed(selected) ? "店家公休" : "當日尚未排課"}
      </p>
    );
  }
  function workRows(list: Work[]) {
    return [...list].sort((a, b) => (page === "home" ? Number(isEnded(a)) - Number(isEnded(b)) : 0) || a.startsAt.localeCompare(b.startsAt)).map((s) => {
      const people = s.bookings.filter((b) => b.status !== "CANCELLED"),
        pendingPeople = people.filter((b) => b.status === "RESERVED"),
        ended = new Date(s.startsAt).getTime() <= now,
        filtered = people.filter((b) => b.customerName.includes(search)),
        readOnly = page === "records" && recordEdit !== s.id;
      return (
        <article key={s.id} className="cp-card">
          <button
            className="cp-menu"
            disabled={!s.bookings.length}
            aria-expanded={roster === s.id}
            onClick={() => {
              if (!leaveNote()) return;
              setRoster(roster === s.id ? null : s.id);
              setSearch("");
              setLimit(20);
            }}
          >
            <span>
              <strong>
                {time(s.startsAt)}–{time(s.endsAt)} · {s.name}
                <span className="cp-course-cost"> · {s.cost} 點／1 堂</span>
              </strong>
              <small>
                {s.room} · {people.length} 位學員 ·{" "}
                {page === "records" ? `出席 ${people.filter(b=>b.status === "ATTENDED").length} 人／未到 ${people.filter(b=>b.status === "NO_SHOW").length} 人 · ${pendingPeople.length ? "待完成點名" : people.length ? "點名完成" : "無有效預約"}` : pendingPeople.length
                  ? (ended ? `待點名 ${pendingPeople.length} 位` : "尚未開課")
                  : people.length
                    ? "點名完成"
                    : "尚無學員"}
              </small>
            </span>
            {s.bookings.length > 0 && <span>{roster === s.id ? "收合" : !people.length ? "已取消預約" : page === "records" ? "查看明細" : "名單／點名"}</span>}
          </button>
          {roster === s.id && s.bookings.length > 0 && (
            <div className="cp-pad cp-roster-body">
              <div className="cp-actions cp-roster-actions">
                <strong>學員名單 {people.length}</strong>
                {readOnly && <button onClick={() => setRecordEdit(s.id)}>{pendingPeople.length ? "補完點名" : "更正紀錄"}</button>}
                {!readOnly && ended && pendingPeople.length > 0 && (
                  <button
                    className="primary"
                    disabled={!ended || pending}
                    onClick={() => {
                      setError("");
                      setAttendance({
                        session: s,
                        ids: pendingPeople.map((b) => b.id),
                        target: "ATTENDED",
                      });
                    }}
                  >
                    全班出席 {pendingPeople.length} 人
                  </button>
                )}
              </div>
              {!readOnly && pendingPeople.length > 0 && <p className="cp-roster-hint">{ended ? "確認出席後扣抵額度。" : "尚未開課，開課後可點選出席／未到。"}</p>}
              {people.length > 0 && !filtered.length && <p className="cp-empty">找不到符合的學員</p>}
              {people.length > 10 && (
                <input
                  aria-label="搜尋學員"
                  placeholder="搜尋學員"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setLimit(20);
                  }}
                />
              )}
              <div className="cp-roster-list">
              {filtered.slice(0, limit).map((b) => (
                <div className="cp-person cp-roster-person" key={b.id}>
                  <div className="cp-attendance-row">
                    <div className="cp-attendance-person">
                      <strong>{b.customerName}</strong>
                      <span className="cp-roster-balance">{b.unit === "TRIAL" ? "體驗" : `可用 ${b.available ?? "—"} ${unit(b.unit)}`}</span>
                    </div>
                    <div className="cp-attendance-actions">
                      {b.status === "RESERVED" ? (
                        <>
                          {!readOnly && ended && <>
                            <button
                              className="primary"
                              disabled={pending}
                              onClick={() => {
                                setError("");
                                run(
                                  () => saveCourseAttendance({ sessionId: s.id, target: "ATTENDED", bookings: [{ id: b.id, status: b.status }] }),
                                  () => {},
                                  `${b.customerName} 已標記出席`,
                                  [b.id],
                                );
                              }}
                            >
                              出席
                            </button>
                            <button
                              className="cp-secondary-action"
                              disabled={pending}
                              onClick={() => {
                                setError("");
                                run(
                                  () => saveCourseAttendance({ sessionId: s.id, target: "NO_SHOW", bookings: [{ id: b.id, status: b.status }] }),
                                  () => {},
                                  `${b.customerName} 已標記未到`,
                                  [b.id],
                                );
                              }}
                            >
                              未到
                            </button>
                          </>}
                        </>
                      ) : (
                        <button
                          disabled={pending}
                          onClick={() => {
                            setError("");
                            setAttendance({
                              session: s,
                              ids: [b.id],
                              target: b.status as "ATTENDED" | "NO_SHOW",
                              correction: true,
                            });
                          }}
                        >
                          更正
                        </button>
                      )}
                    </div>
                  </div>
                  <details className="cp-roster-details">
                    <summary>
                      <span className="cp-badge" data-status={b.status}>
                        {savingIds.includes(b.id) ? "儲存中…" : b.status === "RESERVED"
                          ? (ended ? "待點名" : "尚未開課")
                          : b.status === "ATTENDED"
                            ? `已出席・${b.unit === "TRIAL" ? "體驗不扣額度" : `已扣 ${b.cost} ${unit(b.unit)}`}`
                            : statusName(b.status)}
                      </span>
                      <span className="cp-roster-note">{[b.notes && `本次：${b.notes}`, b.serviceNote && `店內：${b.serviceNote}`].filter(Boolean).join("；") || "無備註"}</span>
                      <span className="cp-roster-detail-label"><span className="cp-detail-closed">詳情</span><span className="cp-detail-open">收起</span></span>
                    </summary>
                    <p>{b.planName} · {b.unit === "TRIAL" ? "不使用方案額度" : `${b.cost} ${unit(b.unit)}`}</p>
                    {editingNote?.id === b.id ? <form onSubmit={e => { e.preventDefault(); run(() => saveCourseCoachNote({ bookingId: b.id, notes: editingNote.value, previousNotes: editingNote.original }), () => setEditingNote(null), "本次備註已儲存"); }}>
                      <label>本次備註（店長與授課教練可見）<textarea aria-label={`${b.customerName}本次備註`} maxLength={1000} value={editingNote.value} onChange={e => setEditingNote({ ...editingNote, value: e.target.value })} disabled={pending} /></label>
                      <div className="cp-actions"><button type="submit" disabled={pending}>儲存備註</button><button type="button" disabled={pending} onClick={() => leaveNote()}>取消修改</button></div>
                    </form> : <button disabled={pending} onClick={() => { if (leaveNote()) setEditingNote({ id: b.id, original: b.notes, value: b.notes ?? "" }); }}>編輯本次備註</button>}
                  </details>
                </div>
              ))}
              </div>
              {filtered.length > limit && (
                <button onClick={() => setLimit(limit + 20)}>顯示更多</button>
              )}
              {s.bookings.some((b) => b.status === "CANCELLED") && (
                <details>
                  <summary>
                    已取消（
                    {s.bookings.filter((b) => b.status === "CANCELLED").length}
                    ）
                  </summary>
                  {s.bookings
                    .filter((b) => b.status === "CANCELLED")
                    .map((b) => (
                      <p key={b.id}>{b.customerName}</p>
                    ))}
                </details>
              )}
            </div>
          )}
        </article>
      );
    });
  }
  const bookings = p.bookings
    .filter((b) =>
      history ? b.status !== "RESERVED" : b.status === "RESERVED",
    )
    .sort((a, b) =>
      history
        ? b.startsAt.localeCompare(a.startsAt)
        : a.startsAt.localeCompare(b.startsAt),
    );
  const groups = [...new Set(bookings.map((b) => b.sessionId))];
  const cancellationCutoff = (startsAt: string) =>
    Date.parse(startsAt) - p.cancellationLeadMinutes * 60000;
  const canSelfCancel = (startsAt: string) => now < cancellationCutoff(startsAt);
  const nextParticipants = p.nextBooking?.participants.map((participant) =>
    participant.id === p.customerId ? "本人" : participant.name,
  ) ?? [];
  const cancelBooking = p.bookings.find((booking) => booking.id === cancelId);
  const sharedCards = p.cards.filter((candidate) => candidate.members.length > 1);
  const shop = p.plans.filter(
    (plan) =>
      !session ||
      !plan.templateIds.length ||
      plan.templateIds.includes(session.templateId),
  );
  return (
    <div className="course-portal">
      <div inert={modal}>
        <header className="cp-top">
          <div className="cp-brand"><SteamButlerLogo className="w-28" /><small>{p.storeName}</small></div>
          {p.hasWork && p.memberEnabled ? (
            <div className="cp-role-switch" role="group" aria-label="身分切換">
              <button aria-pressed={role === "member"} onClick={() => switchRole("member")}>會員</button>
              <button aria-pressed={role === "coach"} onClick={() => switchRole("coach")}>我的工作</button>
            </div>
          ) : (
            <span>{coach ? "我的工作" : "會員專區"}</span>
          )}
          {coach && <details className="cp-coach-options"><summary aria-label="帳號選單">⋯</summary><form action={logoutAction}><input type="hidden" name="storeSlug" value={p.prefix.split("/")[2] ?? ""}/><LogoutButton className="cp-menu"/></form></details>}
        </header>
        <nav className="cp-nav" aria-label="主要功能">
          {nav.map(([v, label, icon]) => (
            <button
              key={v}
              aria-current={page === v ? "page" : undefined}
              onClick={() => go(v as Page)}
            >
              <PortalIcon name={icon as PortalIconName} />
              {label}
            </button>
          ))}
        </nav>
        <main className={`cp-main${coach ? " cp-coach-main" : ""}`}>
          <div className="cp-refresh">
            <span>更新於 {time(new Date(p.serverNow).toISOString())}</span>
            <button
              disabled={saving || refreshing}
              onClick={() => start(() => router.refresh())}
            >
              {saving ? "儲存中…" : refreshing ? "更新中…" : "更新"}
            </button>
          </div>
          {message && (
            <p role="status" className="cp-toast">
              {message}
            </p>
          )}
          {error && !modal && (
            <p role="alert" className="cp-error">
              {error}
            </p>
          )}
          {!["home", "schedule", "bookings", "account", "records"].includes(
            page,
          ) && <button onClick={back}>‹ 返回</button>}
          {page === "home" && (
            <>
              {heading(coach ? "今日工作" : "會員首頁")}
              {!coach && <section className="cp-card cp-next">
                <div>
                  <small>{coach ? "下一堂課" : "下一次上課"}</small>
                  <strong>
                    {coach
                      ? p.nextWork
                        ? `${formatTWDateTime(new Date(p.nextWork.startsAt))} · ${p.nextWork.name}`
                        : "尚無授課安排"
                      : p.nextBooking
                        ? `${formatTWDateTime(new Date(p.nextBooking.startsAt))} · ${p.nextBooking.name}`
                        : "尚無預約"}
                  </strong>
                  <p>{coach ? p.nextWork?.room : p.nextBooking ? `${p.nextBooking.coach} · ${p.nextBooking.room}` : "選擇日期查看課程"}</p>
                  {!coach && p.nextBooking && <small>{nextParticipants.join("＋")} · 共 {nextParticipants.length} 位</small>}
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    go(coach || !p.nextBooking ? "schedule" : "bookings");
                    const next = coach ? p.nextWork : p.nextBooking;
                    if (next) {
                      setDate(courseDate(next.startsAt));
                      if (!courseDate(next.startsAt).startsWith(p.month))
                        month(courseDate(next.startsAt).slice(0, 7));
                      if (coach && p.nextWork) setRoster(p.nextWork.id);
                    }
                  }}
                >
                  {!coach && !p.nextBooking ? "預約課程" : "查看"}
                </button>
              </section>}
              {coach ? (
                <>
                  <p>今天 · {today} · {todayWork.length} 堂</p>
                  {overdue.length > 0 && <details className="cp-card cp-pad"><summary>有 {overdue.length} 堂過往課程待完成點名</summary>{overdue.map(s => <section key={s.id}><h3>{courseDate(s.startsAt)}</h3>{workRows([s])}</section>)}</details>}
                  {workRows(todayWork.filter(s => !isEnded(s) || needsRoll(s)))}
                  {todayWork.some(s => isEnded(s) && !needsRoll(s)) && <details className="cp-card cp-pad"><summary>已結束課程（{todayWork.filter(s=>isEnded(s)&&!needsRoll(s)).length}）</summary>{workRows(todayWork.filter(s=>isEnded(s)&&!needsRoll(s)))}</details>}
                  {!todayWork.length && <section className="cp-card cp-pad"><p>今天沒有課程</p>{p.nextWork ? <button onClick={() => { go("schedule"); workDate(courseDate(p.nextWork!.startsAt)); }}>下一堂 · {formatTWDateTime(new Date(p.nextWork.startsAt))} · {p.nextWork.name}</button> : <p>尚無後續授課安排。</p>}</section>}
                </>
              ) : (
                <>
                  <button className="primary cp-wide-action" onClick={() => go("schedule")}>立即預約</button>
                  <h2>常用功能</h2>
                  <section className="cp-card">
                    {menu("我的預約", "bookings", "待上課與歷史紀錄")}
                    {menu(
                      "我的方案",
                      "plans",
                      p.cards.length
                        ? `${p.cards.filter((c) => !c.expired && !c.closed).length} 個有效方案`
                        : "尚無方案",
                    )}
                    {p.healthEnabled && menu("健康紀錄", "health", "查看身體數據與趨勢")}
                    {menu("操作指南", "guide", "預約、取消、方案與共卡")}
                  </section>
                </>
              )}
            </>
          )}
          {page === "schedule" && (
            <>
              {heading(coach ? "我的課表" : "課表預約")}
              <div className="cp-schedule">
                {coach ? <>
                  {!showWorkCalendar && <>
                  <div className="cp-work-date"><button aria-label="上一週" disabled={pending} onClick={() => workDate(addTaiwanDuration(selected,-7,"DAY"))}>‹</button><strong>{weekDays[0].slice(5)} — {weekDays[6].slice(5)}</strong><button aria-label="下一週" disabled={pending} onClick={() => workDate(addTaiwanDuration(selected,7,"DAY"))}>›</button></div>
                  <div className="cp-week-strip">{weekDays.map((d,i)=><button key={d} disabled={pending} aria-pressed={selected===d} className={selected===d?"primary":""} onClick={()=>workDate(d)}><span>{"一二三四五六日"[i]}</span><strong>{Number(d.slice(-2))}</strong><small>{work.filter(s=>courseDate(s.startsAt)===d).length}堂</small></button>)}</div>
                  </>}
                  <div className="cp-actions">{!showWorkCalendar && <button disabled={pending} onClick={()=>workDate(today)}>今天</button>}<button aria-pressed={showWorkCalendar} onClick={()=>setShowWorkCalendar(!showWorkCalendar)}>{showWorkCalendar?"切換週曆":"月曆"}</button></div>
                  {showWorkCalendar && calendar}
                </> : calendar}
                <section ref={daily} className="cp-daily">
                  <h2>
                    {selected} · {coach ? "授課" : "當日課程"}
                  </h2>
                  {coach && !work.some(s=>courseDate(s.startsAt)===selected) && <p className="cp-empty">當日沒有排課</p>}
                  {coach
                    ? workRows(
                        work.filter(
                          (s) => courseDate(s.startsAt) === selected,
                        ),
                      )
                    : lessonRows(
                        p.sessions.filter(
                          (s) => courseDate(s.startsAt) === selected,
                        ),
                      )}
                </section>
              </div>
            </>
          )}
          {page === "bookings" && (
            <>
              {heading("我的預約")}
              {monthPicker}
              <div className="cp-actions">
                <button
                  className={!history ? "primary" : ""}
                  onClick={() => setHistory(false)}
                >
                  待上課
                </button>
                <button
                  className={history ? "primary" : ""}
                  onClick={() => setHistory(true)}
                >
                  歷史紀錄
                </button>
              </div>
              {groups.slice(0, limit).map((id) => {
                const list = bookings.filter((b) => b.sessionId === id),
                  first = list[0];
                return (
                  <article className="cp-card cp-pad cp-booking-card" key={id}>
                    <div className="cp-booking-heading">
                      <h2>{formatTWDateTime(new Date(first.startsAt))} · {first.name}</h2>
                      <button aria-expanded={!!bookingDetails[id]} aria-controls={`booking-details-${id}`} onClick={() => setBookingDetails(previous => ({...previous, [id]: !previous[id]}))}>{bookingDetails[id] ? "收合 ⌃" : "明細 ⌄"}</button>
                    </div>
                    <p className="cp-booking-location">{first.coach} · {first.room}</p>
                    <div id={`booking-details-${id}`}>
                    {list.map((b) => (
                      <div className="cp-person" key={b.id}>
                        <div className="cp-line cp-booking-person-line">
                          <strong>
                            {b.customerId === p.customerId ? "🔵 " : "🟠 "}
                            {b.customerName}
                          </strong>
                          <span className="cp-badge" data-status={b.status}>
                            {b.status === "RESERVED" && new Date(b.startsAt).getTime() <= now ? "待確認出席" : statusName(b.status)}
                          </span>
                          {b.status === "RESERVED" && canSelfCancel(b.startsAt) && (
                            <button
                              disabled={pending}
                              onClick={() => {
                                setError("");
                                setCancelId(b.id);
                              }}
                            >
                              取消
                            </button>
                          )}
                        {b.status === "RESERVED" && !canSelfCancel(b.startsAt) && (
                          <div className="cp-late-cancel">
                            <span className="cp-muted">已超過取消期限</span>
                            {p.config?.lineOfficialUrl && /^https:\/\//.test(p.config.lineOfficialUrl) ? (
                              <a className="cp-btn cp-small-action" href={p.config.lineOfficialUrl} target="_blank" rel="noreferrer">聯絡店家</a>
                            ) : <span className="cp-muted">請洽店家</span>}
                          </div>
                        )}
                        </div>
                        {bookingDetails[id] && <div className="cp-booking-detail">
                          <p>
                            {b.unit === "TRIAL" ? `體驗 NT$ ${b.trialPrice} · ${b.trialPaid === null ? "尚未收款" : `已收款 NT$ ${b.trialPaid}`}` : b.planName}{b.expiresAt ? ` · ${courseDate(b.expiresAt)} 到期` : ""}
                          </p>
                          <p>
                            {b.unit === "TRIAL" ? "" : b.status === "ATTENDED"
                              ? "已扣除"
                              : b.status === "RESERVED"
                                ? "本次使用"
                                : b.status === "NO_SHOW" ? "本次額度" : "已釋放"}{" "}
                            {b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.cost} ${unit(b.unit)}`}
                          </p>
                          {b.customerId !== p.customerId && (
                            <p>預約人：{b.operatorName}</p>
                          )}
                          {b.status === "RESERVED" && <p>自行取消截止：{formatTWDateTime(new Date(cancellationCutoff(b.startsAt)))}</p>}
                          {b.notes && <p>備註：{b.notes}</p>}
                        </div>}
                      </div>
                    ))}
                    </div>
                  </article>
                );
              })}
              {!groups.length && (
                <p className="cp-empty">
                  本月沒有{history ? "歷史" : "待上課"}預約
                </p>
              )}
              {groups.length > limit && (
                <button onClick={() => setLimit(limit + 20)}>顯示更多</button>
              )}
            </>
          )}
          {page === "account" && (
            <>
              {heading("我的", p.customerName)}
              <section className="cp-card">
                {menu("我的方案", "plans", "額度與到期日")}
                {menu("購買方案", "shop")}
                {menu(
                  "購買紀錄",
                  "orders",
                  p.orders.some((o) => o.status === "PENDING")
                    ? "有待店家確認的訂單"
                    : undefined,
                )}
                {menu("共卡成員", "shared")}
                {p.healthEnabled && menu("健康紀錄", "health")}
              </section>
              <h2>帳戶與店家</h2>
              <section className="cp-card">
                <a className="cp-menu" href={`${p.prefix}/profile`}>
                  個人資料與登入 ›
                </a>
                {p.emergencyContact && <CourseMemberContactForm initial={p.emergencyContact} />}
                {menu("店家資訊", "store")}
              </section>
            </>
          )}
          {page === "plans" && (
            <>
              {heading("我的方案")}
              <p>可用額度＝剩餘－預約保留；每張方案的期限分開計算。</p>
              {p.cards.some(c=>c.expired || c.closed) && <button aria-expanded={cardHistory} onClick={()=>setCardHistory(!cardHistory)}>{cardHistory ? "收起" : "查看"}已到期／停用方案（{p.cards.filter(c=>c.expired || c.closed).length}）</button>}
              <a className="cp-btn" href={`${p.prefix}/book/reminders`}>低可用額度提醒接收設定</a>
              {p.cards.filter(c=>cardHistory || (!c.expired && !c.closed)).map((c) => (
                <article className="cp-card cp-pad" key={c.id}>
                  <div className="cp-line">
                    <h2>{c.name}{c.closed ? " · 已結清停用" : ""}</h2>
                    <strong>
                      {c.available} {unit(c.unit)}可用
                    </strong>
                  </div>
                  <p>
                    {courseDate(c.expiresAt)} 到期{c.expired ? " · 已到期" : ""}
                  </p>
                  <p>
                    剩餘 {c.remaining} · 已預約保留 {c.held}
                  </p>
                  <details>
                    <summary>適用課程</summary>
                    <p>
                      {c.templateIds.length
                        ? p.templates
                            .filter((t) => c.templateIds.includes(t.id))
                            .map((t) => t.name)
                            .join("、")
                        : "本店所有課程"}
                    </p>
                  </details>
                  <details>
                    <summary>使用紀錄（最近 100 筆）</summary>
                    {c.entries.map((e) => (
                      <p key={e.id}>
                        {formatTWDateTime(new Date(e.createdAt))} ·{" "}
                        {e.kind.startsWith("CORRECT")
                          ? `點名更正：${statusName(e.kind.split(":")[1])} → ${statusName(e.kind.split(":")[2])}`
                          : ({
                              GRANT: "取得額度",
    REFUND: "退款收回額度",
    VOID: "誤建作廢收回額度",
                              RESERVE: "預約保留",
                              DEBIT: "出席使用",
                              RELEASE: "釋放保留",
                            }[e.kind.split(":")[0]] ?? "額度異動")}{" "}
                        · {e.points}
                        {unit(c.unit)}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
              {!p.cards.some(c=>cardHistory || (!c.expired && !c.closed)) && <p>目前沒有有效方案，可查看歷史或購買新方案。</p>}
              <button className="primary" onClick={() => go("shop")}>
                購買方案
              </button>
            </>
          )}
          {page === "shop" && (
            <>
              {heading("購買方案")}
              <p>選擇方案 → 依銀行資訊匯款 → 填寫轉出帳號後四碼 → 等待店家核帳啟用。</p>
              <button onClick={()=>go("orders")}>查看購買進度{p.orders.some(o=>o.status === "PENDING") ? `（${p.orders.filter(o=>o.status === "PENDING").length} 筆待核帳）` : ""}</button>
              {shop.map((plan) => (
                <article className="cp-card cp-pad" key={plan.id}>
                  <h2>{plan.name}</h2>
                  <p>
                    {plan.points} {unit(plan.unit)} · NT${" "}
                    {plan.price.toLocaleString()}
                  </p>
                  <p>核帳啟用後 {plan.validDays} 天有效</p>
                  <p>
                    適用：
                    {plan.templateIds.length
                      ? p.templates
                          .filter((t) => plan.templateIds.includes(t.id))
                          .map((t) => t.name)
                          .join("、")
                      : "本店所有課程"}
                  </p>
                  <button
                    className="primary"
                    disabled={!p.config?.bankAccountNumber || pending}
                    onClick={() => {
                      setBuy(plan);
                      setKey(crypto.randomUUID());
                      setLastFour("");
                      setError("");
                    }}
                  >
                    購買
                  </button>
                </article>
              ))}
              {!p.config?.bankAccountNumber && (
                <p>店家尚未提供匯款資訊，請聯絡店家。</p>
              )}
              {!shop.length && <p>目前沒有適用的販售方案。</p>}
            </>
          )}
          {page === "orders" && (
            <>
              {heading("購買紀錄")}
              <p>核帳完成後，額度會出現在「我的方案」。請勿為了查詢進度重複送出。</p>
              <div className="cp-actions"><button aria-pressed={!orderHistory} className={!orderHistory ? "primary" : ""} onClick={()=>{setOrderHistory(false);setLimit(20);}}>待核帳（{p.orders.filter(o=>o.status === "PENDING").length}）</button><button aria-pressed={orderHistory} className={orderHistory ? "primary" : ""} onClick={()=>{setOrderHistory(true);setLimit(20);}}>歷史紀錄</button><button onClick={()=>go("plans")}>我的方案</button></div>
              {p.orders.filter(o=>orderHistory ? o.status !== "PENDING" : o.status === "PENDING").slice(0, limit).map((o) => (
                <article className="cp-card cp-pad" key={o.id}>
                  <h2>{o.name}</h2>
                  <p>
                    {formatTWDateTime(new Date(o.createdAt))} · NT${" "}
                    {o.price.toLocaleString()}
                  </p>
                  <p>
                    {o.status === "CONFIRMED"
                      ? "已核帳並啟用"
                      : o.status === "VOIDED" ? "已作廢，額度已收回" : o.status === "REFUNDED" ? "已登錄退款，卡片已停用" : "待店家核帳，尚未取得額度"}
                  </p>
                  <p>轉帳後四碼：{o.transferLastFive}</p>
                  {!!o.refunds.length&&<details><summary>退款紀錄 · 共 NT$ {o.refunds.reduce((sum,r)=>sum+r.amount,0).toLocaleString()}</summary>{o.refunds.map(r=><p key={r.id}>{formatTWDateTime(new Date(r.createdAt))} · NT$ {r.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[r.method]??"其他非現金"}</p>)}<p>此為店家登錄紀錄，實際款項請向店家核對。</p></details>}
                </article>
              ))}
              {!p.orders.some(o=>orderHistory ? o.status !== "PENDING" : o.status === "PENDING") && <p>{orderHistory ? "尚無歷史購買紀錄" : "目前沒有待核帳訂單"}</p>}
              {p.orders.filter(o=>orderHistory ? o.status !== "PENDING" : o.status === "PENDING").length > limit && (
                <button onClick={() => setLimit(limit + 20)}>顯示更多</button>
              )}
            </>
          )}
          {page === "shared" && (
            <>
              {heading("共卡成員")}
              {sharedCards.map((c) => (
                  <article className="cp-card cp-pad" key={c.id}>
                    <h2>{c.name}{c.closed ? " · 已結清停用" : ""}</h2>
                    <p>{c.members.map((m) => m.name).join("、")}</p>
                    <p>可替以上授權成員預約，不會開放其他人的健康資料。</p>
                  </article>
                ))}
              {!sharedCards.length && <section className="cp-card cp-pad cp-empty-state"><strong>目前沒有共用方案</strong><p>如需和家人共用額度，請聯絡店家協助設定。</p>{p.config?.lineOfficialUrl && /^https:\/\//.test(p.config.lineOfficialUrl) && <a className="cp-btn" href={p.config.lineOfficialUrl} target="_blank" rel="noreferrer">聯絡店家</a>}</section>}
            </>
          )}
          {page === "health" && p.healthEnabled && (
            <>
              {heading("健康紀錄")}
              <CourseHealthWorkspace member />
            </>
          )}
          {page === "store" && (
            <>
              {heading(p.storeName)}
              <section className="cp-card cp-pad cp-store-info">
                <p className="cp-store-address">{p.config?.address?.trim() || "地址尚未提供"}</p>
                <div className="cp-store-actions">
                  {p.config?.mapUrl && /^https:\/\//.test(p.config.mapUrl) && <a className="cp-btn" href={p.config.mapUrl} target="_blank" rel="noreferrer">
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
                    開啟地圖
                  </a>}
                  {p.config?.lineOfficialUrl && /^https:\/\//.test(p.config.lineOfficialUrl) && <a className="cp-btn primary" href={p.config.lineOfficialUrl} target="_blank" rel="noreferrer">
                    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a9 9 0 0 1-9 8.5H5l-3 2v-10A9 9 0 0 1 21 11.5Z"/><path d="M7 9h10M7 13h7"/></svg>
                    LINE 聯絡
                  </a>}
                </div>
                <p className="cp-store-hint">請依預約時間到店。</p>
              </section>
              {p.referralShare && <details className="cp-card cp-pad"><summary>推薦給朋友</summary><div className="mt-3"><ShareReferral storeName={p.storeName} referralUrl={p.referralShare.referralUrl} shareTemplate={p.referralShare.shareTemplate} source="course-member" trackAction={trackCourseShare}/></div></details>}
            </>
          )}
          {page === "guide" && (
            <>
              {heading("操作指南", "常用操作一次看懂")}
              <section className="cp-card cp-pad cp-guide">
                <details open><summary>如何預約課程？</summary><p>進入「預約」，選日期與課程，再選擇方案及實際上課人，確認後送出。</p></details>
                <details><summary>如何取消預約？</summary><p>進入「我的預約」，在自行取消截止時間前按「取消」。超過期限請直接聯絡店家。</p></details>
                <details><summary>方案額度何時扣除？</summary><p>預約時只保留額度；教練確認出席後才正式使用。取消成功會釋放保留額度。</p></details>
                <details><summary>如何替共卡成員預約？</summary><p>預約時在「實際上課人」勾選已授權成員。共用方案額度，但健康紀錄彼此獨立。</p></details>
              </section>
              {p.config?.lineOfficialUrl && /^https:\/\//.test(p.config.lineOfficialUrl) && <a className="cp-btn" href={p.config.lineOfficialUrl} target="_blank" rel="noreferrer">仍需協助？聯絡店家</a>}
            </>
          )}
          {page === "records" && (
            <>
              {heading("授課紀錄")}
              {monthPicker}
              <section className="cp-card cp-pad"><strong>已授課 {taught.length} 堂 · {taughtHours} 小時</strong><p>學員出席 {monthlyWork.flatMap(s=>s.bookings).filter(b=>b.status==="ATTENDED").length} 人次 · 未到 {monthlyWork.flatMap(s=>s.bookings).filter(b=>b.status==="NO_SHOW").length} 人次</p><details><summary>統計說明</summary><p>已授課計入已結束、點名完成且至少一人出席的課次；依排定時長加總。全班未到、無有效預約與取消課程不計入。人次依已登記結果統計。</p></details></section>
              <div className="cp-actions">{[["all","全部課次"],["pending",`待補點名 ${monthlyWork.filter(s=>isEnded(s)&&needsRoll(s)).length}`]].map(([v,label])=><button key={v} className={recordFilter===v?"primary":""} onClick={()=>{if(!leaveNote())return;setRecordFilter(v);setRoster(null);setRecordEdit(null);}}>{label}</button>)}</div>
              {!historyWork.length && <p className="cp-empty">{recordFilter === "pending" ? "本月沒有待補點名課程" : "本月尚無已結束課程"}</p>}
              {Object.entries(
                historyWork
                  .reduce<Record<string, Work[]>>((days, s) => {
                    (days[courseDate(s.startsAt)] ??= []).push(s);
                    return days;
                  }, {}),
              )
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([day, sessions]) => (
                  <section key={day}>
                    <h2>{day}</h2>
                    {workRows(sessions ?? [])}
                  </section>
                ))}
            </>
          )}
          {(page === "account") && (
            <form action={logoutAction} className="cp-logout">
              <input type="hidden" name="storeSlug" value={p.prefix.split("/")[2] ?? ""} />
              <LogoutButton className="cp-menu" />
            </form>
          )}
        </main>
      </div>
      {session && !buy && (
        <Sheet
          title={confirm ? "確認預約" : "選擇上課人"}
          busy={pending}
          close={() => setSession(null)}
          footer={
            <>
              <button
                disabled={pending}
                onClick={() => (confirm ? setConfirm(false) : setSession(null))}
              >
                返回
              </button>
              <button
                className="primary"
                disabled={
                  pending ||
                  !card ||
                  !learners.length ||
                  card.available < amount(session, card) * learners.length
                }
                onClick={() =>
                  confirm
                    ? run(
                        () =>
                          createMemberCourseBooking({
                            sessionId: session.id,
                            cardId,
                            customerIds: learners,
                            requestKey: key,
                            notes,
                          }),
                        () => {
                          setSession(null);
                          setPage("bookings");
                        },
                      )
                    : setConfirm(true)
                }
              >
                {pending ? "處理中…" : confirm ? "確認預約" : "下一步"}
              </button>
            </>
          }
        >
          <h2>{session.name}</h2>
          <p>
            {formatTWDateTime(new Date(session.startsAt))} · {session.coach} · {session.room}
          </p>
          {error && (
            <p className="cp-error" role="alert">
              {error}
            </p>
          )}
          {eligible(session).length ? (
            <>
              <label>
                使用方案
                <select
                  value={cardId}
                  disabled={confirm || pending}
                  onChange={(e) => {
                    setCardId(e.target.value);
                    setLearners([]);
                  }}
                >
                  {eligible(session).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · 可用 {c.available}
                      {unit(c.unit)} · {courseDate(c.expiresAt)} 到期
                    </option>
                  ))}
                </select>
              </label>
              {card && (
                <>
                  <fieldset disabled={confirm || pending}>
                    <legend>實際上課人</legend>
                    {card.members.map((m) => (
                      <label className="cp-check" key={m.id}>
                        <input
                          type="checkbox"
                          checked={learners.includes(m.id)}
                          onChange={(e) =>
                            setLearners(
                              e.target.checked
                                ? [...learners, m.id]
                                : learners.filter((id) => id !== m.id),
                            )
                          }
                        />
                        {m.name}
                        {m.id === p.customerId ? "（本人）" : "（共卡）"}
                      </label>
                    ))}
                  </fieldset>
                  <p>
                    本次 {learners.length} 位 · 預約保留{" "}
                    {amount(session, card) * learners.length} {unit(card.unit)}
                  </p>
                  {card.available <
                    amount(session, card) * Math.max(learners.length, 1) && (
                    <p className="cp-error">可用額度不足</p>
                  )}
                </>
              )}
            </>
          ) : (
            <p>沒有適用本堂課的有效方案。</p>
          )}
          <label>
            本次預約備註
            <textarea
              maxLength={1000}
              value={notes}
              disabled={confirm || pending}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {(!card || card.available < amount(session, card) * Math.max(learners.length, 1)) && (
            <div className="cp-no-plan">
              {shop.length ? <button className="primary" onClick={() => { setSession(null); go("shop"); }}>查看可購買方案</button> : <p>目前沒有適用的販售方案，請聯絡店家協助。</p>}
            </div>
          )}
        </Sheet>
      )}
      {cancelId && (
        <Sheet
          title="取消預約"
          busy={pending}
          close={() => setCancelId(null)}
          footer={
            <>
              <button disabled={pending} onClick={() => setCancelId(null)}>
                返回
              </button>
              <button
                disabled={pending || !cancelBooking || !canSelfCancel(cancelBooking.startsAt)}
                className="primary"
                onClick={() =>
                  run(
                    () =>
                      updateCourseBookingStatus({
                        bookingId: cancelId,
                        status: "CANCELLED",
                        member: true,
                      }),
                    () => setCancelId(null),
                  )
                }
              >
                確認取消
              </button>
            </>
          }
        >
          <p>
            取消 {cancelBooking?.customerName}{" "}
            的這堂預約，釋放保留額度。
          </p>
          {cancelBooking && <p>自行取消截止：{formatTWDateTime(new Date(cancellationCutoff(cancelBooking.startsAt)))}</p>}
          {cancelBooking && !canSelfCancel(cancelBooking.startsAt) && <p className="cp-error">已超過自行取消期限，請聯絡店家。</p>}
          {error && (
            <p role="alert" className="cp-error">
              {error}
            </p>
          )}
        </Sheet>
      )}
      {attendance && (
        <Sheet
          title={attendance.correction ? "更正點名" : "確認點名"}
          busy={pending}
          close={() => setAttendance(null)}
          footer={
            <>
              <button disabled={pending} onClick={() => setAttendance(null)}>
                返回
              </button>
              <button
                className="primary"
                disabled={pending || !attendance.ids.length}
                onClick={() =>
                  run(
                    () =>
                      saveCourseAttendance({
                        sessionId: attendance.session.id,
                        target: attendance.target,
                        bookings: attendance.session.bookings
                          .filter((b) => attendance.ids.includes(b.id))
                          .map((b) => ({ id: b.id, status: b.status })),
                      }),
                    () => setAttendance(null),
                    attendance.target === "ATTENDED" ? "已標記出席" : attendance.target === "NO_SHOW" ? "已標記未到" : "已更正為待點名",
                    attendance.ids,
                  )
                }
              >
                {attendance.correction ? "確認更正" : attendance.target === "ATTENDED"
                  ? `確認 ${attendance.ids.length} 位出席`
                  : attendance.target === "NO_SHOW" ? `確認 ${attendance.ids.length} 位未到` : "確認更正"}
              </button>
            </>
          }
        >
          <h2>{attendance.session.name}</h2>
          <p>
            {formatTWDateTime(new Date(attendance.session.startsAt))} ·{" "}
            {attendance.session.room}
          </p>
          {error && (
            <p role="alert" className="cp-error">
              {error}
            </p>
          )}
          <label>
            狀態
            <select
              disabled={pending}
              value={attendance.target}
              onChange={(e) =>
                setAttendance({
                  ...attendance,
                  target: e.target.value as typeof attendance.target,
                })
              }
            >
              <option value="ATTENDED">出席</option>
              <option value="NO_SHOW">未到</option>
              <option value="RESERVED">待點名</option>
            </select>
          </label>
          {attendance.session.bookings
            .filter((b) => attendance.ids.includes(b.id))
            .map((b) => (
              <div className="cp-check" key={b.id}>
                <span>
                  {b.customerName}
                  <small>
                    {b.planName} · {b.unit === "TRIAL" ? "不使用方案額度" : `${b.cost} ${unit(b.unit)}`} · {statusName(b.status)}
                  </small>
                </span>
              </div>
            ))}
          <p>只處理以上學員。一般預約出席依方案使用額度；體驗出席不收款、不使用其他方案。更正會保留紀錄。</p>
        </Sheet>
      )}
      {buy && (
        <Sheet
          title="購買方案"
          busy={pending}
          close={() => setBuy(null)}
          footer={
            <>
              <button disabled={pending} onClick={() => setBuy(null)}>
                返回
              </button>
              <button
                className="primary"
                disabled={
                  pending ||
                  !/^\d{4}$/.test(lastFour) ||
                  !p.config?.bankAccountNumber
                }
                onClick={() =>
                  run(
                    () =>
                      purchaseCoursePlan({
                        planId: buy.id,
                        requestKey: key,
                        transferLastFive: lastFour,
                      }),
                    showPurchaseProgress,
                    "購買通知已送出，請等候店家核帳；啟用後即可預約。",
                    [],
                    false,
                  )
                }
              >
                {pending ? "送出中…" : "已匯款，送出核帳資料"}
              </button>
            </>
          }
        >
          <h2>{buy.name}</h2>
          <p>
            NT$ {buy.price.toLocaleString()} · {buy.points}
            {unit(buy.unit)}
          </p>
          <p>
            {p.config?.bankName}（{p.config?.bankCode}）
          </p>
          <div className="cp-bank-account">
            <strong>{p.config?.bankAccountNumber ?? "店家尚未提供收款帳號"}</strong>
            {p.config?.bankAccountNumber && <CopyButton value={p.config.bankAccountNumber} label="複製帳號" onCopied={focusTransferLastFour} />}
          </div>
          <p>店家核帳後啟用，送出通知不會立即取得額度。</p>
          <label>
            轉出帳號後四碼
            <input
              ref={transferLastFourInput}
              aria-label="轉出帳號後四碼"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </label>
          {error && (
            <p role="alert" className="cp-error">
              {error}
            </p>
          )}
        </Sheet>
      )}
    </div>
  );
}
