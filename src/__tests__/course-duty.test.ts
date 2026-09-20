import { beforeEach, expect, it, vi } from "vitest";
import { courseDutyIntervals, dutyCoversCourse } from "@/lib/course-duty";
const mocks = vi.hoisted(()=>({module:vi.fn(), manager:vi.fn(), permission:vi.fn(), transaction:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:mocks.transaction}}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:mocks.module}));
vi.mock("@/lib/permissions",()=>({requireWritablePermission:mocks.permission}));
vi.mock("@/server/services/course-access",()=>({courseManager:mocks.manager}));
import { assertCourseDutyCoverage } from "@/server/services/course-duty";
import { withDutyMutation } from "@/server/services/course-duty-mutation";
const hours=[{dayOfWeek:4,isOpen:true,openTime:"09:00",closeTime:"14:30",slotInterval:60,defaultCapacity:6,segments:[{openTime:"09:00",closeTime:"12:00"},{openTime:"13:00",closeTime:"14:30"}]}];
const session={startsAt:new Date("2026-10-01T09:30:00+08:00"),endsAt:new Date("2026-10-01T11:30:00+08:00"),coachId:"coach-a",nameSnapshot:"測試課"};
beforeEach(()=>{vi.resetAllMocks(); mocks.module.mockResolvedValue("course"); mocks.manager.mockResolvedValue({storeId:"shop"});});
it("requires continuous coverage, not just the starting duty slot",()=>{
 const intervals=courseDutyIntervals("2026-10-01",hours,[]);
 expect(dutyCoversCourse("09:30","11:30",intervals,["09:00"])).toBe(false);
 expect(dutyCoversCourse("09:30","11:30",intervals,["09:00","10:00","11:00"])).toBe(true);
 expect(dutyCoversCourse("09:30","11:30",intervals,["09:00","11:00"])).toBe(false);
});
it("cannot bridge lunch closure or extend past a clipped last slot",()=>{
 const intervals=courseDutyIntervals("2026-10-01",hours,[]), all=intervals.map(s=>s.slotTime);
 expect(dutyCoversCourse("11:30","13:30",intervals,all)).toBe(false);
 expect(dutyCoversCourse("14:00","14:30",intervals,all)).toBe(true);
 expect(dutyCoversCourse("14:00","14:31",intervals,all)).toBe(false);
 expect(courseDutyIntervals("2026-10-01",hours,[{date:new Date("2026-10-01T00:00:00Z"),type:"closed",reason:null,openTime:null,closeTime:null,segments:null,slotInterval:null,defaultCapacity:null}])).toEqual([]);
});
it("disabled integration does not consult classes or duty",async()=>{
 const raw=vi.fn().mockResolvedValue([{dutySchedulingEnabled:false}]);
 await assertCourseDutyCoverage({$queryRaw:raw},"shop",[session]); expect(raw).toHaveBeenCalledTimes(1);
});
it("checks only the assigned coach and reports each conflicting class",async()=>{
 const raw=vi.fn().mockImplementation(async(strings:TemplateStringsArray,...values:unknown[])=>{
  expect(values).toContain("shop"); const sql=strings.join("");
  if(sql.includes("ShopConfig")) return [{dutySchedulingEnabled:true}];
  if(sql.includes("BusinessHours")) return hours;
  if(sql.includes("DutyAssignment")) return ["09:00","10:00","11:00"].map(slotTime=>({date:new Date("2026-10-01T00:00:00Z"),slotTime,staffId:"other-coach"}));
  return [];
 });
 await expect(assertCourseDutyCoverage({$queryRaw:raw},"shop",[session,{...session,nameSnapshot:"第二課"}])).rejects.toThrow(/測試課.*第二課/);
});
it("duty mutation locks the course store and rolls back rather than cancelling affected classes",async()=>{
 let committed=false; const raw=vi.fn().mockImplementation(async(strings:TemplateStringsArray)=>{
  const sql=strings.join(""); if(sql.includes("ShopConfig")) return [{dutySchedulingEnabled:true}];
  if(sql.includes("CourseSession")) return [session]; if(sql.includes("BusinessHours")) return hours; return [];
 });
 mocks.transaction.mockImplementation(async(work)=>{const result=await work({$queryRaw:raw});committed=true;return result;});
 const edit=vi.fn().mockResolvedValue(undefined);
 await expect(withDutyMutation("shop",edit)).rejects.toThrow("尚未儲存");
 expect(raw.mock.calls[0][0].join("")).toContain("FOR UPDATE"); expect(edit).toHaveBeenCalledTimes(1); expect(committed).toBe(false);
});
it("legacy stores retain their existing mutation without course validation",async()=>{
 mocks.module.mockResolvedValue("steamfoot"); const edit=vi.fn().mockResolvedValue("legacy");
 expect(await withDutyMutation("shop",edit)).toBe("legacy"); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.manager).not.toHaveBeenCalled();
});
