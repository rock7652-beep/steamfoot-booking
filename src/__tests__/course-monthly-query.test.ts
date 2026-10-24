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
it("monthly uses the same per-pupil calculator as payment and preserves ending time",async()=>{
 const rule={mode:"SHARE",value:65,calculationVersion:2};
 raw.mockImplementation(async(strings:TemplateStringsArray)=>{
  const sql=strings.join("");
  if(sql.includes('FROM "CourseSession" s LEFT JOIN'))return [{id:"lesson",staffId:"teacher",name:"吉他",startsAt:new Date("2026-09-01T10:00Z"),endsAt:new Date("2026-09-01T11:00Z"),cancelledAt:null,teacherAttendance:"ATTENDED",rule,revision:1}];
  if(sql.includes('FROM "CourseBooking" b'))return ["a","b"].map(id=>({id,sessionId:"lesson",customerName:id,status:"ATTENDED",bookingKind:"CARD",absenceKind:null,purchaseCount:BigInt(1),listPrice:2600,points:4,musicBonusLessons:0}));
  return [];
 });
 const report=await readCourseMonthlySettlement(tx,"A","2026-09");
 expect(report.lines[0]).toMatchObject({amount:846,endsAt:"2026-09-01T11:00:00.000Z",issue:null});
 expect(report.lines[0].feeDetails?.map(d=>d.amount)).toEqual([423,423]);
});

it.each([{bookingKind:"OPENING_MAKEUP"},{bookingKind:"TRIAL",musicOpeningMakeupEntitlementId:"right"}])("monthly payroll retains an unknown liability rather than zero fee for opening makeup: %j",async marker=>{
 raw.mockImplementation(async(strings:TemplateStringsArray)=>{
  const sql=strings.join("");
  if(sql.includes('FROM "CourseSession" s LEFT JOIN'))return [{id:"lesson",staffId:"teacher",name:"補課",startsAt:new Date("2026-09-01T10:00Z"),endsAt:new Date("2026-09-01T11:00Z"),cancelledAt:null,teacherAttendance:"SCHEDULED",rule:{mode:"CLASS",value:500},revision:1}];
  if(sql.includes('FROM "CourseBooking" b'))return [{id:"right-booking",sessionId:"lesson",customerName:"學員",status:"ATTENDED",absenceKind:null,cardId:null,pointCost:0,...marker}];
  return [];
 });
 const report=await readCourseMonthlySettlement(tx,"A","2026-09");
 expect(report.lines).toHaveLength(1);expect(report.lines[0]).toMatchObject({kind:"FEE",amount:null,paid:0,issue:expect.stringContaining("UNVERIFIED")});
});
