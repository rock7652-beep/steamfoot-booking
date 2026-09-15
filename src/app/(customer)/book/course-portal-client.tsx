"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { formatTWDateTime } from "@/lib/date-utils";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
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
  name: string;
  startsAt: string;
  customerName: string;
  operatorName: string;
  operatorCustomerId: string | null;
  customerId: string;
  status: string;
  cost: number;
};
export function CoursePortalClient({
  hasWork,
  memberEnabled,
  work,
  customerId,
  customerName,
  cards,
  sessions,
  bookings,
}: {
  hasWork: boolean;
  memberEnabled: boolean;
  work: {
    id: string;
    name: string;
    startsAt: string;
    bookings: { id: string; customerName: string; status: string }[];
  }[];
  customerId: string;
  customerName: string;
  cards: CourseCardView[];
  sessions: Session[];
  bookings: Booking[];
}) {
  const [mode, setMode] = useState(memberEnabled ? "member" : "work");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [session, setSession] = useState<Session | null>(null);
  const [cardId, setCardId] = useState(cards.find((c) => !c.expired)?.id ?? "");
  const [requestKey, setRequestKey] = useState("");
  const [message, setMessage] = useState("");
  const card = cards.find((c) => c.id === cardId);
  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    start(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setMessage(result.error ?? "操作失敗");
          return;
        }
        setSession(null);
        setMessage("已完成，點數與名额已更新");
        router.refresh();
      } catch {
        setMessage("連線中斷，請重試");
      }
    });
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">
        {customerName} 的{memberEnabled ? "會員專區" : "我的工作"}
      </h1>
      {message && <p role="status">{message}</p>}
      {hasWork && memberEnabled && (
        <nav className="flex gap-2">
          <button className={button} onClick={() => setMode("member")}>
            會員專區
          </button>
          <button className={button} onClick={() => setMode("work")}>
            我的工作
          </button>
        </nav>
      )}
      {(!memberEnabled || mode === "work") && hasWork ? (
        <section>
          <h2 className="font-semibold">我的工作</h2>
          {work.map((s) => (
            <article key={s.id} className="my-3 rounded-lg border bg-white p-3">
              <h3>
                {formatTWDateTime(new Date(s.startsAt))} · {s.name}
              </h3>
              {s.bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between border-t py-2"
                >
                  <span>
                    {b.customerName} ·{" "}
                    {b.status === "ATTENDED" ? "已出席" : "待點名"}
                  </span>
                  {b.status === "RESERVED" && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          markCourseCoachAttendance({ bookingId: b.id }),
                        )
                      }
                    >
                      出席並扣點
                    </button>
                  )}
                </div>
              ))}
            </article>
          ))}
        </section>
      ) : !memberEnabled ? (
        <p role="status">工作存取已停用，請聯絡店家。</p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 font-semibold">我的點數與共卡</h2>
            {cards.map((c) => (
              <details
                key={c.id}
                className={`mb-2 rounded-lg border p-3 ${c.expired ? "bg-earth-50 text-earth-400" : "bg-white"}`}
              >
                <summary className="cursor-pointer">
                  {c.name}
                  {c.expired ? "（已到期）" : ""} · 可用 {c.available} 點／占用{" "}
                  {c.held} 點
                </summary>
                <div className="pt-3">
                  <CourseCardSummary card={c} />
                  <CourseCardEntries card={c} />
                </div>
              </details>
            ))}
            {!cards.length && <p>目前沒有可使用方案，請聯絡店家。</p>}
          </section>
          <section>
            <h2 className="mb-2 font-semibold">可預約課程</h2>
            <div className="divide-y rounded-lg border bg-white">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm">
                      {formatTWDateTime(new Date(s.startsAt))} · {s.room} ·{" "}
                      {s.cost} 點 · {s.occupied}／{s.capacity} 人
                    </p>
                  </div>
                  <button
                    className={button}
                    disabled={
                      pending ||
                      s.occupied >= s.capacity ||
                      !cards.some((c) => !c.expired)
                    }
                    onClick={() => {
                      setMessage("");
                      if (!cards.some((c) => c.id === cardId && !c.expired))
                        setCardId(cards.find((c) => !c.expired)?.id ?? "");
                      setRequestKey(crypto.randomUUID());
                      setSession(s);
                    }}
                  >
                    {s.occupied >= s.capacity ? "已滿班" : "預約／共卡代約"}
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">我的預約與共卡紀錄</h2>
            <ul className="divide-y rounded-lg border bg-white">
              {bookings.map((b) => (
                <li key={b.id} className="space-y-2 p-3 text-sm">
                  <p className="font-medium">
                    {b.name} · {formatTWDateTime(new Date(b.startsAt))}
                  </p>
                  <p>
                    上課人：{b.customerName} · 操作人：{b.operatorName} ·{" "}
                    {b.operatorCustomerId
                      ? b.operatorCustomerId === b.customerId
                        ? "自己上課"
                        : "共卡代約"
                      : "店長代約"}
                  </p>
                  <p>
                    {b.status === "ATTENDED"
                      ? "已出席，扣除"
                      : b.status === "CANCELLED"
                        ? "已取消，釋放"
                        : "已預約，占用"}{" "}
                    {b.cost} 點
                  </p>
                  {b.status === "RESERVED" && (
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          updateCourseBookingStatus({
                            bookingId: b.id,
                            status: "CANCELLED",
                            member: true,
                          }),
                        )
                      }
                    >
                      取消預約
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
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
                    customerId: data.get("learner"),
                    requestKey,
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
                    setRequestKey(crypto.randomUUID());
                  }}
                >
                  {cards.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.expired}>
                      {c.name}
                      {c.expired ? "（已到期）" : ""} · 可用 {c.available} 點
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                實際上課人
                <select
                  className={`${button} w-full`}
                  key={cardId}
                  name="learner"
                  required
                  defaultValue={customerId}
                >
                  {card?.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.id === customerId ? "（自己上課）" : "（共卡代約）"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm">
                操作人：{customerName}
                。只為選定的上課人保留一個名额；選擇其他共卡成員時，你自己不會被加入課程。
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
              disabled={pending}
            >
              確認預約
            </button>
          </footer>
        </RightSheet>
      )}
    </main>
  );
}
