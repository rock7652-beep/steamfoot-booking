"use client";
import { useState, useTransition, useEffect } from "react";
import { formatTWDateTime } from "@/lib/date-utils";
import { useRouter } from "next/navigation";
import {
  loadCourseSessionDetail,
  createCourseBooking,
  updateCourseBookingStatus,
  cancelCourseSession,
} from "@/server/actions/course-members";
import type { CourseCardView } from "./member-workspace";
import type { getCourseRoster } from "@/server/queries/course-members";
const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
export function CourseRoster({
  sessionId,
  capacity,
  canCreate,
  canEdit,
}: {
  sessionId: string;
  capacity: number;
  canCreate: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);
  const [roster, setRoster] = useState<
    Awaited<ReturnType<typeof getCourseRoster>>
  >([]);
  const [cards, setCards] = useState<CourseCardView[]>([]);
  const [session, setSession] = useState<{ startsAt: string; pointCost: number } | null>(null);
  const [cardId, setCardId] = useState("");
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  async function load() {
    const result = await loadCourseSessionDetail(sessionId);
    if (result.success) {
      setSession(result.data.session);
      setRoster(result.data.roster);
      setCards(result.data.cards);
      setLoaded(true);
    } else setMessage(result.error);
  }
  useEffect(() => {
    let active = true;
    loadCourseSessionDetail(sessionId).then((result) => {
      if (!active) return;
      if (result.success) {
        setSession(result.data.session);
        setRoster(result.data.roster);
        setCards(result.data.cards);
        setLoaded(true);
        setRequestKey(crypto.randomUUID());
      } else setMessage(result.error);
    }).catch(() => active && setMessage("讀取失敗，請重試"));
    return () => { active = false; };
  }, [sessionId]);
  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    start(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setMessage(result.error ?? "操作失敗");
          await load();
          router.refresh();
          return;
        }
        setMessage("已完成");
        setRequestKey(crypto.randomUUID());
        await load();
        router.refresh();
      } catch {
        setMessage("連線中斷，請重試");
      }
    });
  }
  const card = cards.find((c) => c.id === cardId);
  const count = roster.filter((b) => b.status !== "CANCELLED").length;
  if (!loaded)
    return (
      <div className="mt-2">
        <button
          className={button}
          disabled={pending}
          onClick={() => {
            setRequestKey(crypto.randomUUID());
            start(async () => {
              try {
                await load();
              } catch {
                setMessage("讀取失敗，請重試");
              }
            });
          }}
        >
          查看名單／預約／點名
        </button>
        {message && <p role="alert">{message}</p>}
      </div>
    );
  return (
    <section className="mt-3 space-y-3 border-t pt-3">
      <p className="font-medium">
        已預約 {count}／{capacity} · 未點名{" "}
        {roster.filter((b) => b.status === "RESERVED").length}
      </p>
      {message && <p role="status">{message}</p>}
      <ul className="divide-y">
        {roster.map((b) => (
          <li key={b.id} className="space-y-2 py-2 text-sm">
            <p>
              <strong>上課人：{b.customerName}</strong> ·{" "}
              {b.status === "ATTENDED"
                ? "已出席／已扣點"
                : b.status === "CANCELLED"
                  ? "已取消／已釋放"
                  : b.status === "NO_SHOW" ? "未到／已釋放占用" : b.checkedInAt ? "已報到／待完成，占用點數" : "未報到／占用點數"}{" "}
              {b.pointCost} 點
            </p>
            <p>
              預約操作人：{b.operatorName} ·{" "}
              {b.operatorCustomerId
                ? b.operatorCustomerId === b.customerId
                  ? "自己上課"
                  : "共卡代約"
                : "店長代約"}
            </p>
            <p className="text-primary-800">使用方案：{b.planName} · 可用 {b.available} 點 · 到期日 {formatTWDateTime(new Date(b.expiresAt)).slice(0, 10)}</p>
            <p className="text-earth-600">顧客服務備註：{b.serviceNote || "無"}</p>
            <p className="text-earth-600">本次預約備註：{b.notes || "無"}</p>
            {canEdit && b.status === "RESERVED" && (
              <div className="flex flex-wrap gap-2">
                {!b.checkedInAt && <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "CHECKED_IN" }))}>報到（不扣點）</button>}
                <button className={button} disabled={pending} onClick={() => run(() => updateCourseBookingStatus({ bookingId: b.id, status: "NO_SHOW" }))}>未到（釋放占用）</button>
                <button
                  className={button}
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      updateCourseBookingStatus({
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
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      updateCourseBookingStatus({
                        bookingId: b.id,
                        status: "CANCELLED",
                      }),
                    )
                  }
                >
                  取消預約
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canCreate && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() =>
              createCourseBooking({
                sessionId,
                cardId,
                customerId: data.get("customerId"),
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
              value={cardId}
              required
              onChange={(e) => {
                setCardId(e.target.value);
                setRequestKey(crypto.randomUUID());
              }}
            >
              <option value="">請選擇</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id} disabled={c.expired || c.available < (session?.pointCost ?? 1) || (!!session && c.expiresAt < session.startsAt)}>
                  {c.name} · {c.members.map((m) => m.name).join("、")} · 可用{" "}
                  {c.available} 點 · 到期 {formatTWDateTime(new Date(c.expiresAt)).slice(0, 10)}{c.expired ? "（已過期）" : c.available < (session?.pointCost ?? 1) ? "（點數不足）" : session && c.expiresAt < session.startsAt ? "（不涵蓋上課日期）" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            實際上課人
            <select
              className={`${button} w-full`}
              key={cardId}
              name="customerId"
              required
            >
              {card?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">本次預約備註<textarea className={`${button} w-full`} name="notes" maxLength={1000} /></label>
          {!cards.some((c) => !c.expired && c.available >= (session?.pointCost ?? 1) && (!session || c.expiresAt >= session.startsAt)) && <p className="text-sm text-earth-600">沒有可用方案：請確認共卡成員、可用點數及期限是否涵蓋上課日期。</p>}
          <button
            className={`${button} bg-primary-700 text-white`}
            disabled={pending || !card}
          >
            確認預約
          </button>
        </form>
      )}
      {canEdit && (
        <div>
          {!confirmCancel ? (
            <button
              className={button}
              disabled={pending}
              onClick={() => setConfirmCancel(true)}
            >
              取消整堂課
            </button>
          ) : (
            <div className="space-y-2">
              <p>
                將取消本堂課，影響 {count}{" "}
                位上課人；未完成預約將釋放點數占用，紀錄保留。
              </p>
              <button
                className={button}
                disabled={pending}
                onClick={() =>
                  run(() =>
                    cancelCourseSession({ sessionId, expectedBookings: count }),
                  )
                }
              >
                確認取消整堂課
              </button>
              <button
                className={button}
                onClick={() => setConfirmCancel(false)}
              >
                返回
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
