import { describe, it, expect } from "vitest";
import { dateShiftExceptions, effectiveShifts } from "@/lib/spa-roster";
import { staffAvailable } from "@/lib/spa-scheduling";
const regular={startTime:"09:00",endTime:"21:00",isActive:true};
describe("date roster and breaks",()=>{
 it("overrides a longer weekly shift and blocks lunch and cross-break bookings",()=>{
  const shifts=[{startTime:"10:00",endTime:"13:00"},{startTime:"14:00",endTime:"18:00"}];const exceptions=dateShiftExceptions(shifts);
  expect(staffAvailable("10:00","13:00",regular,exceptions)).toBe(true);
  expect(staffAvailable("13:00","14:00",regular,exceptions)).toBe(false);
  expect(staffAvailable("12:30","14:30",regular,exceptions)).toBe(false);
  expect(staffAvailable("09:00","10:00",regular,exceptions)).toBe(false);
  expect(staffAvailable("18:00","19:00",regular,exceptions)).toBe(false);
  expect(effectiveShifts(regular,exceptions)).toEqual(shifts);
 });
 it("all-day rest overrides the weekly template",()=>{const exceptions=dateShiftExceptions([]);expect(staffAvailable("10:00","11:00",regular,exceptions)).toBe(false);expect(effectiveShifts(regular,exceptions)).toEqual([]);});
 it("allows date shifts without a weekly template and merges adjoining ranges",()=>{const exceptions=dateShiftExceptions([{startTime:"10:00",endTime:"12:00"},{startTime:"12:00",endTime:"14:00"}]);expect(staffAvailable("11:00","13:00",null,exceptions)).toBe(true);});
 it("keeps existing partial leave visible",()=>{expect(effectiveShifts(regular,[{type:"UNAVAILABLE",startTime:"12:00",endTime:"14:00"}])).toEqual([{startTime:"09:00",endTime:"12:00"},{startTime:"14:00",endTime:"21:00"}]);});
});
