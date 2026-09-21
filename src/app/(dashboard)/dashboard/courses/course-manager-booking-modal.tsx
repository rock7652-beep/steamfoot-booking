"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RightSheet } from "@/components/admin/right-sheet";
import { formatTWDateTime } from "@/lib/date-utils";
import {
  createCourseBooking,
  loadCourseSessionDetail,
} from "@/server/actions/course-members";
import type { CourseCardView } from "./member-workspace";

const button =
  "min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50";
const primary = `${button} bg-primary-700 text-white`;
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";

export function CourseManagerBookingModal({
  open,
  sessionId,
  sessionLabel,
  onClose,
}: {
  open: boolean;
  sessionId: string;
  sessionLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState<CourseCardView[]>([]);
  const [session, setSession] = useState<{
    startsAt: string;
    pointCost: number;
  } | null>(null);
  const [cardId, setCardId] = useState("");
  const [message, setMessage] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open || !sessionId) return;
    let active = true;
    loadCourseSessionDetail(sessionId)
      .then((result) => {
        if (!active) return;
        if (!result.success) {
          setMessage(result.error ?? "讀取可用方案失敗");
          return;
        }
        setCards(result.data.cards);
        setSession(result.data.session);
        setCardId("");
        setMessage("");
        setRequestKey(crypto.randomUUID());
      })
      .catch(() => active && setMessage("讀取失敗，請重試"));
    return () => {
      active = false;
    };
  }, [open, sessionId]);

  const card = cards.find((item) => item.id === cardId);
  const requiredAmount =
    card?.unit === "SESSION" ? 1 : (session?.pointCost ?? 1);
  const usableCards = cards.filter(
    (item) =>
      !item.expired &&
      !item.closed &&
      item.available >= (item.unit === "SESSION" ? 1 : session?.pointCost ?? 1) &&
      (!session || item.expiresAt >= session.startsAt),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card || pending) return;
    const data = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createCourseBooking({
          sessionId,
          cardId: card.id,
          customerId: data.get("customerId"),
          notes: data.get("notes"),
          requestKey,
        });
        if (!result.success) {
          setMessage(result.error ?? "預約失敗");
          setRequestKey(crypto.randomUUID());
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setMessage("連線失敗，請重試");
        setRequestKey(crypto.randomUUID());
      }
    });
  }

  return (
    <RightSheet
      compact
      open={open}
      onClose={onClose}
      variant="modal"
      width={520}
      labelledById="course-manager-booking-title"
    >
      <header className="flex items-center justify-between border-b border-earth-200 bg-primary-50/60 px-5 py-3">
        <div>
          <h2 id="course-manager-booking-title" className="font-semibold text-primary-900">
            ＋ 學員預約
          </h2>
          <p className="mt-1 text-sm text-earth-600">{sessionLabel}</p>
        </div>
        <button className={button} type="button" onClick={onClose} disabled={pending}>
          關閉
        </button>
      </header>

      <form
        id="course-manager-booking-form"
        onSubmit={submit}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"
      >
        {message && (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {message}
          </p>
        )}

        <label className="block text-sm font-medium text-earth-700">
          使用方案
          <select
            className={field}
            value={cardId}
            required
            onChange={(event) => {
              setCardId(event.target.value);
              setRequestKey(crypto.randomUUID());
            }}
          >
            <option value="">請選擇方案</option>
            {cards.map((item) => {
              const required = item.unit === "SESSION" ? 1 : session?.pointCost ?? 1;
              const disabled =
                item.expired ||
                item.closed ||
                item.available < required ||
                (!!session && item.expiresAt < session.startsAt);
              return (
                <option key={item.id} value={item.id} disabled={disabled}>
                  {item.name} · {item.members.map((member) => member.name).join("、")} · 可用{" "}
                  {item.available} {item.unit === "SESSION" ? "堂" : "點"}
                  {disabled ? "（目前不可用）" : ""}
                </option>
              );
            })}
          </select>
        </label>

        <label className="block text-sm font-medium text-earth-700">
          實際上課人
          <select
            className={field}
            key={cardId}
            name="customerId"
            required
            disabled={!card}
          >
            <option value="">請選擇學員</option>
            {card?.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>

        {card && (
          <p className="rounded-lg bg-earth-50 px-3 py-2 text-sm text-earth-600">
            本次預約會先保留 {requiredAmount} {card.unit === "SESSION" ? "堂" : "點"}，出席後才正式扣抵。
            {card.expiresAt
              ? ` 到期日 ${formatTWDateTime(new Date(card.expiresAt)).slice(0, 10)}。`
              : ""}
          </p>
        )}

        <label className="block text-sm font-medium text-earth-700">
          本次備註
          <textarea
            className={`${field} min-h-24`}
            name="notes"
            maxLength={1000}
            placeholder="選填"
          />
        </label>

        {!usableCards.length && (
          <p className="text-sm text-earth-500">
            目前沒有可用方案，請先確認方案額度、期限與適用課程。
          </p>
        )}
      </form>

      <footer className="border-t border-earth-200 bg-white p-4">
        <button
          form="course-manager-booking-form"
          type="submit"
          className={`${primary} w-full`}
          disabled={pending || !card}
        >
          {pending ? "預約中…" : "確認預約"}
        </button>
      </footer>
    </RightSheet>
  );
}
