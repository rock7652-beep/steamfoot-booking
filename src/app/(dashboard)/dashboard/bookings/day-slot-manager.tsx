"use client";

import { useMemo, useState, useTransition } from "react";
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
  bookedPeopleBySlot: ReadonlyMap<string, number>;
  onSaved: () => Promise<void> | void;
}

/**
 * 預約管理的單日時段草稿。寫入沿用 settings 的 SlotOverride；不建立第二套
 * 時段資料，且只有按「儲存」才會影響顧客端可預約狀態。
 */
export function DaySlotManager({ date, bookedPeopleBySlot, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dayClosed, setDayClosed] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [changes, setChanges] = useState<Map<string, ChangeAction>>(new Map());
  const [capacityChanges, setCapacityChanges] = useState<Map<string, number>>(new Map());
  const [defaultCapacity, setDefaultCapacity] = useState(6);
  const [newTime, setNewTime] = useState("19:30");
  const [pending, startTransition] = useTransition();

  async function openManager() {
    setOpen(true);
    setLoading(true);
    setDayClosed(true);
    setSlots([]);
    setChanges(new Map());
    setCapacityChanges(new Map());
    try {
      const detail = await getDaySlotDetails(date);
      setSlots(detail.slots);
      setDefaultCapacity(Math.max(1, detail.defaultCapacity || 6));
      setDayClosed(detail.status === "closed" || detail.status === "training");
      setChanges(new Map());
      setCapacityChanges(new Map());
    } catch {
      toast.error("載入時段失敗");
    } finally {
      setLoading(false);
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
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 99) return;
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
    if (dayClosed || pending || !/^\d{2}:\d{2}$/.test(newTime)) return;
    const existing = slots.find((slot) => slot.startTime === newTime);
    if (!existing) {
      setSlots((previous) => [...previous, {
        startTime: newTime,
        capacity: defaultCapacity,
        isEnabled: false,
        inRange: false,
        override: null,
      }].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setCapacityChanges((previous) => new Map(previous).set(newTime, defaultCapacity));
    }
    setChange(newTime, "enable");
  }

  function requestClose() {
    if (pending) return;
    if (!changedCount) {
      setOpen(false);
      return;
    }
    if (window.confirm("尚有未儲存的時段調整，要捨棄嗎？")) setOpen(false);
  }

  function save() {
    if (!changedCount) return;
    startTransition(async () => {
      const changedTimes = new Set([...changes.keys(), ...capacityChanges.keys()]);
      const result = await applyDaySlotOverrides({
        date,
        changes: [...changedTimes].map((startTime) => ({
          startTime,
          action: changes.get(startTime) ?? "capacity",
          capacity: capacityChanges.get(startTime),
        })),
      });
      if (!result.success) {
        toast.error(result.error ?? "儲存時段失敗，草稿已保留");
        return;
      }
      await onSaved();
      setChanges(new Map());
      setCapacityChanges(new Map());
      setOpen(false);
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
        className="rounded border border-primary-300 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
      >
        管理時段
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="管理當日時段">
          <section className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-xl sm:rounded-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-earth-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-earth-900">管理時段</h3>
                <p className="mt-0.5 text-xs text-earth-500">只影響 {date}；不會修改每週固定服務時間。</p>
              </div>
              <button type="button" onClick={requestClose} className="rounded p-1 text-earth-500 hover:bg-earth-100" aria-label="關閉">✕</button>
            </header>

            {loading ? <p className="py-8 text-center text-sm text-earth-400">載入時段中…</p> : (
              <>
                {dayClosed && <p className="mt-3 text-sm text-amber-800">此日為全天休息，請先在服務時間設定開放當日，再新增或重新開放時段。</p>}
                <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-primary-50 p-3">
                  <label className="text-xs font-medium text-earth-700">新增當日時段
                    <input aria-label="新增時段時間" type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} className="ml-2 rounded border border-earth-300 bg-white px-2 py-1 text-sm" />
                  </label>
                  <button type="button" onClick={addSlot} disabled={dayClosed || pending} className="rounded border border-primary-300 bg-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">加入草稿</button>
                </div>

                <p className="mt-3 text-xs text-earth-500">可直接調整當日時段與名額；只影響這一天，不會修改每週固定設定。關閉只停止新預約，已有預約會保留。</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {previewSlots.map((slot) => {
                    const people = bookedPeopleBySlot.get(slot.startTime) ?? 0;
                    return (
                      <div key={slot.startTime} className={`rounded-lg border p-2 text-xs ${slot.isOpen ? "border-green-200 bg-green-50 text-green-800" : "border-earth-200 bg-earth-50 text-earth-500"}`}>
                        <button type="button" onClick={() => toggle(slot)} disabled={dayClosed || pending} className="w-full text-left disabled:opacity-50">
                          <span className="block font-semibold">{slot.startTime} · {slot.isOpen ? "開放" : "關閉"}</span>
                          <span className="mt-0.5 block text-[11px]">{people > 0 ? `已預約 ${people} 人` : "目前無預約"}</span>
                        </button>
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/5 pt-2">
                          <span className="text-[11px] font-medium">本時段名額</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`${slot.startTime} 名額減少`}
                              disabled={dayClosed || pending || !slot.isOpen || slot.capacity <= Math.max(1, people)}
                              onClick={() => setCapacity(slot.startTime, slot.capacity - 1)}
                              className="h-8 w-8 rounded border border-earth-300 bg-white text-base disabled:opacity-40"
                            >
                              −
                            </button>
                            <input
                              aria-label={`${slot.startTime} 名額`}
                              type="number"
                              min={Math.max(1, people)}
                              max={99}
                              value={slot.capacity}
                              disabled={dayClosed || pending || !slot.isOpen}
                              onChange={(event) => setCapacity(slot.startTime, Number(event.target.value))}
                              className="h-8 w-14 rounded border border-earth-300 bg-white px-1 text-center text-sm tabular-nums disabled:opacity-40"
                            />
                            <button
                              type="button"
                              aria-label={`${slot.startTime} 名額增加`}
                              disabled={dayClosed || pending || !slot.isOpen || slot.capacity >= 99}
                              onClick={() => setCapacity(slot.startTime, slot.capacity + 1)}
                              className="h-8 w-8 rounded border border-earth-300 bg-white text-base disabled:opacity-40"
                            >
                              ＋
                            </button>
                          </div>
                        </div>
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
              <button type="button" disabled={!changedCount || pending || loading} onClick={save} className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">{pending ? "儲存中…" : "確認並儲存"}</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}