"use client";

import Link from "next/link";
import { parseTaipeiDateTime, addTaiwanDuration } from "@/lib/date-utils";
import { CourseScheduleBoard } from "../course-schedule-board";

const rooms = Array.from({ length: 6 }, (_, index) => ({
  id: `sample-room-${index + 1}`, name: `教室 ${String(index + 1).padStart(2, "0")}`, isActive: true,
}));
const coaches = ["林老師", "吳老師", "張老師", "陳老師", "黃老師", "李老師"].map((displayName, index) => ({
  id: `sample-teacher-${index + 1}`, displayName, status: "ACTIVE", courseCoachEnabled: true,
}));
const templates = [
  { id: "sample-private", name: "吉他個別課", classType: "PRIVATE" },
  { id: "sample-group", name: "吉他團體班", classType: "GROUP" },
];
const kinds = [
  { label: "每週固定", hour: 9, fixed: true },
  { label: "隔週固定", hour: 10, fixed: true, biweekly: true },
  { label: "自由約課", hour: 11 },
  { label: "團體班", hour: 13, fixed: true, group: true },
  { label: "調課", hour: 15, fixed: true, moved: true },
  { label: "代課", hour: 17, fixed: true, substitute: true },
  { label: "體驗課", hour: 19, trial: true },
] as const;

function sampleSessions(date: string) {
  return kinds.flatMap((kind, row) => Array.from({ length: 3 }, (_, index) => {
    const resource = (row * 2 + index) % coaches.length;
    const time = `${String(kind.hour).padStart(2, "0")}:00`;
    const start = parseTaipeiDateTime(date, time)!;
    const duration = "trial" in kind ? 30 : 60;
    const student = `${kind.label}學員${["一", "二", "三"][index]}`;
    return {
      id: `sample-${row}-${index}`,
      templateId: "group" in kind ? "sample-group" : "sample-private",
      nameSnapshot: "group" in kind ? "吉他團體班" : "吉他個別課",
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
      coachId: coaches[resource].id,
      roomId: rooms[resource].id,
      capacity: "group" in kind ? 6 : 1,
      pointCost: 0,
      isFixed: "fixed" in kind,
      isBiweekly: "biweekly" in kind,
      rescheduledFromStartsAt: "moved" in kind ? parseTaipeiDateTime(addTaiwanDuration(date, -1, "DAY"), time)!.toISOString() : null,
      rescheduledFromCoachId: "substitute" in kind ? coaches[(resource + 1) % coaches.length].id : null,
      bookings: Array.from({ length: "group" in kind ? 3 : 1 }, (_, booking) => ({
        customerId: `sample-student-${row}-${index}-${booking}`,
        customerName: "group" in kind ? `${student}${booking + 1}` : student,
        status: "RESERVED",
        bookingKind: "trial" in kind ? "TRIAL" : "REGULAR",
      })),
    };
  }));
}

export function MusicTypesShowcase({ date }: { date: string }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-earth-900">音樂課表 · 班型驗收</h1>
          <p className="text-xs text-earth-700">純示意資料，每種型態各 3 堂，共 21 堂。這頁不會建立預約或修改店家資料。</p>
        </div>
        <Link href="/dashboard/courses" className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-xs font-medium text-earth-800">返回真實課表</Link>
      </div>
      <CourseScheduleBoard
        businessProfile="MUSIC" mode="day" selectedDate={date} today={date}
        sessions={sampleSessions(date)} rooms={rooms} coaches={coaches} templates={templates}
        storePeriods={[{ openTime: "09:00", closeTime: "20:00" }]}
        staffAvailability={[]} staffAvailabilityExceptions={[]}
        onOpenEmpty={() => {}} onSelectDate={() => {}} onOpenSession={() => {}}
        readOnly
      />
    </div>
  );
}
