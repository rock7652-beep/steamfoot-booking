import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({manager:vi.fn(),transaction:vi.fn(),read:vi.fn(),write:vi.fn(),audit:vi.fn(),writable:vi.fn(),revalidate:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.manager,courseTransaction:m.transaction}));
vi.mock("@/server/services/operation-audit-outbox",()=>({enqueueOperationAudit:m.audit}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:m.writable}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
import { saveCourseSchedulingMode } from "@/server/actions/course-scheduling-modes";
import { AppError } from "@/lib/errors";
const tx={courseBookingRule:{findUnique:m.read,upsert:m.write}};
const input={expectedStoreId:"a",expectedRevision:7,requestKey:"00000000-0000-4000-8000-000000000001",mode:"ASSIGNED",enabled:false};
beforeEach(()=>{vi.resetAllMocks();m.manager.mockResolvedValue({storeId:"a",user:{id:"u",name:"管理者"}});m.read.mockResolvedValue({selfBookingEnabled:false,assignedSchedulingEnabled:true,selfBookingRevision:7});m.transaction.mockImplementation((_store,fn)=>fn(tx));m.write.mockResolvedValue({selfBookingEnabled:false,assignedSchedulingEnabled:false,selfBookingRevision:8});});
it("persists only the selected flag, retaining the other flag and all existing records",async()=>{
 expect(await saveCourseSchedulingMode(input)).toMatchObject({success:true,storeId:"a",data:{open:false,assigned:false,revision:8}});
 expect(m.manager).toHaveBeenCalledWith("business_hours.manage");expect(m.transaction).toHaveBeenCalledWith("a",expect.any(Function));
 expect(m.write.mock.calls[0][0].update).toEqual({assignedSchedulingEnabled:false,selfBookingRevision:{increment:1}});
 expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({storeId:"a",before:{open:false,assigned:true},after:{open:false,assigned:false}}),tx);
});
it("rejects cross-store writes before beginning a transaction",async()=>{expect(await saveCourseSchedulingMode({...input,expectedStoreId:"b"})).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();});
it("rejects a stale opposite write and recovers a repeated confirmed save without overwriting",async()=>{
 expect(await saveCourseSchedulingMode({...input,expectedRevision:6})).toMatchObject({success:false});expect(m.write).not.toHaveBeenCalled();
 m.read.mockResolvedValue({selfBookingEnabled:true,assignedSchedulingEnabled:false,selfBookingRevision:9});
 expect(await saveCourseSchedulingMode(input)).toMatchObject({success:true,data:{open:true,assigned:false,revision:9}});expect(m.write).not.toHaveBeenCalled();
});
it("does not mutate when permission or subscription rejects the actor",async()=>{
 m.manager.mockRejectedValueOnce(new AppError("FORBIDDEN","無權限"));expect(await saveCourseSchedulingMode(input)).toMatchObject({success:false});
 m.writable.mockRejectedValueOnce(new AppError("FORBIDDEN","唯讀"));expect(await saveCourseSchedulingMode(input)).toMatchObject({success:false});expect(m.transaction).not.toHaveBeenCalled();
});
it("audit failure fails the transaction receipt and does not revalidate",async()=>{m.audit.mockRejectedValueOnce(new AppError("CONFLICT","稽核失敗"));expect(await saveCourseSchedulingMode(input)).toMatchObject({success:false});expect(m.revalidate).not.toHaveBeenCalled();});
