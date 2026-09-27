import {beforeEach,expect,it,vi} from "vitest";
import type {Prisma} from "../../generated/course-client";
import {readCourseMonthlySettlement,readSettlementSettings} from "@/server/services/course-monthly-settlement";
import {courseSaleSnapshot} from "@/server/services/course-sale-allocation";
const raw=vi.fn(),orders=vi.fn();const tx={$queryRaw:raw,coursePurchase:{findMany:orders}} as unknown as Prisma.TransactionClient;
beforeEach(()=>{vi.resetAllMocks();orders.mockResolvedValue([]);raw.mockImplementation((strings:TemplateStringsArray)=>{const sql=strings.join("");if(sql.includes('FROM "CourseSettlementSetting"'))return Promise.resolve([]);return Promise.resolve([]);});});
it("defaults calculation on but personal income off without rewriting history",async()=>{expect(await readSettlementSettings(tx,"A")).toEqual({profitEnabled:true,feeEnabled:true,personalIncomeEnabled:false,revision:0});});
it("disabled profit permits checkout without developer and allocates receipts to store",async()=>{raw.mockResolvedValue([{profitEnabled:false,feeEnabled:true,revision:2}]);expect(await courseSaleSnapshot(tx,"A",100,700,null)).toEqual({storeCostSnapshot:100,developerProfitSnapshot:0,developerNameSnapshot:null,revenueStaffId:null});});
it("enabled profit still requires valid developer",async()=>{await expect(courseSaleSnapshot(tx,"A",2300,700,null)).rejects.toThrow("指定");});
it("Taipei month boundary scopes purchases correctly",async()=>{await readCourseMonthlySettlement(tx,"A","2026-09");expect(orders.mock.calls[0][0].where).toMatchObject({storeId:"A",confirmedAt:{gte:new Date("2026-08-31T16:00:00.000Z"),lte:new Date("2026-09-30T15:59:59.999Z")}});});
it("payment changes do not change confirmed obligation fingerprint; refund does",async()=>{
 const order={id:"order",storeId:"A",name:"方案",confirmedAt:new Date("2026-09-01"),price:2300,storeCostSnapshot:700,developerProfitSnapshot:1600,developerNameSnapshot:"店長",revenueStaffId:"staff",status:"CONFIRMED",refunds:[] as {amount:number}[]};orders.mockResolvedValue([order]);
 const first=await readCourseMonthlySettlement(tx,"A","2026-09");
 raw.mockImplementation((strings:TemplateStringsArray)=>strings.join("").includes('FROM "CourseProfitPayment"')?Promise.resolve([{id:"p",purchaseId:"order",amount:600,createdAt:new Date(),note:"paid",voidedAt:null,voidReason:null}]):Promise.resolve([]));
 const second=await readCourseMonthlySettlement(tx,"A","2026-09");expect(second.fingerprint).toBe(first.fingerprint);expect(second.lines[0].paid).toBe(600);
 order.refunds=[{amount:1150}];const third=await readCourseMonthlySettlement(tx,"A","2026-09");expect(third.fingerprint).not.toBe(first.fingerprint);expect(third.lines[0].amount).toBe(800);
});
