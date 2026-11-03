import {measureMusicRead} from "@/lib/music-read-timing";
import "server-only";
import {withPermissionRequestSession} from "@/lib/permission-request-session";
import {musicNativeWorkflowEnabled} from "@/server/services/music-native-workflow";
import { courseCardActiveExpiryWhere } from "@/lib/course-card-expiry";

import { musicCardWhere } from "@/server/services/music-plan-scope";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManagerRead } from "@/server/services/course-access";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { getCourseCards } from "@/server/queries/course-members";
import { getCourseBalanceSummary } from "@/server/queries/course-balance-summary";
import {courseBalanceTotals} from "@/lib/course-balance-summary";
import { AppError, handleActionError } from "@/lib/errors";

function failure(error: unknown) {
  const result = handleActionError(error);
  return { success: false as const, error: result.success ? "讀取失敗，請重試" : result.error };
}

export async function readCourseCards(input: unknown, previewOnly = false, timings?: Record<string,number>, existingRequestSession = false) {
  const detail=timings??{},started=performance.now();
  const work=()=>readCards(input,previewOnly,detail);
  try{return await (!existingRequestSession ? withPermissionRequestSession(work) : work());}
  finally{console.info('[course-card-read-perf]',{durationMs:Math.round(performance.now()-started),phases:detail});}
}

async function readCards(input: unknown, previewOnly: boolean, timings?: Record<string,number>) {
  const measure=async<T>(name:string,work:()=>Promise<T>):Promise<T>=>{const started=performance.now();try{return await measureMusicRead(name,work);}finally{if(timings)timings[name]=Math.round(performance.now()-started);}};
  try {
    const data = z.object({ customerId: z.string().min(1).optional(), cardId: z.string().min(1).optional(),
      dataScope: z.enum(["operational", "legacy"]).optional(),
      search: z.string().trim().max(200).default(""), history: z.boolean().default(false), page: z.number().int().min(0).max(50000).default(0) }).parse(input);
    const permissionTiming=(permission:string)=>({measure:<T>(name:string,work:()=>Promise<T>)=>measure(`authorization.${permission}.${name}`,work)});
    const [actor,customerActor]=await measure("authorization",()=>Promise.all([courseManagerRead("wallet.read",{reuseVerifiedStore:previewOnly,timing:permissionTiming('wallet.read')}),courseManagerRead("customer.read",{reuseVerifiedStore:previewOnly,timing:permissionTiming('customer.read')})]));
    const {user,storeId}=actor;
    if(customerActor.storeId!==storeId||customerActor.user.id!==user.id)throw new AppError("FORBIDDEN","店家範圍不一致");
    if(previewOnly&&!musicNativeWorkflowEnabled(storeId))throw new AppError("FORBIDDEN","音樂功能未開通");
    const visibility = getManagerCustomerWhere(user.role,user.staffId,storeId);
    // Independent scope reads run together; no financial data is read until all have completed.
    const [customer,visibleCustomers,matchingCustomers,musicEntitlement] = await measure("visibility",()=>Promise.all([
      data.customerId ? prisma.customer.findFirst({where:{...visibility,storeId,id:data.customerId,mergedIntoCustomerId:null},select:{id:true}}) : Promise.resolve(true),
      typeof visibility.assignedStaffId === "string" ? prisma.customer.findMany({where:{...visibility,storeId,mergedIntoCustomerId:null},select:{id:true}}) : Promise.resolve(null),
      data.search ? prisma.customer.findMany({where:{...visibility,storeId,mergedIntoCustomerId:null,
        OR:[{name:{contains:data.search,mode:"insensitive"}},{phone:{contains:data.search}}]},select:{id:true}}) : Promise.resolve([]),
      prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}),
    ]));
    if (!customer) throw new AppError("NOT_FOUND","找不到本店顧客");
    const visibleIds = visibleCustomers?.map(c=>c.id) ?? null;
    const matchingIds = matchingCustomers.map(c=>c.id);
    const musicStore = !!musicEntitlement;
    // This initial view already waits for a full authoritative balance projection.
    // Read it once for rows + totals; never fetch the same cards/members twice.
    // Filters, other pages and card details retain their independent full total.
    const wholeActiveCustomer=!!data.customerId&&!data.cardId&&!data.history&&!data.search&&data.page===0;
    const [cards,totals] = await measure("cardsAndTotals",()=>Promise.all([getCourseCards(storeId,data.customerId,{
      where:{
        ...(musicStore ? { unit: "SESSION" } : {}),
        ...(data.cardId ? {id:data.cardId} : data.history ? {OR:[{closedAt:{not:null}},{expiresAt:{lt:new Date()}}]} : {closedAt:null,...courseCardActiveExpiryWhere(new Date(), true)}),
        AND:[musicCardWhere(storeId,data.dataScope),...(visibleIds ? [{members:{some:{customerId:{in:visibleIds},storeId}}}] : []),
          ...(data.search ? [{OR:[{nameSnapshot:{contains:data.search,mode:"insensitive" as const}},{members:{some:{customerId:{in:matchingIds},storeId}}}]}] : [])],
      }, skip:data.cardId ? 0 : data.page*20, take:data.cardId ? 1 : wholeActiveCustomer?2_147_483_647:21, entries:!!data.cardId,
    }),data.customerId && !data.cardId&&!wholeActiveCustomer ? measure("balanceSummary",()=>getCourseBalanceSummary(storeId, data.customerId!, musicStore, data.dataScope)) : Promise.resolve(undefined)]));
    const rows=cards.slice(0,20).map(card=>card.sessionAdjustments?{...card,sessionAdjustments:card.sessionAdjustments.filter(r=>!visibleIds||visibleIds.includes(r.customerId))}:card);
    return {success:true as const, rows,hasMore:cards.length>20,totals:wholeActiveCustomer?courseBalanceTotals(cards):totals};
  } catch(error) { return failure(error); }
}
