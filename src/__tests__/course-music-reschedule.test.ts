import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const action = readFileSync("src/server/actions/course.ts", "utf8");
const board = readFileSync(
  "src/app/(dashboard)/dashboard/courses/course-schedule-board.tsx",
  "utf8",
);
const workspace = readFileSync(
  "src/app/(dashboard)/dashboard/courses/workspace.tsx",
  "utf8",
);
const migration = readFileSync(
  "prisma/migrations/20260925121500_course_music_reschedule_v1/migration.sql",
  "utf8",
);

it("moves lessons atomically without deleting the original before the target is valid", () => {
  expect(action).toContain("export async function moveCourseSessions");
  expect(action).toContain('z.enum(["SINGLE", "WEEKS", "FUTURE"])');
  expect(action).toContain("assertMusicCourseAvailability");
  expect(action).toContain("assertCourseSessionsFitHours");
  expect(action).toContain("assertCourseDutyCoverage");
  expect(action).toContain("tx.courseSessionMove.create");
  expect(action).toContain("data: { cancelledAt: new Date() }");
  expect(action).toContain("cancelledAt: null");
  expect(action).not.toContain("courseSession.delete");
});

it("keeps temporary moves visible as moved lessons plus original-slot shadows", () => {
  expect(board).toContain("調課");
  expect(board).toContain("已移動");
  expect(board).toContain("rescheduledFromStartsAt");
  expect(board).toContain('moveClipboard?"貼上"');
  expect(workspace).toContain("這堂");
  expect(workspace).toContain("連續");
  expect(workspace).toContain("之後都改");
  expect(workspace).toContain("選白格貼上");
});

it("stores reschedule history additively", () => {
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS "CourseSessionMove"');
  expect(migration).toContain('"rescheduledFromStartsAt"');
  expect(migration).toContain('"rescheduledFromRoomId"');
  expect(migration).toContain('"rescheduleKind"');
  expect(migration).toContain("CHECK (\"scope\" IN ('SINGLE','WEEKS','FUTURE'))");
});
