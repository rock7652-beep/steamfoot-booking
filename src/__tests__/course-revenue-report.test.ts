import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({trials:vi.fn(),scope:vi.fn(),orders:vi.fn(),refunds:vi.fn(),store:vi.fn(),people:vi.fn(),staff:vi.fn()}));
vi.mock("@/lib/industry-module-server",()=>({requireCourseStore:m.scope}));
vi.mock("@/lib/course-db",()=>({coursePrisma:{$transaction:async (work: (tx: unknown)=>unknown)=>work({courseTrialPayment:{findMany:m.trials},coursePurchase:{findMany:m.orders},coursePurchaseRefund:{findMany:m.refunds}}),coursePurchase:{findMany:m.orders},coursePurchaseRefund:{findMany:m.refunds}}}));
vi.mock("@/lib/db",()=>({prisma:{store:{findUniqueOrThrow:m.store},customer:{findMany:m.people},staff:{findMany:m.staff}}}));
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
const purchase={id:"p1",customerId:"a",name:"十點",unit:"POINT",price:1000,confirmedAt:new Date("2026-09-16T16:30:00Z"),confirmedBy:"owner",revenueStaffId:null,note:"測試"};
const filters={startDate:"2026-09-17",endDate:"2026-09-17",storeFilter:{storeId:"a"}};
beforeEach(()=>{vi.resetAllMocks();m.trials.mockResolvedValue([]);m.scope.mockResolvedValue(undefined);m.orders.mockImplementation(async(args)=>args.select?[{id:"p1",customerId:"a"}]:[purchase]);m.refunds.mockResolvedValue([]);m.store.mockResolvedValue({name:"測試店"});m.people.mockResolvedValue([{id:"a",name:"購買者",phone:"0912345678"}]);m.staff.mockResolvedValue([{id:"staff",userId:"owner",displayName:"店長",user:{role:"OWNER"}}]);});
describe("course revenue adapter",()=>{
 it("uses Taipei posting dates and scopes every source to the selected store",async()=>{
  const result=await getCourseRevenueReport("a",filters);
  expect(result.data[0].transactionDate).toBe("2026-09-17");
  expect(result.kpi.netRevenue).toBe(1000);
  expect(result.kpi.refundAmount).toBe(0);
  for(const call of m.orders.mock.calls) expect(call[0].where.storeId).toBe("a");
  expect(m.refunds.mock.calls[0][0].where).toEqual({storeId:"a",createdAt:{gte:new Date("2026-09-16T16:00:00Z"),lte:new Date("2026-09-17T15:59:59.999Z")}});
  expect(m.people.mock.calls[0][0].where.storeId).toBe("a");
 });
 it("includes refunds by refund date without counting the original purchase twice",async()=>{
  m.refunds.mockResolvedValue([{id:"r1",amount:800,method:"CASH",createdAt:new Date("2026-09-17T01:00:00Z"),reason:"退款",actorUserId:"owner",purchase:{...purchase,id:"older",price:800,confirmedAt:new Date("2026-08-01T01:00:00Z")}}]);
  const result=await getCourseRevenueReport("a",filters);
  expect(result.kpi).toMatchObject({totalRevenue:1000,refundAmount:800,netRevenue:200,txCount:1,customerCount:1});
  expect(result.data.find(row=>row.id==="r1")?.paymentMethod).toBe("CASH");
  expect(result.data).toHaveLength(2); expect(result.data[0].netAmount).toBe(-800);
 });
 it("filters by real plan unit and payment method",async()=>{
  expect((await getCourseRevenueReport("a",{...filters,planType:"SESSION"})).data).toHaveLength(0);
  expect((await getCourseRevenueReport("a",{...filters,paymentMethod:"CASH"})).data).toHaveLength(0);
  expect((await getCourseRevenueReport("a",{...filters,keyword:"購買者"})).data).toHaveLength(1);
 });
 it("rejects non-course scope before reading financial data",async()=>{m.scope.mockRejectedValue(new Error("wrong module"));await expect(getCourseRevenueReport("a",filters)).rejects.toThrow("wrong module");expect(m.orders).not.toHaveBeenCalled();});
 it("rejects invalid date ranges without a misleading empty report",async()=>{await expect(getCourseRevenueReport("a",{...filters,endDate:"2026-09-16"})).rejects.toThrow("開始日期");expect(m.orders).not.toHaveBeenCalled();});
});

it("adds paid trial revenue without adding attendance or point consumption",async()=>{m.trials.mockResolvedValue([{id:"trial",amount:499,paymentMethod:"CASH",createdAt:new Date("2026-09-17T02:00Z"),actorUserId:"owner",note:"體驗",booking:{customerId:"a",session:{nameSnapshot:"核心"}}}]);const result=await getCourseRevenueReport("a",filters);expect(result.kpi.totalRevenue).toBe(1499);expect(result.summary[0].trialRevenue).toBe(499);expect(result.data.find(r=>r.id==="trial")).toMatchObject({unit:"TRIAL",isFirstPurchase:false,paymentMethod:"CASH"});expect(m.trials.mock.calls[0][0].where).toMatchObject({storeId:"a",OR:expect.any(Array)});});

it("keeps correction reversals on their posting date and preserves split methods",async()=>{
 m.orders.mockResolvedValue([]);
 m.trials.mockResolvedValue([{id:"old",amount:499,paymentMethod:"CASH",paymentSplits:[{paymentMethod:"CASH",amount:200},{paymentMethod:"TRANSFER",amount:299}],createdAt:new Date("2026-09-16T02:00Z"),voidedAt:new Date("2026-09-17T02:00Z"),voidReason:"更正",actorUserId:"owner",note:"",booking:{customerId:"a",session:{nameSnapshot:"核心"}}},{id:"new",amount:450,paymentMethod:"TRANSFER",createdAt:new Date("2026-09-17T02:00Z"),actorUserId:"owner",note:"",booking:{customerId:"a",session:{nameSnapshot:"核心"}}}]);
 const result=await getCourseRevenueReport("a",filters);
 expect(result.kpi.netRevenue).toBe(-49);
 expect(result.data).toHaveLength(2);
 expect(result.paymentMethods).toEqual([{paymentMethod:"TRANSFER",amount:450}]);
 const cash=await getCourseRevenueReport("a",{...filters,paymentMethod:"CASH"});
 expect(cash.data.map(r=>r.id)).toEqual(["old:void"]);expect(cash.kpi.netRevenue).toBe(-200);
});

it("attributes a mixed receipt to only the selected payment method",async()=>{
 m.orders.mockResolvedValue([]);m.trials.mockResolvedValue([{id:"mixed",amount:499,paymentMethod:"CASH",paymentSplits:[{paymentMethod:"CASH",amount:200},{paymentMethod:"TRANSFER",amount:299}],createdAt:new Date("2026-09-17T02:00Z"),actorUserId:"owner",note:"",booking:{customerId:"a",session:{nameSnapshot:"體驗"}}}]);
 const result=await getCourseRevenueReport("a",{...filters,paymentMethod:"TRANSFER"});
 expect(result.kpi.netRevenue).toBe(299);expect(result.data[0].netAmount).toBe(299);expect(result.paymentMethods).toEqual([{paymentMethod:"TRANSFER",amount:299}]);
});
