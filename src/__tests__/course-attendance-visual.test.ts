import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { courseAttendanceProgress, courseAttendanceState } from "@/lib/course-attendance-visual";

it("only darkens a class after every learner has a recorded result", () => {
  const pending = courseAttendanceProgress([
    { status: "ATTENDED" }, { status: "NO_SHOW" }, { status: "RESERVED" },
  ]);
  expect(pending).toEqual({ total: 3, processed: 2, complete: false });
  expect(courseAttendanceProgress([
    { status: "ATTENDED" }, { status: "NO_SHOW" }, { status: "CANCELLED" },
  ], 1)).toEqual({ total: 3, processed: 3, complete: true });
});

it("counts check-in, excludes ordinary cancellation, and keeps empty classes light", () => {
  expect(courseAttendanceProgress([
    { status: "RESERVED", checkedInAt: "2026-09-26T01:00:00Z" },
    { status: "CANCELLED" },
  ])).toEqual({ total: 1, processed: 1, complete: true });
  expect(courseAttendanceProgress([{ status: "RESERVED" }, { status: "CANCELLED" }]))
    .toEqual({ total: 1, processed: 0, complete: false });
  expect(courseAttendanceProgress([{ status: "CANCELLED" }]))
    .toEqual({ total: 0, processed: 0, complete: false });
});

it("teacher absence completes a private or group class without marking or charging learners", () => {
  const bookings = [{ status: "RESERVED" }, { status: "RESERVED" }, { status: "RESERVED" }, { status: "RESERVED" }];
  expect(courseAttendanceState(bookings, 0, "NO_SHOW")).toEqual({ total: 4, processed: 0, teacherAbsent: true, complete: true });
  expect(courseAttendanceState(bookings, 0, "LEAVE")).toMatchObject({ processed: 0, teacherAbsent: true, complete: true });
  expect(courseAttendanceState(bookings, 0, "SCHEDULED")).toMatchObject({ processed: 0, teacherAbsent: false, complete: false });
  expect(courseAttendanceState([{status:"ATTENDED"},{status:"NO_SHOW"},...bookings.slice(2)], 0)).toMatchObject({total:4,processed:2,complete:false});
  expect(courseAttendanceState([{status:"ATTENDED"},{status:"NO_SHOW"},{status:"ATTENDED"},{status:"ATTENDED"}], 0)).toMatchObject({total:4,processed:4,complete:true});
  expect(bookings.every(booking=>booking.status==="RESERVED")).toBe(true);
});

it("counts both kinds of leave once, excludes cancelled reservations, and reverses corrections", () => {
  const bookings = [
    ...Array.from({length: 7}, () => ({status: "ATTENDED"})),
    {status: "NO_SHOW"},
    {status: "CANCELLED", absenceKind: "STUDENT_LEAVE"},
    {status: "CANCELLED", absenceKind: "GROUP_LEAVE_FORFEITED"},
    {status: "CANCELLED"},
  ];
  expect(courseAttendanceProgress(bookings, 2)).toEqual({total: 10, processed: 10, complete: true});
  expect(courseAttendanceProgress([{status: "RESERVED"}, ...bookings.slice(1)])).toEqual({total: 10, processed: 9, complete: false});
  expect(courseAttendanceProgress(bookings.slice(8, 10))).toEqual({total: 2, processed: 2, complete: true});
});

it("fitness cards show attendance progress using the ownership-filtered roster", () => {
  const board = readFileSync("src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx", "utf8");
  expect(board).toContain("courseAttendanceState(session.displayBookings ?? session.bookings, 0, session.teacherAttendance)");
  expect(board).toContain('title="點名完成度"');
  expect(board).not.toContain('activeBookings.every');
});
