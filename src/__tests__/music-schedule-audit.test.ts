import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { scheduleOnDate, scheduleTotals, slotDecision } from "@/lib/music-schedule-audit";

const at = (day: string, time: string) => `${day}T${time}:00+08:00`;
const booking = (customerId: string, status = "RESERVED") => ({ customerId, status });
const movedFixed = {
  id: "fixed-1", roomId: "room-1", coachId: "teacher-1", isFixed: true,
  startsAt: at("2026-09-26", "15:00"), endsAt: at("2026-09-26", "16:00"),
  rescheduledFromStartsAt: at("2026-09-26", "10:00"),
  rescheduledFromEndsAt: at("2026-09-26", "11:00"),
  rescheduledFromRoomId: "room-1", rescheduledFromCoachId: "teacher-1",
  bookings: [booking("student-a"), booking("student-b")],
};
const temporary = {
  id: "temporary", roomId: "room-1", coachId: "teacher-2",
  startsAt: at("2026-09-26", "10:00"), endsAt: at("2026-09-26", "11:00"),
  bookings: [booking("student-c")],
};
const originalSlot = {
  startsAt: at("2026-09-26", "10:00"), endsAt: at("2026-09-26", "11:00"),
  roomId: "room-1", coachId: "teacher-1", fixed: false,
};

describe("有課資料：釋出時段與原課恢復", () => {
  it("固定課已調走的原位可排單次課，但不可再排固定課", () => {
    expect(slotDecision([movedFixed], originalSlot)).toBe("available");
    expect(slotDecision([movedFixed], { ...originalSlot, fixed: true })).toBe("fixed-origin");
  });

  it("原課恢復時若臨時課已占用教室，必須先處理衝突；老師撞期也攔下", () => {
    expect(slotDecision([movedFixed, temporary], { ...originalSlot, restoringId: "fixed-1" })).toBe("occupied");
    expect(slotDecision([movedFixed], { ...originalSlot, restoringId: "fixed-1" })).toBe("available");
    expect(slotDecision([temporary], { ...originalSlot, roomId: "room-2", coachId: "teacher-2" })).toBe("occupied");
  });

  it("非固定課調走後可排固定課；個別學員請假但課仍在時不能占用", () => {
    expect(slotDecision([{ ...movedFixed, isFixed: false }], { ...originalSlot, fixed: true })).toBe("available");
    const groupWithLeave = { ...temporary, bookings: [booking("student-c"), booking("student-d", "CANCELLED")] };
    expect(slotDecision([groupWithLeave], { ...originalSlot, fixed: false })).toBe("occupied");
  });
});

it("同一批有課資料的日、週、月堂數與人次一致，淡化原位及租借不重算", () => {
  const faded = { ...movedFixed, id: "shadow", previewFaded: "已調課", startsAt: at("2026-09-26", "10:00"), endsAt: at("2026-09-26", "11:00") };
  const rental = { ...temporary, id: "rental", previewKind: "RENTAL", bookings: [], startsAt: at("2026-09-27", "11:00") };
  const nextDay = { ...temporary, id: "next-day", startsAt: at("2026-09-27", "12:00"), endsAt: at("2026-09-27", "13:00"), bookings: [booking("student-a"), booking("student-z", "CANCELLED")] };
  const data = [movedFixed, temporary, faded, rental, nextDay];
  const saturday = scheduleTotals(scheduleOnDate(data, "2026-09-26"));
  const sunday = scheduleTotals(scheduleOnDate(data, "2026-09-27"));
  const week = scheduleTotals(data);
  const month = scheduleTotals(data.filter((session) => session.startsAt.startsWith("2026-09")));
  expect(saturday).toEqual({ classes: 2, people: 3, rentals: 0 });
  expect(sunday).toEqual({ classes: 1, people: 1, rentals: 1 });
  expect(week).toEqual({ classes: 3, people: 4, rentals: 1 });
  expect(month).toEqual(week);
});

it("9/26 陸比截圖轉錄的已知堂數與租借可核對，團體名單未知不虛報人次", () => {
  const source = readFileSync("src/app/(dashboard)/dashboard/courses/showcase/luby-real-day-showcase.tsx", "utf8");
  const rows = source.split("const sourceRows: SourceRow[] = [")[1].split("];", 1)[0]
    .split("\n").filter((line) => /^\s*\["/.test(line))
    .map((line) => [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]));
  expect(rows).toHaveLength(65);
  expect(rows.filter((row) => row[4] === "RENTAL")).toHaveLength(3);
  expect(rows.filter((row) => row.length === 6)).toHaveLength(10);
  expect(rows.filter((row) => row[4] !== "RENTAL" && row.length === 5)).toHaveLength(52);
  expect(rows.filter((row) => ["GROUP", "GROUP_CHANGED"].includes(row[4]) && row.length === 5)).toHaveLength(10);
});
