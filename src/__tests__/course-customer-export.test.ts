import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({store:vi.fn(),customers:vi.fn(),cards:vi.fn(),classes:vi.fn()}));
vi.mock("@/lib/industry-module-server",()=>({requireCourseStore:m.store}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.customers}}}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{coursePointCard:{findMany:m.cards},$queryRaw:m.classes}}));
import {getCourseCustomerCsv} from "@/server/queries/course-customer-export";
afterEach(()=>vi.useRealTimers());
beforeEach(()=>{
 vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-17T04:00:00Z"));
 m.customers.mockResolvedValue([{id:"b",name:"=FORMULA",phone:"0900",customerStage:"ACTIVE",createdAt:new Date("2026-09-16T20:00:00Z"),assignedStaff:{storeId:"foreign",displayName:"不可外洩"}}]);
 m.cards.mockResolvedValue([
  {nameSnapshot:"共同方案",unit:"POINT",remaining:10,expiresAt:new Date("2026-10-01T00:00:00Z"),members:[{customerId:"a"},{customerId:"b"}],bookings:[{pointCost:3}]},
  {nameSnapshot:"堂數方案",unit:"SESSION",remaining:2,expiresAt:new Date("2026-10-02T00:00:00Z"),members:[{customerId:"b"}],bookings:[]},
  {nameSnapshot:"過期方案",unit:"POINT",remaining:50,expiresAt:new Date("2026-09-01T00:00:00Z"),members:[{customerId:"b"}],bookings:[]},
  {nameSnapshot:"其他顧客方案",unit:"POINT",remaining:100,expiresAt:new Date("2026-10-01T00:00:00Z"),members:[{customerId:"other"}],bookings:[]},
 ]);
 m.classes.mockResolvedValue([{customerId:"b",participations:BigInt(3),completed:BigInt(2),lastVisitAt:new Date("2026-09-16T20:00:00Z")}]);
});
it("exports course balances, holds, distinct expiry dates and attendance without legacy wallet data",async()=>{
 const csv=await getCourseCustomerCsv("own",{cards:true,bookings:true});
 expect(m.customers).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"own",mergedIntoCustomerId:null}}));
 expect(m.cards).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"own",closedAt:null}}));
 expect(m.classes.mock.calls[0].slice(1)).toEqual(["own"]);
 expect(csv).toContain("'=FORMULA");expect(csv).not.toContain("不可外洩");expect(csv).not.toContain("其他顧客方案");
 expect(csv).toContain("共同方案（共卡）：剩餘10／占用3／可用7點／2026-10-01");
 expect(csv).toContain("堂數方案：剩餘2／占用0／可用2堂／2026-10-02");
 expect(csv).toContain('"7","2","3","2","2026-09-17","2026-09-17"');
});
it("does not query cards or bookings when those permissions are absent",async()=>{
 const csv=await getCourseCustomerCsv("own",{cards:false,bookings:false});
 expect(m.cards).not.toHaveBeenCalled();expect(m.classes).not.toHaveBeenCalled();
 expect(csv).toContain('"無檢視權限","無檢視權限","無檢視權限","無檢視權限","無檢視權限","無檢視權限"');
});
it("rejects another module before reading customer data",async()=>{
 m.store.mockRejectedValue(new Error("wrong module"));
 await expect(getCourseCustomerCsv("wrong",{cards:true,bookings:true})).rejects.toThrow("wrong module");
 expect(m.customers).not.toHaveBeenCalled();
});
