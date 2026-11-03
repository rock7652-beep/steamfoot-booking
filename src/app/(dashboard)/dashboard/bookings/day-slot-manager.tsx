"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { toast } from "sonner";
import {
  applyDaySlotOverrides,
  getDaySlotDetails,
} from "@/server/actions/business-hours";

type Slot = {
  startTime: string;
  capacity: number;
  isEnabled: boolean;
  inRange: boolean;
  override: string | null;
};

type ChangeAction = "disable" | "enable" | "remove" | "capacity";

interface Props {
  date: string;
  hideCapacity?: boolean;
  expectedStoreId?: string;
  bookedPeopleBySlot: ReadonlyMap<string, number>;
  onSaved: () => Promise<void> | void;
}

/**
 * 預約管理的單日時段草稿。寫入沿用 settings 的 SlotOverride；不建立第二套
 * 時段資料，且只有按「儲存」才會影響顧客端可預約狀態。
 */
export function DaySlotManager({ date, hideCapacity=false, expectedStoreId, bookedPeopleBySlot, onSaved }: Props) {
  const generation=useRef(0);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [writeRestriction, setWriteRestriction] = useState<string | null>(null);
  const [hoursRevision, setHoursRevision] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [dayClosed, setDayClosed] = useState(true);
  const [closedDayException, setClosedDayException] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [changes, setChanges] = useState<Map<string, ChangeAction>>(new Map());
  const [capacityChanges, setCapacityChanges] = useState<Map<string, number>>(new Map());
  const [defaultCapacity, setDefaultCapacity] = useState(6);
  const [newTime, setNewTime] = useState("19:30");
  const [pending, startTransition] = useTransition();

  async function openManager() {
    const attempt=++generation.current;
    setOpen(true);
    setLoading(true);
    setLoadError("");
    setWriteRestriction(null);
    setHoursRevision(undefined);
    setDayClosed(true);
    setClosedDayException(false);
    setSlots([]);
    setChanges(new Map());
    setCapacityChanges(new Map());
    try {
      const detail = await getDaySlotDetails(date, expectedStoreId);
      if(attempt!==generation.current)return;
      setSlots(detail.slots);
      setWriteRestriction(detail.writeRestriction ?? null);
      setHoursRevision(detail.hoursRevision);
      setDefaultCapacity(Math.max(1, detail.defaultCapacity || 6));
      setDayClosed(detail.status === "training" || (detail.status === "closed" && !detail.canAddSlotsOnClosedDay));
      setClosedDayException(detail.canAddSlotsOnClosedDay);
      setChanges(new Map());
      setCapacityChanges(new Map());
    } catch {
      if(attempt===generation.current)setLoadError("載入時段失敗，請重試");
    } finally {
      if(attempt===generation.current)setLoading(false);
    }
  }

  const previewSlots = useMemo(() => slots.map((slot) => ({
    ...slot,
    capacity: capacityChanges.get(slot.startTime) ?? slot.capacity,
    isOpen: changes.get(slot.startTime) === "disable"
      ? false
      : changes.get(slot.startTime) === "enable"
        ? true
        : changes.get(slot.startTime) === "remove"
          ? slot.inRange
          : slot.isEnabled,
  })), [capacityChanges, changes, slots]);

  const changedCount = new Set([...changes.keys(), ...capacityChanges.keys()]).size;
  const bookedPeopleKept = previewSlots
    .filter((slot) => !slot.isOpen && bookedPeopleBySlot.has(slot.startTime))
    .reduce((total, slot) => total + (bookedPeopleBySlot.get(slot.startTime) ?? 0), 0);

  function setChange(startTime: string, action: ChangeAction) {
    setChanges((previous) => {
      const next = new Map(previous);
      next.set(startTime, action);
      return next;
    });
  }

  function setCapacity(startTime: string, capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 99) return;
    const booked = bookedPeopleBySlot.get(startTime) ?? 0;
    if (capacity < booked) {
      toast.error(`此時段已預約 ${booked} 人，名額不可低於此數`);
      return;
    }
    const original = slots.find((slot) => slot.startTime === startTime)?.capacity;
    setCapacityChanges((previous) => {
      const next = new Map(previous);
      if (original === capacity) next.delete(startTime);
      else next.set(startTime, capacity);
      return next;
    });
  }

  function toggle(slot: Slot) {
    const isOpen = previewSlots.find((item) => item.startTime === slot.startTime)?.isOpen ?? false;
    if (isOpen) {
      setChange(slot.startTime, "disable");
      return;
    }
    // 原本規則內的時段移除 disabled 覆寫；規則外的臨時時段則寫 enabled。
    setChange(slot.startTime, slot.inRange ? "remove" : "enable");
  }

  function addSlot() {
    if (dayClosed || pending || !/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) return;
    if(hideCapacity&&!/:(00|30)$/.test(newTime)){toast.error("請選擇整點或半點時段");return;}
    const existing = slots.find((slot) => slot.startTime === newTime);
    if (!existing) {
      setSlots((previous) => [...previous, {
        startTime: newTime,
        capacity: defaultCapacity,
        isEnabled: false,
        inRange: false,
        override: null,
      }].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      if (!hideCapacity) setCapacityChanges((previous) => new Map(previous).set(newTime, defaultCapacity));
    }
    setChange(newTime, "enable");
  }

  function requestClose() {
    if (pending) return;
    if (!changedCount) {
      ++generation.current;setOpen(false);
      return;
    }
    if (window.confirm("尚有未儲存的時段調整，要捨棄嗎？")) {++generation.current;setOpen(false);}
  }

  function save() {
    if (!changedCount || loading || loadError || writeRestriction || pending) return;
    startTransition(async () => {
      const changedTimes = new Set([...changes.keys(), ...capacityChanges.keys()]);
      let result;
      try { result = await applyDaySlotOverrides({
        date, expectedStoreId, expectedHoursRevision: hoursRevision,
        changes: [...changedTimes].map((startTime) => ({
          startTime,
          action: changes.get(startTime) ?? "capacity",
          capacity: capacityChanges.get(startTime),
        })),
      }); } catch { toast.error("儲存結果未確認，請重新讀取核對；草稿已保留"); return; }
      if (!result.success) {
        toast.error(result.error ?? "儲存時段失敗，草稿已保留");
        return;
      }
      let refreshed = true;
      try { await onSaved(); } catch { refreshed = false; }
      setChanges(new Map());
      setCapacityChanges(new Map());
      setOpen(false);
      if (!refreshed) {
        toast.warning("時段已儲存，畫面更新失敗，請按「更新」重新確認");
        return;
      }
      toast.success(
        result.data.bookedPeopleKept > 0
          ? `已儲存 ${result.data.changed} 個時段；既有 ${result.data.bookedPeopleKept} 人預約已保留`
          : `已儲存 ${result.data.changed} 個時段調整`,
      );
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openManager()}
        className="inline-flex min-h-11 min-w-32 items-center justify-center rounded-lg border border-earth-200 bg-white px-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
      >
        管理時段
      </button>
      {open && (
        <RightSheet open presentation="centered" fitContent width={600} closeOnEscape={!pending} onClose={requestClose} labelledById="day-slot-title">
          <section className="w-full min-w-0 bg-white p-4">
            <header className="flex items-start justify-between gap-3 border-b border-earth-100 pb-3">
              <div>
                <h3 id="day-slot-title" className="text-base font-bold text-earth-900">管理時段</h3>
                <p className="mt-0.5 text-xs text-earth-500">只影響 {date}；不會修改每週固定服務時間。</p>
              </div>
              <button type="button" onClick={requestClose} className="rounded p-1 text-earth-500 hover:bg-earth-100" aria-label="關閉">✕</button>
            </header>

            {loadError ? <div role="alert" className="py-4 text-sm text-red-700">{loadError}<button type="button" className="ml-3 min-h-11 underline" onClick={()=>void openManager()}>重試</button></div> : loading ? <p className="py-8 text-center text-sm text-earth-400">載入時段中…</p> : (
              <>
                {writeRestriction && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{writeRestriction}</p>}
                {closedDayException && <p className="mt-3 text-sm text-amber-800">此日原為公休，可直接加開當日時段；只開放你新增的時間，其餘仍維持公休。</p>}
                {dayClosed && <p className="mt-3 text-sm text-amber-800">此日為全天休息，請先在服務時間設定開放當日，再新增或重新開放時段。</p>}
                <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-primary-50 p-3">
                  <label className="text-xs font-medium text-earth-700">新增當日時段
                    <input aria-label="新增時段時間" type="time" step={hideCapacity?1800:60} value={newTime} onChange={(event) => setNewTime(event.target.value)} className="ml-2 rounded border border-earth-300 bg-white px-2 py-1 text-sm" />
                  </label>
                  <button type="button" onClick={addSlot} disabled={dayClosed || !!writeRestriction || pending} className="rounded border border-primary-300 bg-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">加入草稿</button>
                </div>

                <p className="mt-3 text-xs text-earth-500">{hideCapacity?"點選時段切換開放／關閉；臨時加開每格 30 分鐘，服務需能完整安排於連續開放時間內。既有預約保留。":"可直接調整當日時段與名額；名額 0 會保留時段並在顧客端顯示已額滿。關閉時段才會停止顯示可預約狀態；已有預約會保留。"}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {previewSlots.map((slot) => {
                    const people = bookedPeopleBySlot.get(slot.startTime) ?? 0;
                    const isChanged = changes.has(slot.startTime) || capacityChanges.has(slot.startTime);
                    const isFull = !hideCapacity && slot.isOpen && people >= slot.capacity;
                    return (
                      <div
                        key={slot.startTime}
                        className={`rounded-lg border px-2.5 py-2 text-xs ${
                          !slot.isOpen
                            ? "border-earth-300 bg-earth-50 text-earth-600"
                            : isFull
                              ? "border-amber-200 bg-amber-50/70 text-earth-800"
                              : "border-earth-200 bg-white text-earth-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggle(slot)}
                            disabled={dayClosed || !!writeRestriction || pending}
                            className="min-h-11 min-w-0 flex-1 text-left text-sm disabled:opacity-50"
                          >
                            <span className="flex items-center gap-1.5 font-semibold">
                              <span>{slot.startTime}</span>
                              <span className={slot.isOpen ? "text-emerald-700" : "text-earth-500"}>
                                {slot.isOpen ? "開放" : "關閉"}
                              </span>
                              {isChanged && (
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                  已調整
                                </span>
                              )}
                              {isFull && (
                                <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                                  滿額
                                </span>
                              )}
                            </span>
                          </button>
                          {!hideCapacity&&<span className="shrink-0 text-[11px] text-earth-500">
                            已約 {people} / 名額 {slot.capacity}
                          </span>}
                        </div>

                        {!hideCapacity&&<div className="mt-1.5 flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`${slot.startTime} 名額減少`}
                            disabled={dayClosed || pending || !slot.isOpen || slot.capacity <= Math.max(0, people)}
                            onClick={() => setCapacity(slot.startTime, slot.capacity - 1)}
                            className="h-7 w-7 rounded border border-earth-300 bg-white text-sm disabled:opacity-35"
                          >
                            −
                          </button>
                          <input
                            aria-label={`${slot.startTime} 名額`}
                            type="number"
                            min={Math.max(0, people)}
                            max={99}
                            value={slot.capacity}
                            disabled={dayClosed || pending || !slot.isOpen}
                            onChange={(event) => setCapacity(slot.startTime, Number(event.target.value))}
                            className="h-7 w-12 rounded border border-earth-300 bg-white px-1 text-center text-xs font-medium tabular-nums disabled:opacity-35"
                          />
                          <button
                            type="button"
                            aria-label={`${slot.startTime} 名額增加`}
                            disabled={dayClosed || pending || !slot.isOpen || slot.capacity >= 99}
                            onClick={() => setCapacity(slot.startTime, slot.capacity + 1)}
                            className="h-7 w-7 rounded border border-earth-300 bg-white text-sm disabled:opacity-35"
                          >
                            ＋
                          </button>
                        </div>}
                      </div>
                    );
                  })}
                </div>
                {bookedPeopleKept > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">此次關閉的時段仍有 {bookedPeopleKept} 人預約；儲存後會保留，不會取消或異動帳務。</p>}
                {changedCount > 0 && <p className="mt-3 text-xs font-medium text-amber-700">尚未儲存：{changedCount} 個時段調整</p>}
              </>
            )}

            <footer className="mt-4 flex gap-2 border-t border-earth-100 pt-3">
              <button type="button" onClick={requestClose} className="flex-1 rounded-lg border border-earth-300 py-2 text-sm text-earth-700 hover:bg-earth-50">取消</button>
              <button type="button" disabled={!changedCount || pending || loading || !!writeRestriction} onClick={save} className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{pending ? "儲存中…" : "確認並儲存"}</button>
            </footer>
          </section>
        </RightSheet>
      )}
    </>
  );
}