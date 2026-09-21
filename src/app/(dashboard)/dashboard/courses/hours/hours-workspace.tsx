"use client";
import { useState, type ReactNode } from "react";
export function CourseHoursWorkspace({ booking, schedule }: { booking: ReactNode; schedule: ReactNode }) {
  const [section, setSection] = useState("booking");
  return <div>
    <nav aria-label="營業設定分類" className="mb-4 flex flex-wrap gap-2">{[["booking", "預約開放"], ["weekly", "每週營業"], ["special", "特殊公休"]].map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className="min-h-11 rounded-lg border px-4 text-sm aria-pressed:bg-primary-700 aria-pressed:text-white">{label}</button>)}</nav>
    <div hidden={section !== "booking"}>{booking}</div>
    <div hidden={section === "booking"} className={section === "weekly" ? "[&_[data-schedule-grid]]:!block [&_[data-schedule-calendar]]:hidden [&_[data-schedule-day]]:hidden" : "[&_[data-schedule-weekly]]:hidden [&_[data-schedule-grid]]:!grid-cols-1 [&_[data-schedule-day]]:!col-start-1 [&_[data-schedule-day]]:!row-start-auto"}>{schedule}</div>
  </div>;
}
