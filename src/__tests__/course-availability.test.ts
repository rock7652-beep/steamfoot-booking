import { describe, expect, it } from "vitest";
import {
  COURSE_DURATION_OPTIONS,
  COURSE_START_INTERVAL_MINUTES,
  intersectAvailabilityPeriods,
  normalizeAvailabilityPeriods,
  periodContains,
} from "@/lib/course-availability";

describe("course availability",()=>{
  it("keeps music scheduling on 30 minute starts with four duration choices",()=>{
    expect(COURSE_START_INTERVAL_MINUTES).toBe(30);
    expect(COURSE_DURATION_OPTIONS).toEqual([30,60,90,120]);
  });
  it("supports multiple daily periods and gaps",()=>{
    const periods=normalizeAvailabilityPeriods([
      {openTime:"09:00",closeTime:"12:00"},
      {openTime:"13:00",closeTime:"17:00"},
      {openTime:"18:00",closeTime:"22:00"},
    ]);
    expect(periodContains(periods,"11:30",30)).toBe(true);
    expect(periodContains(periods,"12:00",30)).toBe(false);
    expect(periodContains(periods,"18:30",90)).toBe(true);
  });
  it("intersects store and teacher availability",()=>{
    expect(intersectAvailabilityPeriods(
      [{openTime:"09:00",closeTime:"12:00"},{openTime:"13:00",closeTime:"21:00"}],
      [{openTime:"10:30",closeTime:"14:30"}],
    )).toEqual([{openTime:"10:30",closeTime:"12:00"},{openTime:"13:00",closeTime:"14:30"}]);
  });
});

import {availabilityPeriodErrors} from '@/lib/course-availability';
it('returns original interval indexes for every overlap without marking valid adjacent intervals',()=>{
 expect(availabilityPeriodErrors([{openTime:'18:00',closeTime:'21:00'},{openTime:'09:00',closeTime:'20:00'},{openTime:'10:00',closeTime:'12:00'},{openTime:'21:00',closeTime:'22:00'}])).toEqual({0:'與其他時段重疊',1:'與其他時段重疊',2:'與其他時段重疊'});
});
it('marks equal, reversed and incomplete times separately',()=>{
 expect(availabilityPeriodErrors([{openTime:'09:00',closeTime:'09:00'},{openTime:'10:00',closeTime:'09:00'},{openTime:'',closeTime:'12:00'}])).toEqual({0:'結束需晚於開始',1:'結束需晚於開始',2:'請填完整時間'});
});
