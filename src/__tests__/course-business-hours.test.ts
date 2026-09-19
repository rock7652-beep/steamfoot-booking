import { beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),raw:vi.fn(),write:vi.fn(),sessions:vi.fn(),hours:vi.fn(),special:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{businessHours:{findMany:m.hours},specialBusinessDay:{findMany:m.special}}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/lib/revalidation",()=>({revalidateBusinessHours:vi.fn(),revalidateSpecialDays:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import { saveCourseDayHours,getCourseMonthScheduleSummary } from "@/server/actions/course-business-hours";
import { assertCourseSessionsFitHours } from "@/server/services/course-business-hours";
const input={date:"2026-10-01",status:"closed",mode:"copy",weeks:2,reason:"測試公休",periods:[]};
const tx={$queryRaw:m.raw,$executeRaw:m.write,courseSession:{findMany:m.sessions}};
beforeEach(()=>{
 vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"course-store"});m.transaction.mockImplementation(async(_id,work)=>work(tx));m.raw.mockResolvedValue([]);m.sessions.mockResolvedValue([]);m.hours.mockResolvedValue([]);m.special.mockResolvedValue([]);
});
it("writes source and following weeks under one store transaction without touching bookings or cards",async()=>{
 expect(await saveCourseDayHours(input)).toMatchObject({success:true});
 expect(m.manager).toHaveBeenCalledWith("business_hours.manage");expect(m.transaction).toHaveBeenCalledTimes(1);expect(m.write).toHaveBeenCalledTimes(3);
 expect(m.write.mock.calls.map(c=>c[3].toISOString().slice(0,10))).toEqual(["2026-10-01","2026-10-08","2026-10-15"]);
 for(const c of m.write.mock.calls) expect(c[2]).toBe("course-store");
});
it("rejects unauthorized writes before entering a transaction",async()=>{
 m.manager.mockRejectedValue(new Error("denied"));expect(await saveCourseDayHours(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it("rejects overlapping periods before writes",async()=>{
 expect(await saveCourseDayHours({...input,status:"custom",periods:[{openTime:"10:00",closeTime:"12:00"},{openTime:"11:00",closeTime:"13:00"}]})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it("propagates a conflicting future class out of the transaction so all dates roll back",async()=>{
 m.sessions.mockResolvedValue([{startsAt:new Date("2026-10-08T10:00:00+08:00"),endsAt:new Date("2026-10-08T11:00:00+08:00")}]);
 m.raw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join("").includes('"SpecialBusinessDay"')?[{date:new Date("2026-10-08T00:00:00Z"),type:"closed"}]:[]);
 let rejected=false;m.transaction.mockImplementation(async(_id,work)=>{try{return await work(tx);}catch(e){rejected=true;throw e;}});
 expect(await saveCourseDayHours(input)).toMatchObject({success:false});expect(rejected).toBe(true);
});
it("preserves unrelated special dates when editing only a weekly default",async()=>{
 expect(await saveCourseDayHours({...input,mode:"weekly"})).toMatchObject({success:true});
 expect(m.write).toHaveBeenCalledTimes(1);expect(m.write.mock.calls[0][0].join("")).not.toContain("DELETE");
});
it("uses special opening over weekly closure and rejects classes in the break between periods",async()=>{
 m.raw.mockImplementation(async(strings:TemplateStringsArray)=>strings.join("").includes('"SpecialBusinessDay"')?[{date:new Date("2026-10-01T00:00:00Z"),type:"custom",openTime:"09:00",closeTime:"18:00",segments:[{openTime:"09:00",closeTime:"12:00"},{openTime:"14:00",closeTime:"18:00"}]}]:[{dayOfWeek:4,isOpen:false}]);
 const valid={startsAt:new Date("2026-10-01T14:00:00+08:00"),endsAt:new Date("2026-10-01T15:00:00+08:00")};
 await expect(assertCourseSessionsFitHours(tx as unknown as Prisma.TransactionClient,"course-store",[valid])).resolves.toBeUndefined();
 await expect(assertCourseSessionsFitHours(tx as unknown as Prisma.TransactionClient,"course-store",[{...valid,startsAt:new Date("2026-10-01T13:00:00+08:00")}])).rejects.toThrow("衝突");
});
it("month summaries read only the authorized store",async()=>{
 m.hours.mockResolvedValue([{dayOfWeek:4,isOpen:false}]);m.special.mockResolvedValue([{date:new Date("2026-10-01T00:00:00Z"),type:"custom",openTime:"10:00",closeTime:"12:00"}]);
 const result=await getCourseMonthScheduleSummary(2026,10);expect(result["2026-10-01"].status).toBe("custom");expect(result["2026-10-08"].status).toBe("closed");expect(m.hours).toHaveBeenCalledWith({where:{storeId:"course-store"}});
});
