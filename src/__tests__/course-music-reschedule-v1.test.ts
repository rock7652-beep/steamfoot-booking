import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const board = readFileSync(
  "src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx",
  "utf8",
);
const workspace = readFileSync(
  "src/app/(dashboard)/dashboard/courses/workspace.tsx",
  "utf8",
);
const action = readFileSync("src/server/actions/course.ts", "utf8");
const schema = readFileSync("course-prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260925121500_course_music_reschedule_v1/migration.sql",
  "utf8",
);

it("keeps temporary moves visible without turning the original slot into an occupied lesson", () => {
  expect(schema).toContain("rescheduledFromStartsAt");
  expect(schema).toContain("rescheduledFromRoomId");
  expect(schema).toContain("model CourseSessionMove");
  expect(board).toContain("調課");
  expect(board).toContain("已移動 ·");
  expect(board).toContain("movedShadows");
});

it("uses a compact cut-paste workflow for one lesson, several weeks, or future lessons", () => {
  expect(workspace).toContain("調整時間");
  expect(workspace).toContain(">這堂</button>");
  expect(workspace).toContain(">連續</button>");
  expect(workspace).toContain(">之後都改</button>");
  expect(workspace).toContain("選白格貼上");
  expect(workspace).toContain("moveCourseSessions");
  expect(board).toContain('moveClipboard?"貼上":"＋"');
});

it("moves atomically and preserves the original lesson if validation fails", () => {
  expect(action).toContain('scope: z.enum(["SINGLE", "WEEKS", "FUTURE"])');
  expect(action).toContain('data: { cancelledAt: new Date() }');
  expect(action).toContain("courseSessionMove.create");
  expect(action).toContain("assertMusicCourseAvailability");
  expect(action).toContain("assertCourseSessionsFitHours");
  expect(action).toContain("assertCourseDutyCoverage");
  expect(migration).toContain("CourseSessionMove");
  expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
});
