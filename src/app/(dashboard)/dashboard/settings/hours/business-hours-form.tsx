"use client";

import { useState, useTransition } from "react";
import { updateBusinessHours } from "@/server/actions/business-hours";
import { toast } from "sonner";

interface DayHours {
  dayOfWeek: number;
  dayName: string;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export function BusinessHoursForm({ hours }: { hours: DayHours[] }) {
  const [data, setData] = useState(hours);
  const [pending, startTransition] = useTransition();
  const [savingDay, setSavingDay] = useState<number | null>(null);

  function handleToggle(dayOfWeek: number, isOpen: boolean) {
    setData((prev) =>
      prev.map((d) =>
        d.dayOfWeek === dayOfWeek
          ? { ...d, isOpen, openTime: isOpen ? (d.openTime ?? "10:00") : null, closeTime: isOpen ? (d.closeTime ?? "22:00") : null }
          : d
      )
    );
  }

  function handleTime(dayOfWeek: number, field: "openTime" | "closeTime", value: string) {
    setData((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d))
    );
  }

  function handleSave(day: DayHours) {
    setSavingDay(day.dayOfWeek);
    startTransition(async () => {
      const result = await updateBusinessHours(day.dayOfWeek, {
        isOpen: day.isOpen,
        openTime: day.openTime,
        closeTime: day.closeTime,
      });
      setSavingDay(null);
      if (result.success) {
        toast.success(`${day.dayName}營業時間已更新`);
      } else {
        toast.error(result.error ?? "更新失敗");
      }
    });
  }

  return (
    <div className="space-y-2">
      {data.map((day) => (
        <div
          key={day.dayOfWeek}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
            day.isOpen ? "border-earth-200 bg-white" : "border-earth-100 bg-earth-50"
          }`}
        >
          {/* 星期 */}
          <span className="w-10 text-sm font-medium text-earth-700">{day.dayName}</span>

          {/* 開關 */}
          <button
            type="button"
            onClick={() => handleToggle(day.dayOfWeek, !day.isOpen)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              day.isOpen ? "bg-green-500" : "bg-earth-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                day.isOpen ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>

          {day.isOpen ? (
            <>
              <input
                type="time"
                value={day.openTime ?? "10:00"}
                onChange={(e) => handleTime(day.dayOfWeek, "openTime", e.target.value)}
                className="rounded border border-earth-300 px-2 py-1 text-sm"
              />
              <span className="text-earth-400">-</span>
              <input
                type="time"
                value={day.closeTime ?? "22:00"}
                onChange={(e) => handleTime(day.dayOfWeek, "closeTime", e.target.value)}
                className="rounded border border-earth-300 px-2 py-1 text-sm"
              />
            </>
          ) : (
            <span className="text-sm text-earth-400">公休</span>
          )}

          <button
            type="button"
            onClick={() => handleSave(day)}
            disabled={pending && savingDay === day.dayOfWeek}
            className="ml-auto rounded-lg bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-200 disabled:opacity-60"
          >
            {pending && savingDay === day.dayOfWeek ? "儲存中..." : "儲存"}
          </button>
        </div>
      ))}
    </div>
  );
}
