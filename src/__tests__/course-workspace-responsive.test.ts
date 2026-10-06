import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Source-level guards only; these do not replace browser/device acceptance.
const source = readFileSync("src/app/(dashboard)/dashboard/courses/workspace.tsx", "utf8");

it("mobile calendar shows counts, closures, and retains the accessible date action", () => {
  expect(source).toContain('styles.monthDay');
  expect(source).toContain('{total.classes}堂・{total.people}人次');
  expect(source).toContain('aria-label={`${date}，${isClosed ? closureLabel : `${total.classes} 堂課，${total.rentals} 筆租借，${total.people} 人次`}`}');
  expect(source).toContain('calendarDay?.status === "training" ? "員工訓練" : "公休"');
  expect(source).not.toContain('list.slice(0, 2).map');
});

it("resource tables scroll horizontally and retain view and edit actions", () => {
  expect(source).toContain('overflow-x-auto rounded-xl border border-earth-200 bg-white');
  expect(source).toContain('min-w-[740px]');
  expect(source).toContain('查看{template ? "課程" : "教室"}');
  expect(source).toContain('setEditing(');
  expect(source).toContain('人數上限');
});

it("schedule creation submits native form dates, including copied and repeat dates", () => {
  expect(source).toContain('data = new FormData(form)');
  expect(source).toContain("courseScheduleFormFields(data, {templateId: chosen, requestKey})");
  const fields = readFileSync("src/lib/course-schedule-form.ts", "utf8");
  expect(fields).toContain('date: String(fields.get("date") || "")');
  expect(source).toContain('initialDate={scheduleSeed.date ?? selectedDate}');
  expect(fields).toContain('fields.getAll("additionalDates").map(String)');
  expect(fields).toContain('repeatUntil: mode === "weekly" && !weeklyDates');
});


it("day operations stay dense, refresh automatically, and keep the main action fixed", () => {
  expect(source).toContain("每 60 秒自動更新");
  expect(source).toContain("最後更新");
  expect(source).toContain("當日課程統計");
  expect(source).toContain("待點名");
  expect(source).not.toContain("教練｜");
  expect(source).toContain("dialogSession.coachId");
  expect(source).toContain("dialogSession.roomId");
  expect(source).toContain("當日尚無課程");
  expect(source).toContain("查看 ${date} 全部 ${list.length} 筆");
  expect(source).toContain("＋ 新增排課");
  expect(source).toContain('panel === "day" &&');
});
