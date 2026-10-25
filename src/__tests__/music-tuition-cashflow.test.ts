import {expect,it,vi} from "vitest";
import {coursePurchaseCashflow} from "@/server/services/music-tuition-cashflow";
import type {Prisma} from "../../generated/course-client";
vi.mock("@/server/services/music-native-workflow",()=>({musicNativeWorkflowEnabled:()=>true}));
vi.mock("@/server/services/music-finance-scope",()=>({musicPurchaseWhere:()=>({})}));
it("replaces cumulative purchase cash with only in-range receipt events",async()=>{
 const date=new Date("2026-10-01T00:00Z");
 const findMany=vi.fn().mockResolvedValue([{id:"p",price:9600,confirmedAt:date},{id:"legacy",price:500,confirmedAt:date}]);
 const query=vi.fn().mockImplementation(async(parts:TemplateStringsArray)=>parts.join("").includes('FROM "CourseMusicTuition"')?[{purchaseId:"p"}]:[{id:"r",purchaseId:"p",amount:3200,paidAt:date,method:"CASH",actorUserId:"manager",lastFour:null}]);
 const rows=await coursePurchaseCashflow({coursePurchase:{findMany},$queryRaw:query} as unknown as Prisma.TransactionClient,"staging",{gte:date,lte:date});
 expect(rows.map(r=>({id:r.cashflowId,amount:r.price}))).toEqual([{id:"legacy",amount:500},{id:"r",amount:3200}]);
 expect(findMany.mock.calls[1][0].where.AND[1].id.in).toEqual(["p"]);
});
