import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Source-level guards only; these do not replace browser/device acceptance.
const source = readFileSync("src/app/(dashboard)/dashboard/courses/workspace.tsx", "utf8");

it("mobile calendar shows counts, closures, and retains the accessible date action", () => {
  expect(source).toContain('mt-1 text-xs font-medium sm:hidden');
  expect(source).toContain('{list.length} 堂');
  expect(source).toContain('aria-label={`${date}，${isClosed ? closureLabel : `${list.length} 堂課`}`}');
  expect(source).toContain('calendarDay?.status === "training" ? "員工訓練" : "公休"');
  expect(source).toContain('hidden w-full shrink-0 truncate leading-[14px] sm:block');
});

it("mobile resources retain all actions without a forced desktop table width", () => {
  expect(source).toContain('block w-full text-left text-sm sm:table sm:min-w-[680px]');
  expect(source).toContain('flex flex-wrap items-center gap-2 sm:flex-nowrap');
  expect(source).toContain('查看{template ? "課程" : "教室"}');
  expect(source).toContain('複製設定');
  expect(source).toContain('人數上限：');
});

it("schedule creation submits native form dates, including copied and repeat dates", () => {
  expect(source).toContain('data = new FormData(form)');
  expect(source).toContain('date: data.get("date")');
  expect(source).toContain('defaultValue={copySource ? "" : selectedDate}');
  expect(source).toContain('data.getAll("additionalDates").map(String)');
  expect(source).toContain('repeatUntil: repeat ? data.get("until") : undefined');
});


it("day operations stay dense, refresh automatically, and keep the main action fixed", () => {
  expect(source).toContain("每 60 秒自動更新");
  expect(source).toContain("最後更新");
  expect(source).toContain("已預約／容量");
  expect(source).toContain("堂已滿");
  expect(source).toContain("尚有");
  expect(source).toContain(">更多<");
  expect(source).toContain("＋ 新增排課");
  expect(source).toContain('panel === "day" &&');
});
