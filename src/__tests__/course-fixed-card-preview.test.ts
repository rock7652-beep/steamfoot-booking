import {expect,it} from "vitest";
import {courseCardScheduleRows} from "@/lib/course-card-schedule-issue";
const card={unit:"SESSION",available:3,expiresAt:"2027-09-30T15:59:59.999Z"};
it("allocates available credit once per weekly date",()=>{
 const rows=courseCardScheduleRows(card,["2026-11-08","2026-11-15","2026-11-22","2026-11-29"],"08:00");
 expect(rows.map(r=>r.covered)).toEqual([true,true,true,false]);expect(rows[3].reason).toBe("堂數不足");expect(rows[3].available).toBe(0);
});
it("marks every biweekly date outside expiry without consuming credit",()=>{
 const rows=courseCardScheduleRows({...card,available:4},["2027-09-26","2027-10-10","2027-10-24","2027-11-07"],"08:00");
 expect(rows.map(r=>r.reason)).toEqual(["占用課卡","已過期","已過期","已過期"]);expect(rows[3].available).toBe(3);
});
it("recalculates after date or card changes and deduplicates dates",()=>{
 expect(courseCardScheduleRows({...card,available:1},["2026-11-08","2026-11-08"],"08:00")).toHaveLength(1);
 expect(courseCardScheduleRows({...card,available:4},["2026-11-08","2026-11-22"],"08:00").every(r=>r.covered)).toBe(true);
});
it("uses first reservation when an unactivated card has a relative validity",()=>{
 const rows=courseCardScheduleRows({...card,musicValidityDays:7,firstReservedAt:"2026-11-01T00:00:00Z"},["2026-11-08","2026-11-15"],"08:00");
 expect(rows.every(r=>r.reason==="已過期")).toBe(true);
});
it("does not consume a mismatching or not-yet-started card",()=>{
 expect(courseCardScheduleRows({...card,subjectMatches:false},["2026-11-08"],"08:00")[0]).toMatchObject({reason:"科目不符",available:3});
 expect(courseCardScheduleRows({...card,startRequired:true,startsAt:"2026-11-09T00:00:00Z"},["2026-11-08"],"08:00")[0]).toMatchObject({reason:"尚未開始",available:3});
});
