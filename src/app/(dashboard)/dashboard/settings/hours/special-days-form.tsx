"use client";

import { useState, useTransition } from "react";
import { addSpecialDay, removeSpecialDay } from "@/server/actions/business-hours";
import { toast } from "sonner";

interface SpecialDay {
  id: string;
  date: string;
  type: "closed" | "training" | "custom";
  reason: string | null;
  openTime: string | null;
  closeTime: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  closed: "公休",
  training: "進修",
  custom: "特殊時段",
};
const TYPE_COLOR: Record<string, string> = {
  closed: "bg-red-100 text-red-700",
  training: "bg-blue-100 text-blue-700",
  custom: "bg-amber-100 text-amber-700",
};

export function SpecialDaysForm({ specialDays }: { specialDays: SpecialDay[] }) {
  const [days, setDays] = useState(specialDays);
  const [pending, startTransition] = useTransition();

  // 新增表單
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<"closed" | "training" | "custom">("closed");
  const [newReason, setNewReason] = useState("");
  const [newOpenTime, setNewOpenTime] = useState("10:00");
  const [newCloseTime, setNewCloseTime] = useState("18:00");

  function handleAdd() {
    if (!newDate) {
      toast.error("請選擇日期");
      return;
    }
    startTransition(async () => {
      const result = await addSpecialDay({
        date: newDate,
        type: newType,
        reason: newReason || undefined,
        openTime: newType === "custom" ? newOpenTime : undefined,
        closeTime: newType === "custom" ? newCloseTime : undefined,
      });
      if (result.success) {
        toast.success("特殊日期已新增");
        // optimistic: add to local list
        setDays((prev) => [
          ...prev.filter((d) => d.date !== newDate),
          {
            id: `temp-${Date.now()}`,
            date: newDate,
            type: newType,
            reason: newReason || null,
            openTime: newType === "custom" ? newOpenTime : null,
            closeTime: newType === "custom" ? newCloseTime : null,
          },
        ].sort((a, b) => a.date.localeCompare(b.date)));
        setNewDate("");
        setNewReason("");
      } else {
        toast.error(result.error ?? "新增失敗");
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeSpecialDay(id);
      if (result.success) {
        toast.success("已移除特殊日期");
        setDays((prev) => prev.filter((d) => d.id !== id));
      } else {
        toast.error(result.error ?? "移除失敗");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* 新增區 */}
      <div className="rounded-lg border border-dashed border-earth-300 p-4">
        <h3 className="mb-3 text-sm font-medium text-earth-700">新增特殊日期</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-earth-500">日期</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-earth-500">類型</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "closed" | "training" | "custom")}
              className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
            >
              <option value="closed">公休</option>
              <option value="training">進修日</option>
              <option value="custom">特殊營業時段</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-earth-500">原因（選填）</label>
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="例：國定假日、團隊進修"
              className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
            />
          </div>
          {newType === "custom" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-earth-500">開始</label>
                <input
                  type="time"
                  value={newOpenTime}
                  onChange={(e) => setNewOpenTime(e.target.value)}
                  className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-earth-500">結束</label>
                <input
                  type="time"
                  value={newCloseTime}
                  onChange={(e) => setNewCloseTime(e.target.value)}
                  className="mt-1 w-full rounded border border-earth-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending}
          className="mt-3 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "新增中..." : "新增"}
        </button>
      </div>

      {/* 現有列表 */}
      {days.length === 0 ? (
        <p className="text-sm text-earth-400">目前無特殊日期設定</p>
      ) : (
        <div className="space-y-2">
          {days.map((day) => (
            <div
              key={day.id}
              className="flex items-center justify-between rounded-lg border border-earth-200 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-earth-700">{day.date}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[day.type] ?? ""}`}>
                  {TYPE_LABEL[day.type] ?? day.type}
                </span>
                {day.reason && (
                  <span className="text-xs text-earth-500">{day.reason}</span>
                )}
                {day.type === "custom" && day.openTime && day.closeTime && (
                  <span className="text-xs text-earth-500">
                    {day.openTime} - {day.closeTime}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(day.id)}
                disabled={pending}
                className="rounded p-1 text-earth-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
