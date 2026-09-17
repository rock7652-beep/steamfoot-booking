import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),raw:vi.fn(),save:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/revalidation",()=>({revalidateShopConfig:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import {saveCourseBookingWindow} from "@/server/actions/course-booking-window";
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-17T10:00:00+08:00"));m.manager.mockResolvedValue({storeId:"s"});m.raw.mockResolvedValue([]);m.transaction.mockImplementation(async work=>work({$queryRaw:m.raw,shopConfig:{upsert:m.save}}));});
afterEach(()=>vi.useRealTimers());
it("saves fixed date under the authorized course store lock with inclusive Taipei cutoff",async()=>{
 expect(await saveCourseBookingWindow({mode:"fixed",date:"2026-09-30"})).toMatchObject({success:true});expect(m.manager).toHaveBeenCalledWith("business_hours.manage");expect(m.raw.mock.calls[0][1]).toBe("s");expect(m.raw.mock.calls[1][2]).toEqual(new Date("2026-09-30T23:59:59.999+08:00"));expect(m.save).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"s"},update:{bookableUntilDate:new Date("2026-09-30T00:00:00Z"),bookingOpensAt:null}}));
});
it("refuses shrinking over an existing reserved course without updating settings",async()=>{
 m.raw.mockResolvedValueOnce([{id:"s"}]).mockResolvedValueOnce([{startsAt:new Date("2026-10-01T12:00:00+08:00")}]);expect(await saveCourseBookingWindow({mode:"fixed",date:"2026-09-30"})).toMatchObject({success:false,error:expect.stringContaining("已有課程預約")});expect(m.save).not.toHaveBeenCalled();
});
it("rolling mode clears old fixed cutoff and uses the mature 24-hour range",async()=>{
 expect(await saveCourseBookingWindow({mode:"rolling",days:7})).toMatchObject({success:true});expect(m.raw.mock.calls[1][2]).toEqual(new Date("2026-09-24T10:00:00+08:00"));expect(m.save).toHaveBeenCalledWith(expect.objectContaining({update:{bookableUntilDate:null,bookingOpensAt:null,bookingWindowDays:7}}));
});
it.each([{mode:"fixed",date:"2026-02-30"},{mode:"fixed",date:"2026-09-16"},{mode:"rolling",days:0},{mode:"rolling",days:91}])("rejects invalid or out-of-range input before writes: %j",async input=>{expect(await saveCourseBookingWindow(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();});
it("permission failure cannot change any store",async()=>{m.manager.mockRejectedValue(new Error("denied"));expect(await saveCourseBookingWindow({mode:"rolling",days:7})).toMatchObject({success:false});expect(m.save).not.toHaveBeenCalled();});
