"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SteamButlerLogo } from "@/components/steam-butler-logo";
import {
  courseDate,
  courseMemberMarkers,
  courseMonthDays,
  coursePeople,
} from "@/lib/course-calendar";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  createMemberCourseBooking,
  updateCourseBookingStatus,
  markCourseCoachAttendance,
} from "@/server/actions/course-members";
import {
  CourseCardSummary,
  CourseCardEntries,
  type CourseCardView,
} from "@/app/(dashboard)/dashboard/courses/member-workspace";
import {
  addTaiwanDuration,
  toLocalDateStr,
  formatTWDateTime,
} from "@/lib/date-utils";
const button =
  "min-h-11 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm text-primary-800 hover:bg-primary-50 disabled:opacity-50";
type Session = {
  id: string;
  name: string;
  startsAt: string;
  room: string;
  cost: number;
  capacity: number;
  occupied: number;
};
type Booking = {
  id: string;
  sessionId: string;
  name: string;
  startsAt: string;
  customerName: string;
  operatorName: string;
  operatorCustomerId: string | null;
  customerId: string;
  status: string;
  cost: number;
  checkedInAt: string | null;
  notes: string;
};
export function CoursePortalClient({
  month,
  serverNow,
  hasWork,
  memberEnabled,
  work,
  customerId,
  customerName,
  cards,
  sessions,
  bookings,
}: {
  month: string;
  serverNow: number;
  hasWork: boolean;
  memberEnabled: boolean;
  work: {
    id: string;
    name: string;
    startsAt: string;
    bookings: {
      id: string;
      customerId: string;
      customerName: string;
      status: string;
      checkedInAt: string | null;
    }[];
  }[];
  customerId: string;
  customerName: string;
  cards: CourseCardView[];
  sessions: Session[];
  bookings: Booking[];
}) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const today = toLocalDateStr(new Date(now));
  const [mode, setMode] = useState(memberEnabled ? "member" : "work");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [chosenDate, setChosenDate] = useState(
    toLocalDateStr(new Date(serverNow)),
  );
  const [workSessionId, setWorkSessionId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [view, setView] = useState("schedule");
  const selectedDate = chosenDate.startsWith(month)
    ? chosenDate
    : `${month}-01`;
  const isWork = hasWork && (!memberEnabled || mode === "work");
  const monthDays = courseMonthDays(month);
  const daySessions = sessions.filter(
    (s) => courseDate(s.startsAt) === selectedDate,
  );
  const dayBookings = bookings.filter(
    (b) => courseDate(b.startsAt) === selectedDate,
  );
  const dayWork = work.filter((s) => courseDate(s.startsAt) === selectedDate);
  const workSession = work.find((s) => s.id === workSessionId);
  function changeMonth(next: string) {
    const query = new URLSearchParams(params.toString());
    query.set("month", next);
    setWorkSessionId(null);
    start(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  }
  function openBooking(s: Session) {
    setMessage("");
    const eligible = cards
      .filter(
        (c) => !c.expired && c.available >= s.cost && c.expiresAt >= s.startsAt,
      )
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    setCardId(eligible[0]?.id ?? "");
    setLearners([customerId]);
    setRequestKey(crypto.randomUUID());
    setSession(s);
  }
  const [pending, start] = useTransition();
  const [session, setSession] = useState<Session | null>(null);
  const [cardId, setCardId] = useState(cards.find((c) => !c.expired)?.id ?? "");
  const [learners, setLearners] = useState<string[]>([customerId]);
  const [requestKey, setRequestKey] = useState("");
  const [message, setMessage] = useState("");
  const card = cards.find((c) => c.id === cardId);
  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    start(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setMessage(result.error ?? "操作失敗");
          router.refresh();
          return;
        }
        setSession(null);
        setMessage("已完成，點數與名額已更新");
        router.refresh();
      } catch {
        setMessage("連線中斷，請重試");
      }
    });
  }
  return (
    <main className="mx-auto max-w-5xl space-y-4 bg-[#f7f8f3] p-3 text-earth-800 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#bcab71] pb-3">
        <SteamButlerLogo compact />
        <h1 className="text-lg font-semibold text-primary-900">
          {customerName} · {isWork ? "我的工作" : "會員專區"}
        </h1>
      </header>
      {message && (
        <p
          role="status"
          className="rounded-lg bg-primary-50 p-3 text-sm text-primary-900"
        >
          {message}
        </p>
      )}
      {hasWork && memberEnabled && (
        <nav aria-label="身分切換" className="flex gap-2">
          {[
            ["member", "會員專區"],
            ["work", "我的工作"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={mode === value}
              className={`${button} ${mode === value ? "!bg-primary-800 !text-white" : ""}`}
              onClick={() => {
                setMode(value);
                setWorkSessionId(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {!memberEnabled && !hasWork ? (
        <p role="status">工作存取已停用，請聯絡店家。</p>
      ) : (
        <>
          {!isWork && (
            <details className="rounded-xl border border-earth-200 bg-white p-3">
              <summary className="cursor-pointer font-medium text-primary-800">
                我的點數與共卡 ·{" "}
                {cards
                  .filter((c) => !c.expired)
                  .reduce((sum, c) => sum + c.available, 0)}{" "}
                點可用
              </summary>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto overscroll-contain">
                {cards.map((c) => (
                  <details
                    key={c.id}
                    className={`rounded-lg border p-3 ${c.expired ? "bg-earth-50 text-earth-500" : "bg-white"}`}
                  >
                    <summary className="cursor-pointer text-sm">
                      {c.name}
                      {c.expired ? "（已到期）" : ""} · 可用 {c.available}{" "}
                      點／占用 {c.held} 點
                    </summary>
                    <div className="pt-3">
                      <CourseCardSummary card={c} />
                      <CourseCardEntries card={c} />
                    </div>
                  </details>
                ))}
                {!cards.length && <p>目前沒有可使用方案，請聯絡店家。</p>}
              </div>
            </details>
          )}
          <section
            className="overflow-hidden rounded-xl border border-earth-200 bg-white"
            aria-label={isWork ? "我的授課月曆" : "課程預約月曆"}
          >
            <div className="flex items-center justify-between gap-2 border-b border-earth-100 p-3">
              <button
                className={button}
                aria-label="上個月"
                disabled={pending}
                onClick={() =>
                  changeMonth(
                    addTaiwanDuration(`${month}-01`, -1, "MONTH").slice(0, 7),
                  )
                }
              >
                ‹
              </button>
              <h2 className="font-semibold text-primary-900">
                {month.replace("-", " 年 ")} 月
              </h2>
              <div className="flex gap-2">
                <button
                  className={button}
                  disabled={pending}
                  onClick={() => {
                    setChosenDate(toLocalDateStr());
                    changeMonth(toLocalDateStr().slice(0, 7));
                  }}
                >
                  今天
                </button>
                <button
                  className={button}
                  aria-label="下個月"
                  disabled={pending}
                  onClick={() =>
                    changeMonth(
                      addTaiwanDuration(`${month}-01`, 1, "MONTH").slice(0, 7),
                    )
                  }
                >
                  ›
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 bg-primary-50 text-center text-sm text-primary-800">
              {"日一二三四五六".split("").map((day) => (
                <span key={day} className="py-2">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-earth-100">
              {Array.from({ length: monthDays.offset }, (_, i) => (
                <div key={`empty-${i}`} className="bg-earth-50" />
              ))}
              {monthDays.dates.map((date) => {
                const lessons = (isWork ? work : sessions).filter(
                  (s) => courseDate(s.startsAt) === date,
                );
                const learners = isWork
                  ? work
                      .filter((s) => courseDate(s.startsAt) === date)
                      .flatMap((s) => s.bookings)
                  : bookings.filter((b) => courseDate(b.startsAt) === date);
                const marks = courseMemberMarkers(learners, customerId);
                const counts = coursePeople(learners);
                return (
                  <button
                    key={date}
                    aria-label={`${date}，${lessons.length} 堂課${isWork ? `，${counts.visits} 人次` : `${marks.self ? "，本人上課" : ""}${marks.shared ? "，共卡學員上課" : ""}`}`}
                    aria-pressed={selectedDate === date}
                    onClick={() => setChosenDate(date)}
                    className={`flex min-h-20 flex-col items-center justify-start gap-1 px-1 py-2 text-sm sm:min-h-24 ${selectedDate === date ? "bg-primary-100 ring-2 ring-inset ring-primary-700" : lessons.length || learners.length ? "bg-white hover:bg-primary-50" : "bg-earth-50 text-earth-400"}`}
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${date === today ? "bg-primary-800 text-white" : ""}`}
                    >
                      {Number(date.slice(-2))}
                    </span>
                    {isWork ? (
                      lessons.length > 0 && (
                        <span className="text-[11px] sm:text-xs">
                          {lessons.length} 堂課
                          <br />
                          {counts.visits} 人次
                        </span>
                      )
                    ) : (
                      <>
                        {lessons.length > 0 && (
                          <span className="text-[11px] text-earth-600">
                            {lessons.length} 堂課
                          </span>
                        )}
                        <span className="flex gap-1" aria-hidden="true">
                          {marks.self && (
                            <span className="h-2 w-2 rounded-full bg-blue-600" />
                          )}
                          {marks.shared && (
                            <span className="h-2 w-2 rounded-full bg-orange-500" />
                          )}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="border-t p-3 text-xs text-earth-600">
              {isWork
                ? "僅顯示你的授課；同一位學員跨堂參加，每堂計 1 人次。"
                : "🔵 本人上課　🟠 共卡學員上課　淡色：無課程。點日期查看實際上課者。"}
            </p>
          </section>
          <section
            aria-label="當日課程"
            className="rounded-xl border border-earth-200 bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#bcab71] p-3">
              <h2 className="font-semibold text-primary-900">
                {selectedDate} ·{" "}
                {isWork
                  ? `${dayWork.length} 堂課／${coursePeople(dayWork.flatMap((s) => s.bookings)).people} 人／${coursePeople(dayWork.flatMap((s) => s.bookings)).visits} 人次`
                  : "當日課程"}
              </h2>
              {!isWork && (
                <nav className="flex gap-2" aria-label="課程清單切換">
                  {[
                    ["schedule", "課表預約"],
                    ["bookings", "我的預約"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`${button} ${view === value ? "!bg-primary-800 !text-white" : ""}`}
                      aria-pressed={view === value}
                      onClick={() => setView(value)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              )}
            </div>
            <div className="max-h-80 divide-y overflow-y-auto overscroll-contain">
              {isWork ? (
                <>
                  {dayWork.map((s) => (
                    <button
                      key={s.id}
                      className="flex min-h-16 w-full items-center justify-between gap-3 p-3 text-left hover:bg-primary-50"
                      onClick={() => setWorkSessionId(s.id)}
                    >
                      <span>
                        <strong>
                          {formatTWDateTime(new Date(s.startsAt)).slice(-5)} ·{" "}
                          {s.name}
                        </strong>
                        <span className="mt-1 block text-sm text-earth-600">
                          {s.bookings.length} 位學員 ·{" "}
                          {
                            s.bookings.filter((b) => b.status === "RESERVED")
                              .length
                          }{" "}
                          位待完成
                        </span>
                      </span>
                      <span className="text-sm text-primary-700">
                        名單／點名 ›
                      </span>
                    </button>
                  ))}
                  {!dayWork.length && (
                    <p className="p-4 text-earth-500">當日沒有授課。</p>
                  )}
                </>
              ) : view === "schedule" ? (
                <>
                  {daySessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {formatTWDateTime(new Date(s.startsAt)).slice(-5)} ·{" "}
                          {s.name}
                        </p>
                        <p className="text-sm text-earth-600">
                          {s.room} · {s.cost} 點 · {s.occupied}／{s.capacity} 人
                        </p>
                        {dayBookings
                          .filter(
                            (b) =>
                              b.sessionId === s.id && b.status !== "CANCELLED",
                          )
                          .map((b) => (
                            <p key={b.id} className="mt-1 text-sm">
                              {b.customerId === customerId
                                ? "🔵 本人"
                                : "🟠 共卡學員"}
                              ：{b.customerName} ·{" "}
                              {b.status === "ATTENDED"
                                ? "已完成"
                                : b.status === "NO_SHOW"
                                  ? "未到"
                                  : b.checkedInAt
                                    ? "已報到"
                                    : "已預約"}
                            </p>
                          ))}
                      </div>
                      <button
                        className={button}
                        disabled={
                          pending ||
                          new Date(s.startsAt).getTime() <= now ||
                          s.occupied >= s.capacity
                        }
                        onClick={() => openBooking(s)}
                      >
                        {new Date(s.startsAt).getTime() <= now
                          ? "已開始"
                          : s.occupied >= s.capacity
                            ? "已滿班"
                            : "預約／共卡代約"}
                      </button>
                    </div>
                  ))}
                  {!daySessions.length && (
                    <p className="p-4 text-earth-500">
                      當日沒有可預約課程；歷史紀錄可切換「我的預約」。
                    </p>
                  )}
                </>
              ) : (
                <>
                  {[...new Set(dayBookings.map((b) => b.sessionId))].map(
                    (id) => {
                      const group = dayBookings.filter(
                        (b) => b.sessionId === id,
                      );
                      return (
                        <article key={id} className="p-3">
                          <h3 className="font-semibold">
                            {formatTWDateTime(
                              new Date(group[0].startsAt),
                            ).slice(-5)}{" "}
                            · {group[0].name}
                          </h3>
                          {group.map((b) => (
                            <div
                              key={b.id}
                              className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-earth-50 p-3 text-sm"
                            >
                              <div>
                                <p className="font-medium">
                                  {b.customerId === customerId
                                    ? "🔵 本人上課"
                                    : "🟠 共卡學員"}
                                  ：{b.customerName}
                                </p>
                                <p>
                                  操作人：{b.operatorName} ·{" "}
                                  {b.operatorCustomerId === b.customerId
                                    ? "自己預約"
                                    : b.operatorCustomerId
                                      ? "共卡代約"
                                      : "店長代約"}
                                </p>
                                <p>
                                  {b.status === "ATTENDED"
                                    ? "已完成，扣除"
                                    : b.status === "CANCELLED"
                                      ? "已取消，釋放"
                                      : b.status === "NO_SHOW"
                                        ? "未到，釋放"
                                        : b.checkedInAt
                                          ? "已報到，尚未扣點，占用"
                                          : "已預約，占用"}{" "}
                                  {b.cost} 點
                                </p>
                                {b.notes && <p>本次預約備註：{b.notes}</p>}
                              </div>
                              {b.status === "RESERVED" && (cancelId === b.id ? <div role="group" aria-label="確認取消預約" className="w-full space-y-2 rounded-lg border border-orange-200 bg-orange-50 p-3">
                                <p>取消 {b.customerName} 的「{b.name}」預約？將釋放 {b.cost} 點占用。</p>
                                <div className="flex gap-2"><button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "CANCELLED", member: true }))}>確認取消</button>
                                <button className={button} disabled={pending} onClick={() => setCancelId(null)}>保留預約</button></div>
                              </div> : <button className={button} disabled={pending} onClick={() => setCancelId(b.id)}>取消 {b.customerName}</button>)}
                            </div>
                          ))}
                        </article>
                      );
                    },
                  )}
                  {!dayBookings.length && (
                    <p className="p-4 text-earth-500">
                      當日沒有本人或共卡預約紀錄。
                    </p>
                  )}
                </>
              )}
            </div>
          </section>
        </>
      )}
      {isWork && workSession && (
        <RightSheet
          open
          onClose={() => !pending && setWorkSessionId(null)}
          labelledById="course-coach-title"
        >
          <header className="shrink-0 border-b border-[#bcab71] p-4">
            <h2
              id="course-coach-title"
              className="font-semibold text-primary-900"
            >
              {workSession.name} · 學員名單
            </h2>
            <p className="text-sm">
              {formatTWDateTime(new Date(workSession.startsAt))}
            </p>
            <p className="mt-2 text-sm text-earth-600">
              報到不扣點；完成才正式扣點。未到釋放占用，不加收費用。
            </p>
          </header>
          <div className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain p-4">
            {message && (
              <p role="status" className="py-2">
                {message}
              </p>
            )}
            {workSession.bookings.map((b) => (
              <div key={b.id} className="py-3">
                <p className="mb-2 font-medium">
                  {b.customerName} ·{" "}
                  {b.status === "ATTENDED"
                    ? "已完成"
                    : b.status === "NO_SHOW"
                      ? "未到"
                      : b.checkedInAt
                        ? "已報到，待完成"
                        : "待報到"}
                </p>
                {b.status === "RESERVED" && (
                  <div className="flex flex-wrap gap-2">
                    {!b.checkedInAt && (
                      <button
                        className={button}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            markCourseCoachAttendance({
                              bookingId: b.id,
                              status: "CHECKED_IN",
                            }),
                          )
                        }
                      >
                        報到
                      </button>
                    )}
                    <button
                      className={`${button} !bg-primary-800 !text-white`}
                      disabled={
                        pending ||
                        new Date(workSession.startsAt).getTime() > now
                      }
                      onClick={() =>
                        run(() =>
                          markCourseCoachAttendance({
                            bookingId: b.id,
                            status: "ATTENDED",
                          }),
                        )
                      }
                    >
                      完成並扣點
                    </button>
                    <button
                      className={button}
                      disabled={
                        pending ||
                        new Date(workSession.startsAt).getTime() > now
                      }
                      onClick={() =>
                        run(() =>
                          markCourseCoachAttendance({
                            bookingId: b.id,
                            status: "NO_SHOW",
                          }),
                        )
                      }
                    >
                      未到
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!workSession.bookings.length && (
              <p className="py-4">尚無學員預約。</p>
            )}
          </div>
          <footer className="shrink-0 border-t p-4">
            <button
              className={`${button} w-full`}
              disabled={pending}
              onClick={() => setWorkSessionId(null)}
            >
              返回當日課程
            </button>
          </footer>
        </RightSheet>
      )}
      {session && (
        <RightSheet
          open
          onClose={() => !pending && setSession(null)}
          labelledById="course-book-title"
        >
          <header className="shrink-0 border-b p-4">
            <h2 id="course-book-title" className="font-semibold">
              預約 {session.name}
            </h2>
            <p>
              {formatTWDateTime(new Date(session.startsAt))} · 每人{" "}
              {session.cost} 點
            </p>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {message && <p role="alert">{message}</p>}
            <form
              id="course-book-form"
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                run(() =>
                  createMemberCourseBooking({
                    sessionId: session.id,
                    cardId,
                    customerIds: learners,
                    requestKey,
                    notes: data.get("notes"),
                  }),
                );
              }}
            >
              <label className="block">
                使用方案
                <select
                  className={`${button} w-full`}
                  required
                  value={cardId}
                  onChange={(e) => {
                    setCardId(e.target.value);
                    setLearners([customerId]);
                    setRequestKey(crypto.randomUUID());
                  }}
                >
                  <option value="" disabled>
                    請選擇可用方案
                  </option>
                  {cards.map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={
                        c.expired ||
                        c.available < session.cost ||
                        c.expiresAt < session.startsAt
                      }
                    >
                      {c.name}
                      {c.expired
                        ? "（已到期）"
                        : c.available < session.cost
                          ? "（點數不足）"
                          : c.expiresAt < session.startsAt
                            ? "（不涵蓋上課日期）"
                            : ""}{" "}
                      · 可用 {c.available} 點 · 到期{" "}
                      {formatTWDateTime(new Date(c.expiresAt)).slice(0, 10)}
                    </option>
                  ))}
                </select>
              </label>
              {!cardId && (
                <p role="alert" className="text-sm text-red-700">
                  沒有點數足夠且涵蓋上課日期的方案，請聯絡店家。
                </p>
              )}
              <fieldset className="space-y-2">
                <legend className="font-medium">誰要上課？</legend>
                {card?.members.map((m) => (
                  <label
                    key={m.id}
                    className="flex min-h-11 items-center gap-3 rounded-lg border p-3"
                  >
                    <input
                      type="checkbox"
                      checked={learners.includes(m.id)}
                      onChange={(e) => {
                        setLearners((current) =>
                          e.target.checked
                            ? [...current, m.id]
                            : current.filter((id) => id !== m.id),
                        );
                        setRequestKey(crypto.randomUUID());
                      }}
                    />
                    {m.name}（{m.id === customerId ? "本人" : "共卡學員"}）
                  </label>
                ))}
                <p className="text-sm">
                  共 {learners.length} 位 · 本次保留{" "}
                  {learners.length * session.cost} 點 · 預約後可用{" "}
                  {Math.max(
                    0,
                    (card?.available ?? 0) - learners.length * session.cost,
                  )}{" "}
                  點
                </p>
                {learners.length > session.capacity - session.occupied && (
                  <p role="alert" className="text-sm text-red-700">
                    剩餘名額不足，整筆不會建立。
                  </p>
                )}
                {card && learners.length * session.cost > card.available && (
                  <p role="alert" className="text-sm text-red-700">
                    可用點數不足，整筆不會建立。
                  </p>
                )}
              </fieldset>
              <label className="block">
                本次預約備註
                <textarea
                  className={`${button} w-full`}
                  name="notes"
                  maxLength={1000}
                />
              </label>
              <p className="text-sm">
                操作人：{customerName}
                。只為勾選的上課人保留名額；取消勾選本人即可只替共卡學員預約。
              </p>
            </form>
          </div>
          <footer className="flex shrink-0 gap-2 border-t p-4">
            <button
              className={button}
              disabled={pending}
              onClick={() => setSession(null)}
            >
              返回
            </button>
            <button
              type="submit"
              form="course-book-form"
              className={`${button} flex-1 bg-primary-700 text-white`}
              disabled={
                pending ||
                !cardId ||
                !learners.length ||
                learners.length > session.capacity - session.occupied ||
                learners.length * session.cost > (card?.available ?? 0)
              }
            >
              確認預約
            </button>
          </footer>
        </RightSheet>
      )}
    </main>
  );
}
