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
  markCourseCoachAttendance,
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
import "./course-portal.css";
type Session = CoursePortalData["sessions"][number];
type Work = CoursePortalData["work"][number];
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
      target: "ATTENDED" | "NO_SHOW" | "RESERVED" | "CHECKED_IN";
    } | null>(null),
    [buy, setBuy] = useState<CoursePortalData["plans"][number] | null>(null),
    [lastFive, setLastFive] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [pending, start] = useTransition();
  const busyRef = useRef(false),
    trail = useRef<Array<{ page: Page; y: number }>>([]),
    daily = useRef<HTMLElement>(null);
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
  const todayWork = p.work.filter(s => courseDate(s.startsAt) === today);
  const overdue = p.work.filter(s => courseDate(s.startsAt) < today && needsRoll(s) && isEnded(s));
  const monthlyWork = p.work.filter(s => courseDate(s.startsAt).startsWith(p.month));
  const taught = monthlyWork.filter(s => isEnded(s) && !needsRoll(s) && s.bookings.some(b => b.status === "ATTENDED"));
  const taughtHours = Math.round(taught.reduce((n,s) => n + (Date.parse(s.endsAt)-Date.parse(s.startsAt))/3600000,0)*10)/10;
  const weekStart = addTaiwanDuration(selected, -((parseLocalDate(selected).getDay()+6)%7), "DAY");
  const weekDays = Array.from({length:7},(_,i) => addTaiwanDuration(weekStart,i,"DAY"));
  const historyWork = monthlyWork.filter(s => isEnded(s) && (recordFilter !== "pending" || needsRoll(s)));
  const refreshGuard = useRef({ modal, pending });
  useEffect(() => {
    refreshGuard.current = { modal: modal || !!editingNote, pending };
  }, [modal, pending, editingNote]);
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
        ["home", "今日工作", "⌂"],
        ["schedule", "課表", "▦"],
        ["records", "授課紀錄", "☷"],
      ]
    : [
        ["home", "首頁", "⌂"],
        ["schedule", "預約", "▦"],
        ["bookings", "我的預約", "☷"],
        ["account", "我的", "○"],
      ];
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
    if (editingNote && editingNote.value !== (editingNote.original ?? "") && !window.confirm("本堂備註尚未儲存，要放棄修改嗎？")) return false;
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
    action: () => Promise<{ success: boolean; error?: string }>,
    done: () => void,
    successMessage = "已更新",
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    start(async () => {
      try {
        const r = await action();
        if (!r.success) {
          setError(r.error ?? "操作失敗，請重試");
          router.refresh();
          return;
        }
        done();
        setMessage(successMessage);
        router.refresh();
      } catch {
        setError("連線中斷，請重試；目前選擇已保留。");
      } finally {
        busyRef.current = false;
      }
    });
  }
  function checkIn(bookingId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    start(async () => {
      try {
        const result = await markCourseCoachAttendance({ bookingId, status: "CHECKED_IN" });
        if (!result.success) setError(result.error ?? "報到失敗，請重試");
        else setMessage("已報到，未扣抵額度");
        router.refresh();
      } catch { setError("連線中斷，請重試；報到重送不會扣抵額度。"); }
      finally { busyRef.current = false; }
    });
  }
  const eligible = (s: Session) =>
    p.cards
      .filter(
        (c) =>
          !c.expired && !c.closed &&
          c.expiresAt >= s.startsAt &&
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
          const sessions = (coach ? p.work : p.sessions).filter(
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
              {s.room} · {s.cost} 點／堂 · 剩{" "}
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
        arrivedPeople = pendingPeople.filter((b) => b.checkedIn),
        unarrivedPeople = pendingPeople.filter((b) => !b.checkedIn),
        ended = new Date(s.startsAt).getTime() <= now,
        filtered = people.filter((b) => b.customerName.includes(search)),
        readOnly = page === "records" && recordEdit !== s.id;
      return (
        <article key={s.id} className="cp-card">
          <button
            className="cp-menu"
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
              </strong>
              <small>
                {s.room} · {people.length} 位學員 ·{" "}
                {page === "records" ? `出席 ${people.filter(b=>b.status === "ATTENDED").length} 人／未到 ${people.filter(b=>b.status === "NO_SHOW").length} 人 · ${pendingPeople.length ? "待完成點名" : people.length ? "點名完成" : "無有效預約"}` : pendingPeople.length
                  ? `待點名 ${pendingPeople.length} 位`
                  : people.length
                    ? "點名完成"
                    : "尚無學員"}
              </small>
            </span>
            <span>{roster === s.id ? "收合" : page === "records" ? "查看明細" : "名單／點名"}</span>
          </button>
          {roster === s.id && (
            <div className="cp-pad">
              <div className="cp-line">
                <strong>學員名單</strong>
              </div>
              {readOnly ? <button onClick={() => setRecordEdit(s.id)}>{pendingPeople.length ? "補完點名" : "更正紀錄"}</button> : <p>報到只記錄到場，不扣點／堂；開課後請再確認出席。</p>}
              <div className="cp-actions">
                {!readOnly && unarrivedPeople.length > 0 && <button disabled={pending} onClick={() => { setError(""); setAttendance({ session: s, ids: unarrivedPeople.map(b => b.id), target: "CHECKED_IN" }); }}>全班報到（尚未報到 {unarrivedPeople.length} 人）</button>}
                {!readOnly && arrivedPeople.length > 0 && (
                  <button
                    className="primary"
                    disabled={!ended || pending}
                    onClick={() => {
                      setError("");
                      setAttendance({
                        session: s,
                        ids: arrivedPeople.map((b) => b.id),
                        target: "ATTENDED",
                      });
                    }}
                  >
                    將已報到 {arrivedPeople.length} 人標記出席
                  </button>
                )}
              </div>
              {!ended && <p>尚未開課，可先報到；出席／未到於開課後開放。</p>}
              {!people.length && <p className="cp-empty">尚無學員預約</p>}
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
              {filtered.slice(0, limit).map((b) => (
                <div className="cp-person" key={b.id}>
                  <div className="cp-attendance-row">
                    <strong>{b.customerName}</strong>
                    <div className="cp-attendance-actions">
                      <span className="cp-badge" data-status={b.status}>
                        {b.status === "RESERVED"
                          ? (b.checkedIn ? "已報到・待出席" : "待報到")
                          : statusName(b.status)}
                      </span>
                      {readOnly ? null : b.status === "RESERVED" ? (
                        <>
                          {!b.checkedIn && <button disabled={pending} onClick={() => { checkIn(b.id); }}>報到</button>}
                          <button
                            className="primary"
                            disabled={!ended || pending}
                            onClick={() => {
                              setError("");
                              run(
                                () => saveCourseAttendance({ sessionId: s.id, target: "ATTENDED", bookings: [{ id: b.id, status: b.status }] }),
                                () => {},
                                `${b.customerName} 已標記出席`,
                              );
                            }}
                          >
                            出席
                          </button>
                          <button
                            disabled={!ended || pending}
                            onClick={() => {
                              setError("");
                              run(
                                () => saveCourseAttendance({ sessionId: s.id, target: "NO_SHOW", bookings: [{ id: b.id, status: b.status }] }),
                                () => {},
                                `${b.customerName} 已標記未到`,
                              );
                            }}
                          >
                            未到
                          </button>
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
                            });
                          }}
                        >
                          更正
                        </button>
                      )}
                    </div>
                  </div>
                  <details>
                    <summary>本堂備註與方案</summary>
                    <p>{b.planName} · {b.unit === "TRIAL" ? "不使用方案額度" : `${b.cost} ${unit(b.unit)}`}</p>
                    {editingNote?.id === b.id ? <form onSubmit={e => { e.preventDefault(); run(() => saveCourseCoachNote({ bookingId: b.id, notes: editingNote.value, previousNotes: editingNote.original }), () => setEditingNote(null), "本堂備註已儲存"); }}>
                      <label>本堂預約備註（學員與店長可查看）<textarea aria-label={`${b.customerName}本堂備註`} maxLength={1000} value={editingNote.value} onChange={e => setEditingNote({ ...editingNote, value: e.target.value })} disabled={pending} /></label>
                      <div className="cp-actions"><button type="submit" disabled={pending}>儲存備註</button><button type="button" disabled={pending} onClick={() => leaveNote()}>取消修改</button></div>
                    </form> : <><p>{b.notes || "尚無備註"}</p><button disabled={pending} onClick={() => { if (leaveNote()) setEditingNote({ id: b.id, original: b.notes, value: b.notes ?? "" }); }}>編輯本堂備註</button></>}
                  </details>
                </div>
              ))}
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
            <select
              aria-label="身分"
              value={role}
              onChange={(e) => {
                if (!leaveNote()) return;
                setRole(e.target.value);
                setDate(today);
                if (e.target.value === "coach" && !today.startsWith(p.month)) month(today.slice(0, 7));
                setPage("home");
                setRoster(null);
                setSearch("");
                setError("");
                trail.current = [];
              }}
            >
              <option value="member">會員專區</option>
              <option value="coach">我的工作</option>
            </select>
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
              <span aria-hidden>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <main className={`cp-main${coach ? " cp-coach-main" : ""}`}>
          <div className="cp-refresh">
            <span>更新於 {time(new Date(p.serverNow).toISOString())}</span>
            <button
              disabled={pending}
              onClick={() => start(() => router.refresh())}
            >
              {pending ? "更新中…" : "更新"}
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
                  <p>
                    {coach ? p.nextWork?.room : p.nextBooking?.customerName}
                  </p>
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
                  <section className="cp-card">
                    {menu("預約課程", "schedule")}
                    {menu(
                      "我的方案",
                      "plans",
                      p.cards.length
                        ? `${p.cards.filter((c) => !c.expired && !c.closed).length} 個有效方案`
                        : "尚無方案",
                    )}
                  </section>
                  <h2>會員服務</h2>
                  <section className="cp-card">
                    {menu("購買方案", "shop")}
                    {p.healthEnabled && menu("健康追蹤", "health")}
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
                  <div className="cp-work-date"><button aria-label="上一週" disabled={pending} onClick={() => workDate(addTaiwanDuration(selected,-7,"DAY"))}>‹</button><strong>{weekDays[0].slice(5)} — {weekDays[6].slice(5)}</strong><button aria-label="下一週" disabled={pending} onClick={() => workDate(addTaiwanDuration(selected,7,"DAY"))}>›</button></div>
                  <div className="cp-week-strip">{weekDays.map((d,i)=><button key={d} disabled={pending} aria-pressed={selected===d} className={selected===d?"primary":""} onClick={()=>workDate(d)}><span>{"一二三四五六日"[i]}</span><strong>{Number(d.slice(-2))}</strong><small>{p.work.filter(s=>courseDate(s.startsAt)===d).length}堂</small></button>)}</div>
                  <div className="cp-actions"><button disabled={pending} onClick={()=>workDate(today)}>今天</button><button aria-expanded={showWorkCalendar} onClick={()=>setShowWorkCalendar(!showWorkCalendar)}>{showWorkCalendar?"收起月曆":"月曆"}</button></div>
                  {showWorkCalendar && calendar}
                </> : calendar}
                <section ref={daily} className="cp-daily">
                  <h2>
                    {selected} · {coach ? "授課" : "當日課程"}
                  </h2>
                  {coach && !p.work.some(s=>courseDate(s.startsAt)===selected) && <p className="cp-empty">當日沒有排課</p>}
                  {coach
                    ? workRows(
                        p.work.filter(
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
                  <article className="cp-card cp-pad" key={id}>
                    <h2>{first.name}</h2>
                    <p>
                      {formatTWDateTime(new Date(first.startsAt))} ·{" "}
                      {first.room}
                    </p>
                    {list.map((b) => (
                      <div className="cp-person" key={b.id}>
                        <div className="cp-line">
                          <strong>
                            {b.customerId === p.customerId ? "🔵 " : "🟠 "}
                            {b.customerName}
                          </strong>
                          <span className="cp-badge" data-status={b.status}>
                            {statusName(b.status)}
                          </span>
                          {b.status === "RESERVED" && (
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
                        </div>
                        <details>
                          <summary>預約明細</summary>
                          <p>
                            {b.unit === "TRIAL" ? `體驗 NT$ ${b.trialPrice} · ${b.trialPaid === null ? "尚未收款" : `已收款 NT$ ${b.trialPaid}`}` : b.planName}{b.expiresAt ? ` · ${courseDate(b.expiresAt)} 到期` : ""}
                          </p>
                          <p>
                            {b.unit === "TRIAL" ? "" : b.status === "ATTENDED"
                              ? "已使用"
                              : b.status === "RESERVED"
                                ? "保留"
                                : "已釋放"}{" "}
                            {b.unit === "TRIAL" ? "體驗不使用方案額度" : `${b.cost} ${unit(b.unit)}`}
                          </p>
                          {b.customerId !== p.customerId && (
                            <p>預約人：{b.operatorName}</p>
                          )}
                          {b.notes && <p>備註：{b.notes}</p>}
                        </details>
                      </div>
                    ))}
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
                {p.healthEnabled && menu("健康追蹤", "health")}
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
              <a className="cp-btn" href={`${p.prefix}/book/reminders`}>低可用額度提醒接收設定</a>
              {p.cards.map((c) => (
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
                            }[e.kind] ?? e.kind)}{" "}
                        · {e.points}
                        {unit(c.unit)}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
              {!p.cards.length && <p>尚無方案</p>}
              <button className="primary" onClick={() => go("shop")}>
                購買方案
              </button>
            </>
          )}
          {page === "shop" && (
            <>
              {heading("購買方案")}
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
                      setLastFive("");
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
              {p.orders.slice(0, limit).map((o) => (
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
                  <p>匯款後五碼：{o.transferLastFive}</p>
                  {!!o.refunds.length&&<details><summary>退款紀錄 · 共 NT$ {o.refunds.reduce((sum,r)=>sum+r.amount,0).toLocaleString()}</summary>{o.refunds.map(r=><p key={r.id}>{formatTWDateTime(new Date(r.createdAt))} · NT$ {r.amount.toLocaleString()} · {COURSE_REFUND_METHOD_LABELS[r.method]??"其他非現金"}</p>)}<p>此為店家登錄紀錄，實際款項請向店家核對。</p></details>}
                </article>
              ))}
              {!p.orders.length && <p>尚無購買紀錄</p>}
              {p.orders.length > limit && (
                <button onClick={() => setLimit(limit + 20)}>顯示更多</button>
              )}
            </>
          )}
          {page === "shared" && (
            <>
              {heading("共卡成員")}
              {p.cards
                .filter((c) => c.members.length > 1)
                .map((c) => (
                  <article className="cp-card cp-pad" key={c.id}>
                    <h2>{c.name}{c.closed ? " · 已結清停用" : ""}</h2>
                    <p>{c.members.map((m) => m.name).join("、")}</p>
                    <p>可替以上授權成員預約，不會開放其他人的健康資料。</p>
                  </article>
                ))}
            </>
          )}
          {page === "health" && p.healthEnabled && (
            <>
              {heading("健康追蹤")}
              <CourseHealthWorkspace member />
            </>
          )}
          {page === "store" && (
            <>
              {heading(p.storeName)}
              {p.referralShare && <details className="cp-card cp-pad"><summary>推薦給朋友</summary><div className="mt-3"><ShareReferral storeName={p.storeName} referralUrl={p.referralShare.referralUrl} shareTemplate={p.referralShare.shareTemplate} source="course-member" trackAction={trackCourseShare}/></div></details>}
              <section className="cp-card cp-pad">
                <p>{p.config?.address ?? "地址尚未提供"}</p>
                {p.config?.mapUrl && /^https:\/\//.test(p.config.mapUrl) && (
                  <a href={p.config.mapUrl} target="_blank" rel="noreferrer">
                    開啟地圖
                  </a>
                )}
                {p.config?.lineOfficialUrl &&
                  /^https:\/\//.test(p.config.lineOfficialUrl) && (
                    <a
                      className="cp-menu"
                      href={p.config.lineOfficialUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      聯絡店家
                    </a>
                  )}
              </section>
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
            {formatTWDateTime(new Date(session.startsAt))} · {session.room}
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
          {(!card ||
            card.available <
              amount(session, card) * Math.max(learners.length, 1)) && (
            <>
              <h3>購買適用方案</h3>
              {shop.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => {
                    setBuy(plan);
                    setKey(crypto.randomUUID());
                    setLastFive("");
                  }}
                >
                  {plan.name} · NT$ {plan.price}
                </button>
              ))}
            </>
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
                disabled={pending}
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
            取消 {p.bookings.find((b) => b.id === cancelId)?.customerName}{" "}
            的這堂預約，釋放保留額度。
          </p>
          {error && (
            <p role="alert" className="cp-error">
              {error}
            </p>
          )}
        </Sheet>
      )}
      {attendance && (
        <Sheet
          title={attendance.target === "CHECKED_IN" ? "確認報到" : "確認點名／更正"}
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
                    attendance.target === "CHECKED_IN" ? "已報到，未扣抵額度" : attendance.target === "ATTENDED" ? "已標記出席" : attendance.target === "NO_SHOW" ? "已標記未到" : "已更正為待點名",
                  )
                }
              >
                {attendance.target === "ATTENDED"
                  ? `確認 ${attendance.ids.length} 位出席`
                  : attendance.target === "CHECKED_IN" ? `確認 ${attendance.ids.length} 位報到` : attendance.target === "NO_SHOW" ? `確認 ${attendance.ids.length} 位未到` : "確認更正"}
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
          {attendance.target !== "CHECKED_IN" && <label>
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
          </label>}
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
          <p>{attendance.target === "CHECKED_IN" ? "只記錄以上學員已到場，不扣點／堂；開課後仍須確認出席。" : "只處理以上學員。一般預約出席依方案使用額度；體驗出席不收款、不使用其他方案。更正會保留紀錄。"}</p>
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
                  !/^\d{5}$/.test(lastFive) ||
                  !p.config?.bankAccountNumber
                }
                onClick={() =>
                  run(
                    () =>
                      purchaseCoursePlan({
                        planId: buy.id,
                        requestKey: key,
                        transferLastFive: lastFive,
                      }),
                    () => {
                      setBuy(null);
                      setSession(null);
                      setPage("orders");
                    },
                  )
                }
              >
                已匯款，送出通知
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
          <p>{p.config?.bankAccountNumber ?? "店家尚未提供收款帳號"}</p>
          <p>店家核帳後啟用，送出通知不會立即取得額度。</p>
          <label>
            匯款帳號後五碼
            <input
              inputMode="numeric"
              maxLength={5}
              value={lastFive}
              onChange={(e) => setLastFive(e.target.value.replace(/\D/g, ""))}
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
