"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchDaySlots } from "@/server/actions/slots";
import type { SlotAvailability } from "@/types";

interface RescheduleModalProps {
  open: boolean;
  onClose: () => void;
  /** 現有預約的日期 YYYY-MM-DD */
  currentDate: string;
  /** 現有預約的時段 HH:mm */
  currentSlotTime: string;
  /** 預約所需人數（用來判斷 available >= people） */
  people: number;
  onConfirm: (newDate: string, newSlotTime: string) => void;
  loading?: boolean;
}

export function RescheduleModal({
  open,
  onClose,
  currentDate,
  currentSlotTime,
  people,
  onConfirm,
  loading = false,
}: RescheduleModalProps) {
  const [date, setDate] = useState(currentDate);
  const [slotTime, setSlotTime] = useState(currentSlotTime);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [slotsLoading, startSlotsLoad] = useTransition();
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // 重置本地狀態當開啟
  useEffect(() => {
    if (!open) return;
    setDate(currentDate);
    setSlotTime(currentSlotTime);
    setSlotsError(null);
  }, [open, currentDate, currentSlotTime]);

  // ESC 關閉
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, loading]);

  // 改日期 → 重抓該日 slots
  useEffect(() => {
    if (!open || !date) return;
    setSlotsError(null);
    startSlotsLoad(async () => {
      try {
        const result = await fetchDaySlots(date);
        setSlots(result.slots);
      } catch (e) {
        setSlotsError(e instanceof Error ? e.message : "讀取時段失敗");
        setSlots([]);
      }
    });
  }, [open, date]);

  if (!open) return null;

  const sameDateAsCurrent = date === currentDate;
  const canSubmit =
    !!date &&
    !!slotTime &&
    !loading &&
    (!sameDateAsCurrent || slotTime !== currentSlotTime);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        onClick={loading ? undefined : onClose}
        className="absolute inset-0 bg-earth-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-[440px] max-w-[92vw] rounded-lg bg-white shadow-[0_8px_32px_rgba(20,24,31,0.18)]"
      >
        <div className="border-b border-earth-200 px-5 py-3">
          <h3 className="text-base font-semibold text-earth-900">改期預約</h3>
          <p className="mt-0.5 text-xs text-earth-500">
            選擇新的日期與時段；舊時段容量會釋放
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-earth-600">
              日期
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
              className="h-9 w-full rounded-md border border-earth-300 bg-white px-3 text-sm text-earth-800 focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-earth-600">
                時段
              </label>
              {slotsLoading && (
                <span className="text-[11px] text-earth-400">載入中…</span>
              )}
            </div>
            {slotsError ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {slotsError}
              </p>
            ) : slots.length === 0 && !slotsLoading ? (
              <p className="rounded-md bg-earth-50 px-3 py-2 text-sm text-earth-500">
                該日無可用時段（可能不營業）
              </p>
            ) : (
              <SlotPicker
                slots={slots}
                value={slotTime}
                people={people}
                currentSlotTime={sameDateAsCurrent ? currentSlotTime : null}
                onChange={setSlotTime}
                disabled={loading}
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-earth-200 bg-earth-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="inline-flex h-8 items-center rounded-md border border-earth-300 bg-white px-3 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(date, slotTime)}
            disabled={!canSubmit}
            className="inline-flex h-8 items-center rounded-md bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotPicker({
  slots,
  value,
  people,
  currentSlotTime,
  onChange,
  disabled,
}: {
  slots: SlotAvailability[];
  value: string;
  people: number;
  currentSlotTime: string | null;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid max-h-[240px] grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
      {slots.map((s) => {
        const isCurrent = s.startTime === currentSlotTime;
        const freeForThis = s.available + (isCurrent ? people : 0);
        const hasRoom = freeForThis >= people;
        const usable = s.isEnabled && !s.isPast && hasRoom;
        const selected = value === s.startTime;
        return (
          <button
            key={s.startTime}
            type="button"
            onClick={() => onChange(s.startTime)}
            disabled={disabled || !usable}
            className={`h-9 rounded-md border text-xs font-semibold transition-colors tabular-nums ${
              selected
                ? "border-primary-600 bg-primary-600 text-white"
                : usable
                  ? "border-earth-300 bg-white text-earth-700 hover:border-primary-400 hover:bg-primary-50"
                  : "cursor-not-allowed border-earth-200 bg-earth-50 text-earth-300"
            }`}
            title={
              !s.isEnabled
                ? "時段已關閉"
                : s.isPast
                  ? "已過時段"
                  : !hasRoom
                    ? `剩 ${freeForThis} / 需 ${people} 人`
                    : `剩 ${freeForThis} 人`
            }
          >
            {s.startTime}
          </button>
        );
      })}
    </div>
  );
}
