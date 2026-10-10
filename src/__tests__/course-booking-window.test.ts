import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),raw:vi.fn(),save:vi.fn(),transaction:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:m.transaction}}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager}));
vi.mock("@/lib/revalidation",()=>({revalidateShopConfig:vi.fn(),revalidateShopConfigInRoute:vi.fn()}));
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

const receipt={expectedStoreId:"s",requestKey:"c35cfeba-1a78-4c84-a6f2-8fb9e1669143",expectedRevision:JSON.stringify([null,14,null])};
it("confirmed saves return persisted fields and reuse an applied retry without writing",async()=>{
 const {saveCourseBookingWindowConfirmed}=await import("@/server/actions/course-booking-window");
 let current={bookableUntilDate:null,bookingWindowDays:14,bookingOpensAt:null,updatedAt:new Date()} as {bookableUntilDate:Date|null;bookingWindowDays:number;bookingOpensAt:Date|null;updatedAt:Date};
 const read=vi.fn(async()=>current),update=vi.fn(async ({data})=>{current={...current,...data};return {count:1};});
 m.raw.mockResolvedValueOnce([{id:"s"}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"s"}]);
 m.transaction.mockImplementation(async work=>work({$queryRaw:m.raw,shopConfig:{findUnique:read,updateMany:update,upsert:m.save}}));
 const input={values:{mode:"rolling",days:7},...receipt};
 expect(await saveCourseBookingWindowConfirmed(input)).toMatchObject({success:true,storeId:"s",data:{date:null,days:7,opensAt:null}});
 expect(await saveCourseBookingWindowConfirmed(input)).toMatchObject({success:true,data:{days:7}});
 expect(update).toHaveBeenCalledTimes(1);expect(update.mock.calls[0][0].where).toEqual({storeId:"s",updatedAt:current.updatedAt});
});
it("confirmed stale edits cannot clear a newer delayed opening",async()=>{
 const {saveCourseBookingWindowConfirmed}=await import("@/server/actions/course-booking-window");
 m.raw.mockResolvedValue([{id:"s"}]);
 m.transaction.mockImplementation(async work=>work({$queryRaw:m.raw,shopConfig:{findUnique:vi.fn().mockResolvedValue({bookableUntilDate:null,bookingWindowDays:14,bookingOpensAt:new Date("2026-09-20T00:00:00Z")}),upsert:m.save}}));
 expect(await saveCourseBookingWindowConfirmed({...receipt,values:{mode:"rolling",days:7}})).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("已被修改")});expect(m.save).not.toHaveBeenCalled();expect(m.raw).toHaveBeenCalledTimes(1);
});
it("confirmed cross-store input is refused before any transaction",async()=>{
 const {saveCourseBookingWindowConfirmed}=await import("@/server/actions/course-booking-window");
 expect(await saveCourseBookingWindowConfirmed({...receipt,expectedStoreId:"other",values:{mode:"rolling",days:7}})).toMatchObject({success:false,uncertain:false});expect(m.transaction).not.toHaveBeenCalled();
});
it("confirmed save retains existing reservations and reports cache failure after commit as saved",async()=>{
 const {saveCourseBookingWindowConfirmed}=await import("@/server/actions/course-booking-window");
 const {revalidateShopConfigInRoute}=await import("@/lib/revalidation");
 const update=vi.fn().mockResolvedValue({count:1});let current={bookableUntilDate:null,bookingWindowDays:14,bookingOpensAt:null,updatedAt:new Date()};
 m.transaction.mockImplementation(async work=>work({$queryRaw:m.raw,shopConfig:{findUnique:vi.fn(()=>current),updateMany:update,upsert:m.save}}));
 m.raw.mockResolvedValueOnce([{id:"s"}]).mockResolvedValueOnce([{startsAt:new Date("2026-10-01T12:00:00+08:00")}]);
 expect(await saveCourseBookingWindowConfirmed({...receipt,values:{mode:"rolling",days:7}})).toMatchObject({success:false,error:expect.stringContaining("已有課程預約")});expect(update).not.toHaveBeenCalled();
 m.raw.mockResolvedValueOnce([{id:"s"}]).mockResolvedValueOnce([]);update.mockImplementation(async()=>{current={...current,bookingWindowDays:7};return {count:1};});vi.mocked(revalidateShopConfigInRoute).mockImplementation(()=>{throw new Error("cache failed");});
 expect(await saveCourseBookingWindowConfirmed({...receipt,values:{mode:"rolling",days:7}})).toMatchObject({success:true,data:{days:7},syncWarning:true});
});
it("rejects a concurrent legacy writer through the database revision check",async()=>{
 const {saveCourseBookingWindowConfirmed}=await import("@/server/actions/course-booking-window");
 const update=vi.fn().mockResolvedValue({count:0});m.raw.mockResolvedValueOnce([{id:"s"}]).mockResolvedValueOnce([]);
 m.transaction.mockImplementation(async work=>work({$queryRaw:m.raw,shopConfig:{findUnique:vi.fn().mockResolvedValue({bookableUntilDate:null,bookingWindowDays:14,bookingOpensAt:null,updatedAt:new Date()}),updateMany:update,upsert:m.save}}));
 expect(await saveCourseBookingWindowConfirmed({...receipt,values:{mode:"rolling",days:7}})).toMatchObject({success:false,uncertain:false,error:expect.stringContaining("已被修改")});expect(m.save).not.toHaveBeenCalled();
});
it("unknown database failures remain uncertain for same-attempt retry",async()=>{
 const {saveCourseBookingWindowConfirmed}=await import("@/server/actions/course-booking-window");m.transaction.mockRejectedValue(new Error("connection interrupted"));
 expect(await saveCourseBookingWindowConfirmed({...receipt,values:{mode:"rolling",days:7}})).toMatchObject({success:false,uncertain:true});
});
