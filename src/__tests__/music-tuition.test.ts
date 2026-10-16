import {expect,it,vi,afterEach} from "vitest";
import {musicReceiptAmount,musicPaymentDate,musicTuitionPeriods} from "@/lib/music-tuition";
import {calculateTeacherFee} from "@/lib/course-teacher-fee";
afterEach(()=>vi.useRealTimers());
it("separates due, zero receipt, partial receipt and integer allocations",()=>{
 expect(musicReceiptAmount(9600,3200)).toBe(3200);expect(musicReceiptAmount(9600,0)).toBe(0);
 expect(()=>musicReceiptAmount(9600,9601)).toThrow();expect(()=>musicReceiptAmount(9600,1.5)).toThrow();
 const periods=musicTuitionPeriods([5,4,4],10000,5000);
 expect(periods.map(p=>p.due)).toEqual([3333,3333,3334]);expect(periods.map(p=>p.received)).toEqual([3333,1667,0]);
 expect(periods.reduce((n,p)=>n+p.outstanding,0)).toBe(5000);
});
it("uses Taiwan payment dates and rejects impossible or future dates",()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-15T17:00:00Z"));
 expect(musicPaymentDate().toISOString()).toBe("2026-10-15T16:00:00.000Z");
 expect(()=>musicPaymentDate("2026-02-30")).toThrow();expect(()=>musicPaymentDate("2026-10-17")).toThrow();
});
it("discounted tuition pays every lesson including gifted attendance, rounding only the final fee",()=>{
 const seat={id:"a",customerName:"測試",status:"ATTENDED",bookingKind:"CARD",absenceKind:null,originalUnitPrice:3200/5,discountedBasis:{total:3200,lessons:5}};
 expect(calculateTeacherFee({rule:{mode:"SHARE",value:60},seats:[seat]}).amount).toBe(384);
 expect(calculateTeacherFee({rule:{mode:"SHARE",value:60},seats:[{...seat,discountedBasis:{total:10000,lessons:13},originalUnitPrice:10000/13}]}).amount).toBe(462);
 expect(calculateTeacherFee({rule:{mode:"SHARE",value:60},seats:[{...seat,status:"CANCELLED",absenceKind:"STUDENT_LEAVE"}]}).amount).toBe(0);
 expect(calculateTeacherFee({rule:{mode:"SHARE",value:60},seats:[{...seat,status:"NO_SHOW"}]}).amount).toBe(384);
});
