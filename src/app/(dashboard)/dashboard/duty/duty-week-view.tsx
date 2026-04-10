"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import Link from "next/link";
import { PARTICIPATION_TYPE_SHORT } from "@/lib/duty-constants";
import type { ParticipationType } from "@prisma/client";
import type { DutyWeekItem } from "@/server/queries/duty";

type Assignment = DutyWeekItem;

interface BusinessHourInfo {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number;
  defaultCapacity: number;
}

interface SpecialDayInfo {
  date: string;
  type: string;
  reason: string | null;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number | null;
  defaultCapacity: number | null;
}

interface Props {
  weekStart: string;
  assignments: Assignment[];
  businessHours: BusinessHourInfo[];
  specialDays: SpecialDayInfo[];
  canManage: boolean;
}

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

/** 產生某天的所有營業時段 */
function getSlotsForDay(
  dateStr: string,
  businessHours: BusinessHourInfo[],
  specialDays: SpecialDayInfo[]
): string[] | "closed" {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay();

  const special = specialDays.find((s) => s.date === dateStr);
  const bh = businessHours.find((b) => b.dayOfWeek === dow);

  if (special && (special.type === "closed" || special.type === "training")) {
    return "closed";
  }
  if (!special && bh && !bh.isOpen) {
    return "closed";
  }

  const openTime = special?.type === "custom" ? special.openTime : (bh?.openTime ?? null);
  const closeTime = special?.type === "custom" ? special.closeTime : (bh?.closeTime ?? null);
  const interval = (special?.type === "custom" ? special.slotInterval : null) ?? bh?.slotInterval ?? 60;

  if (!openTime || !closeTime) return "closed";

  const slots: string[] = [];
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  let cursor = oh * 60 + om;
  const end = ch * 60 + cm;

  while (cursor < end) {
    const h = Math.floor(cursor / 60);
    const m = cursor % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    cursor += interval;
  }

  return slots;
}

export function DutyWeekView({ weekStart, assignments, businessHours, specialDays, canManage }: Props) {
  const router = useRouter();
  const [navStart, setNavStart] = useState<number | null>(null);

  const navigateWeek = useCallback((week: string) => {
    setNavStart(performance.now());
    router.push(`/dashboard/duty?week=${week}`);
  }, [router]);

  // 週一到週日的日期
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // 取每天的時段 — 使用 Set 做 O(1) 查詢
  const daySlotsMap = new Map<string, Set<string> | "closed">();
  const allSlots = new Set<string>();
  for (const date of weekDates) {
    const slots = getSlotsForDay(date, businessHours, specialDays);
    if (slots === "closed") {
      daySlotsMap.set(date, "closed");
    } else {
      const slotSet = new Set(slots);
      daySlotsMap.set(date, slotSet);
      for (const s of slots) allSlots.add(s);
    }
  }
  const sortedSlots = Array.from(allSlots).sort();

  // 按 date|slotTime 分組 assignments — O(n) 建表，O(1) 查詢
  const assignmentMap = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = `${a.date}|${a.slotTime}`;
    if (!assignmentMap.has(key)) assignmentMap.set(key, []);
    assignmentMap.get(key)!.push(a);
  }

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);
  const weekEndStr = addDays(weekStart, 6);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-earth-900">值班安排</h1>
      </div>

      {/* 週切換器 */}
      <div className="mb-4 flex items-center justify-center gap-3">
        <button
          onClick={() => navigateWeek(prevWeek)}
          className="rounded-lg px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-100"
        >
          &lt; 上一週
        </button>
        <span className="text-sm font-medium text-earth-800">
          {formatDateShort(weekStart)} ~ {formatDateShort(weekEndStr)}
        </span>
        <button
          onClick={() => navigateWeek(nextWeek)}
          className="rounded-lg px-3 py-1.5 text-sm text-earth-600 hover:bg-earth-100"
        >
          下一週 &gt;
        </button>
      </div>

      {/* 週表格 */}
      <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-earth-200 bg-earth-50">
              <th className="w-16 border-r border-earth-200 px-2 py-2.5 text-left text-xs font-medium text-earth-500">
                時段
              </th>
              {weekDates.map((date, i) => {
                const daySlots = daySlotsMap.get(date);
                const isClosed = daySlots === "closed";
                return (
                  <th
                    key={date}
                    className={`border-r border-earth-200 px-2 py-2.5 text-center text-xs font-medium last:border-r-0 ${
                      isClosed ? "text-earth-400" : "text-earth-700"
                    }`}
                  >
                    <div>週{DAY_LABELS[i]}</div>
                    <div className="text-[10px]">{formatDateShort(date)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedSlots.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-earth-400">
                  本週沒有營業時段
                </td>
              </tr>
            ) : (
              sortedSlots.map((slot) => (
                <tr key={slot} className="border-b border-earth-100 last:border-b-0">
                  <td className="border-r border-earth-200 px-2 py-2 text-xs font-medium text-earth-500">
                    {slot}
                  </td>
                  {weekDates.map((date) => {
                    const daySlots = daySlotsMap.get(date);
                    if (daySlots === "closed") {
                      return (
                        <td
                          key={date}
                          className="border-r border-earth-200 bg-earth-50 px-1 py-1.5 text-center text-[10px] text-earth-400 last:border-r-0"
                        >
                          公休
                        </td>
                      );
                    }
                    if (!daySlots || !daySlots.has(slot)) {
                      return (
                        <td
                          key={date}
                          className="border-r border-earth-200 bg-earth-50/50 px-1 py-1.5 text-center text-[10px] text-earth-300 last:border-r-0"
                        >
                          —
                        </td>
                      );
                    }

                    const cellAssignments = assignmentMap.get(`${date}|${slot}`) ?? [];

                    return (
                      <td
                        key={date}
                        className={`border-r border-earth-200 px-1 py-1 last:border-r-0 ${
                          canManage ? "cursor-pointer hover:bg-primary-50" : ""
                        }`}
                        onClick={canManage ? () => router.push(`/dashboard/duty/${date}`) : undefined}
                      >
                        {cellAssignments.length === 0 ? (
                          <div className="text-center text-[10px] text-earth-300">—</div>
                        ) : (
                          <div className="space-y-0.5">
                            {cellAssignments.map((a) => (
                              <div
                                key={a.id}
                                className="rounded px-1 py-0.5 text-[10px] leading-tight"
                                style={{
                                  backgroundColor: a.staffColor + "20",
                                  borderLeft: `2px solid ${a.staffColor}`,
                                }}
                              >
                                {a.staffName}({PARTICIPATION_TYPE_SHORT[a.participationType]})
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
