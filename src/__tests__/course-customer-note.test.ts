import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),writable:vi.fn(),compare:vi.fn(),current:vi.fn(),audit:vi.fn(),refresh:vi.fn()}));
vi.mock("@/server/services/course-access",()=>({courseManager:m.access}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:m.writable}));
vi.mock("next/cache",()=>({revalidatePath:m.refresh}));
vi.mock("@/lib/db",()=>({prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({customer:{updateMany:m.compare,findFirst:m.current},auditLog:{create:m.audit}})}}));
import { saveCourseCustomerNote } from "@/server/actions/course-customer-note";
import { AppError } from "@/lib/errors";
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue({user:{id:"u"},storeId:"store-a"});m.compare.mockResolvedValue({count:1});});
it("uses course authorization, subscription and an atomic store-scoped comparison",async()=>{
  expect((await saveCourseCustomerNote({customerId:"c",serviceNote:" next ",expectedServiceNote:"old"})).success).toBe(true);
  expect(m.access).toHaveBeenCalledWith("customer.update");expect(m.writable).toHaveBeenCalledWith("store-a");
  expect(m.compare).toHaveBeenCalledWith({where:{id:"c",storeId:"store-a",serviceNote:"old"},data:{serviceNote:"next"}});
  expect(m.audit).toHaveBeenCalledWith({data:{actorUserId:"u",targetType:"Customer",targetId:"c",action:"SERVICE_NOTE_UPDATED"}});
});
it.each(["access","writable"] as const)("blocks writes and note disclosure when %s rejects",async guard=>{
  m[guard].mockRejectedValue(new AppError("FORBIDDEN","不可修改"));
  expect((await saveCourseCustomerNote({customerId:"c",serviceNote:"new",expectedServiceNote:null})).success).toBe(false);
  expect(m.compare).not.toHaveBeenCalled();expect(m.current).not.toHaveBeenCalled();
});
it("returns only the authorized store's current note on conflict",async()=>{
  m.compare.mockResolvedValue({count:0});m.current.mockResolvedValue({serviceNote:"colleague"});
  expect(await saveCourseCustomerNote({customerId:"c",serviceNote:"mine",expectedServiceNote:"old"})).toMatchObject({success:false,currentValue:"colleague"});
  expect(m.current).toHaveBeenCalledWith({where:{id:"c",storeId:"store-a"},select:{serviceNote:true}});expect(m.audit).not.toHaveBeenCalled();
});
it("never discloses another store's note when the customer is missing",async()=>{
  m.compare.mockResolvedValue({count:0});m.current.mockResolvedValue(null);
  const result=await saveCourseCustomerNote({customerId:"other-store",serviceNote:"mine",expectedServiceNote:null});
  expect(result.success).toBe(false);expect(result).not.toHaveProperty("currentValue");
});
it("recognizes a committed value after response loss without writing a second audit",async()=>{
  m.compare.mockResolvedValue({count:0});m.current.mockResolvedValue({serviceNote:"mine"});
  expect((await saveCourseCustomerNote({customerId:"c",serviceNote:"mine",expectedServiceNote:"old"})).success).toBe(true);expect(m.audit).not.toHaveBeenCalled();
});
