"use client";
import { useState, useRef, useTransition } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import {
  readBeautyMoveSlots,
  moveBeautyAppointment,
} from "@/server/actions/beauty";
import { toLocalDateStr } from "@/lib/date-utils";
const field =
  "min-h-11 w-full rounded-lg border border-earth-200 px-3 py-2 text-base disabled:opacity-50";
export function BeautyReschedulePanel({
  mode,
  item,
  onClose,
  onSaved,
}: {
  mode: "member" | "work";
  item: {
    id: string;
    revision: number;
    serviceName: string;
    personName: string;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(toLocalDateStr),
    [time, setTime] = useState(""),
    [slots, setSlots] = useState<string[]>([]),
    [error, setError] = useState(""),
    [pending, start] = useTransition();
  const request = useRef(crypto.randomUUID()),
    version = useRef(0);
  return (
    <RightSheet
      open
      presentation="centered"
      width={600}
      onClose={() => !pending && onClose()}
      closeOnEscape={!pending}
      labelledById="beauty-reschedule-title"
    >
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              const r = await moveBeautyAppointment(mode, {
                id: item.id,
                revision: item.revision,
                date,
                time,
                requestKey: request.current,
                reason: "前台改期",
              });
              if (r.success) onSaved();
              else setError(r.error);
            } catch {
              setError("連線失敗，請保留資料重試");
            }
          });
        }}
      >
        <h2 id="beauty-reschedule-title">
          改期｜{item.personName}・{item.serviceName}
        </h2>
        <fieldset className="space-y-3" disabled={pending}>
          <label>
            日期
            <input
              className={field}
              required
              type="date"
              min={toLocalDateStr()}
              value={date}
              onChange={(e) => {
                version.current++;
                setDate(e.target.value);
                setTime("");
                setSlots([]);
                request.current = crypto.randomUUID();
              }}
            />
          </label>
          <button
            className={field}
            type="button"
            onClick={() => {
              const current = ++version.current;
              start(async () => {
                try {
                  const r = await readBeautyMoveSlots(mode, {
                    id: item.id,
                    date,
                  });
                  if (current !== version.current) return;
                  if (r.success) {
                    setSlots(r.data.slots);
                    setError(
                      r.data.slots.length
                        ? ""
                        : "當日沒有符合原服務與性別偏好的時間",
                    );
                  } else setError(r.error);
                } catch {
                  setError("讀取失敗，請重試");
                }
              });
            }}
          >
            查詢可用時間
          </button>
          {!!slots.length && (
            <label>
              開始時間
              <select
                required
                className={field}
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  request.current = crypto.randomUUID();
                }}
              >
                <option value="">請選擇</option>
                {slots.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          <p>保留原服務、性別偏好與扣次規則，最後確認時再次檢查可用資源。</p>
          <button
            className={field + " bg-primary-700 text-white"}
            disabled={!time}
          >
            {pending ? "處理中…" : "確認改期"}
          </button>
          <button className={field} type="button" onClick={onClose}>
            取消
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </form>
    </RightSheet>
  );
}
