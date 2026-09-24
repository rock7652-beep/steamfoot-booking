import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const workspace = readFileSync(
  "src/app/(dashboard)/dashboard/courses/workspace.tsx",
  "utf8",
);
const board = readFileSync(
  "src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx",
  "utf8",
);
const page = readFileSync(
  "src/app/(dashboard)/dashboard/courses/page.tsx",
  "utf8",
);

it("keeps the monthly calendar and adds week/day schedule views", () => {
  expect(workspace).toContain('["month", "week", "day"] as CourseScheduleMode[]');
  expect(workspace).toContain('mode === "month" ? "月表"');
  expect(workspace).toContain('mode === "week" ? "週表" : "日表"');
  expect(workspace).toContain('scheduleMode === "month" ? (');
  expect(workspace).toContain("<CourseScheduleBoard");
});

it("dense day board supports room/coach perspectives and action filters", () => {
  expect(board).toContain("教室視角");
  expect(board).toContain("教練視角");
  expect(board).toContain("今日課程");
  expect(board).toContain("體驗");
  expect(board).toContain("快滿");
  expect(board).toContain("滿班");
  expect(board).toContain("待報到");
  expect(board).toContain("預約 {booked} 人");
});

it("adaptive cards prioritize private members while group cards show capacity", () => {
  expect(board).toContain('template?.classType === "PRIVATE"');
  expect(board).toContain("privateClass && customer ? customer : session.nameSnapshot");
  expect(board).toContain('`${session.bookings.length} / ${session.capacity} 人`');
  expect(board).toContain("customerName");
  expect(board).toContain("bookingKind");
  expect(page).toContain("customerName: true");
  expect(page).toContain("bookingKind: true");
});

it("course operations use the shared right sheet instead of another centered modal", () => {
  expect(workspace).toContain('width={courseDialog.kind === "roster" ? 820 : 560}');
  expect(workspace).toContain('labelledById="course-operation-title"');
  expect(workspace).not.toContain('className="fixed inset-0 z-[80] flex items-center justify-center');
});
