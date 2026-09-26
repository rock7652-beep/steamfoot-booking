import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { courseAttendanceProgress } from "@/lib/course-attendance-visual";

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

it("uses a gray pending edge and a course-colored completed edge without a separate dash", () => {
  const board = readFileSync("src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx", "utf8");
  expect(board).toContain("border-l-slate-400");
  for (const color of ["teal", "blue", "amber", "purple", "orange"]) {
    expect(board).toContain(`border-l-${color}-600`);
  }
  expect(board).not.toContain('className="h-[3px] w-2 shrink-0 rounded bg-emerald-600"');
  expect(board).toContain("leaveCount={leaveCounts[session.id] ?? 0}");
});
