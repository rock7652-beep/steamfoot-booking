"use client";

import Link from "next/link";
import { parseTaipeiDateTime, parseLocalDate, addTaiwanDuration } from "@/lib/date-utils";
import { CourseScheduleBoard } from "../course-schedule-board";

const rooms = Array.from({ length: 6 }, (_, index) => ({
  id: `sample-room-${index + 1}`, name: `教室 ${String(index + 1).padStart(2, "0")}`, isActive: true,
}));
const coaches = ["林老師", "吳老師", "張老師", "陳老師", "黃老師", "李老師"].map((displayName, index) => ({
  id: `sample-teacher-${index + 1}`, displayName, status: "ACTIVE", courseCoachEnabled: true,
}));
const templates = [
  { id: "sample-guitar", name: "吉他個別課", classType: "PRIVATE" },
  { id: "sample-piano", name: "鋼琴個別課", classType: "PRIVATE" },
  { id: "sample-drums", name: "爵士鼓個別課", classType: "PRIVATE" },
  { id: "sample-group", name: "吉他團體班", classType: "GROUP" },
];
const studentNames = [
  "陳柏宇", "王怡婷", "林品睿", "黃詩涵", "張家瑋", "吳語晴", "李宥辰", "謝可昕",
  "歐陽子晴", "陳昱安", "曾思妤", "葉承恩", "邱允希", "洪子翔", "劉雅筑", "楊子萱",
  "蔡嘉佑", "蘇品妍", "許家誠", "廖心瑜", "江子皓", "傅采恩", "梁以安", "羅若彤",
];
const kinds = [
  { label: "每週固定", fixed: true },
  { label: "隔週固定", fixed: true, biweekly: true },
  { label: "自由約課" },
  { label: "團體班", fixed: true, group: true },
  { label: "調課", fixed: true, moved: true },
  { label: "代課", fixed: true, substitute: true },
  { label: "體驗課", trial: true },
] as const;

function sampleSessions(date: string) {
  return kinds.flatMap((kind, row) => Array.from({ length: 7 }, (_, index) => {
    // Spread seven examples of every type over 13 hours and six teachers.
    // 17 and 78 are coprime, so every lesson occupies a distinct teacher/hour cell.
    const slot = ((row * 7 + index) * 17) % (13 * coaches.length);
    const resource = slot % coaches.length;
    const hour = 9 + Math.floor(slot / coaches.length);
    // Rotate rooms each hour; the permutation keeps every teacher and room unique at that hour.
    const room = rooms[(resource + hour - 9) % rooms.length];
    const time = `${String(hour).padStart(2, "0")}:00`;
    const start = parseTaipeiDateTime(date, time)!;
    const duration = "trial" in kind ? 30 : 60;
    const privateTemplate = templates[(row + index) % 3];
    return {
      id: `sample-${row}-${index}`,
      templateId: "group" in kind ? "sample-group" : privateTemplate.id,
      nameSnapshot: "group" in kind ? "吉他團體班" : privateTemplate.name,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
      coachId: coaches[resource].id,
      roomId: room.id,
      capacity: "group" in kind ? 6 : 1,
      pointCost: 0,
      isFixed: "fixed" in kind,
      isBiweekly: "biweekly" in kind,
      rescheduledFromStartsAt: "moved" in kind ? parseTaipeiDateTime(addTaiwanDuration(date, -1, "DAY"), time)!.toISOString() : null,
      rescheduledFromCoachId: "substitute" in kind ? coaches[(resource + 1) % coaches.length].id : null,
      bookings: Array.from({ length: "group" in kind ? 3 : 1 }, (_, booking) => ({
        customerId: `sample-student-${row}-${index}-${booking}`,
        customerName: studentNames[(row * 7 + index * 3 + booking) % studentNames.length],
        status: "group" in kind && index === 0
          ? ["ATTENDED", "NO_SHOW", "CANCELLED"][booking]
          : ("group" in kind ? booking === 0 && index % 2 === 0 : index === 1) ? "ATTENDED" : "RESERVED",
        bookingKind: "trial" in kind ? "TRIAL" : "REGULAR",
      })),
    };
  }));
}

export function MusicTypesShowcase({ date }: { date: string }) {
  const [, month, day] = date.split("-").map(Number);
  const weekday = "日一二三四五六"[parseLocalDate(date).getDay()];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-earth-900">{month}/{day}（{weekday}）音樂課表 · 班型驗收</h1>
          <p className="text-xs text-earth-700">純示意資料：七種型態各 7 堂，共 49 堂、63 位學員；老師輪換教室，部分課已點名（含請假、曠課）。這頁不會建立預約或修改店家資料。</p>
        </div>
        <Link href="/dashboard/courses" className="rounded-lg border border-earth-200 bg-white px-3 py-2 text-xs font-medium text-earth-800">返回真實課表</Link>
      </div>
      <CourseScheduleBoard
        businessProfile="MUSIC" mode="day" selectedDate={date} today={date}
        sessions={sampleSessions(date)} rooms={rooms} coaches={coaches} templates={templates}
        leaveCounts={{ "sample-3-0": 1 }}
        storePeriods={[{ openTime: "09:00", closeTime: "22:00" }]}
        staffAvailability={[]} staffAvailabilityExceptions={[]}
        onOpenEmpty={() => {}} onSelectDate={() => {}} onOpenSession={() => {}}
        readOnly
      />
    </div>
  );
}
