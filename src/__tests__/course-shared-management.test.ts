import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (name: string) => readFileSync(`src/app/(dashboard)/dashboard/courses/${name}.tsx`, "utf8");

it("shares ordering controls without changing compensation rules", () => {
  expect(read("staff-workspace")).toContain("displayOrder,canManage");
  expect(read("member-workspace")).toContain("displayOrder,canEdit");
  expect(read("workspace")).toContain('displayOrder,view==="rooms"');
  expect(read("staff-workspace")).toContain("music && feeEnabled ? <MusicTeacherFeeEditor");
});

it("uses attendance directly for batch sign-in in both profiles", () => {
  const roster = read("roster");
  expect(roster).toContain('>("ATTENDED")');
  expect(roster).not.toContain('value="CHECKED_IN"');
  expect(roster).toContain('<option value="ATTENDED">簽到即出席</option>');
  expect(roster).toContain('<option value="RESERVED">批次恢復待點名</option>');
});

it("does not force music business rules onto fitness to center the roster", () => {
  const workspace = read("workspace");
  expect(workspace).not.toContain('presentation={courseDialog.kind');
  expect(workspace).toContain('musicLayout={businessProfile === "MUSIC"}');
});

it("shares weekly grids without hiding sessions lacking an active room", () => {
  const board = read("course-schedule-board");
  expect(board).not.toContain('mode === "week" && businessProfile === "MUSIC"');
  expect(board).toContain('sessions.every(session => activeRooms.some(room => room.id === session.roomId))');
  expect(board).toContain('length: lastHour - firstHour');
});

it("does not interpret old check-in timestamps as settled attendance", () => {
  const roster = read("roster");
  expect(roster).toContain('"待簽到結算"');
  expect(roster).not.toContain('if (!musicLayout) return true;');
  expect(roster).toContain('min-w-[760px]');
});
