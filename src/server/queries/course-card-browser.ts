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
import { AppError, handleActionError } from "@/lib/errors";

function failure(error: unknown) {
  const result = handleActionError(error);
  return { success: false as const, error: result.success ? "讀取失敗，請重試" : result.error };
}

export async function readCourseCards(input: unknown, previewOnly = false, timings?: Record<string,number>, existingRequestSession = false) {
  const work=()=>readCards(input,previewOnly,timings);
  return previewOnly && !existingRequestSession ? withPermissionRequestSession(work) : work();
}

async function readCards(input: unknown, previewOnly: boolean, timings?: Record<string,number>) {
  const measure=async<T>(name:string,work:()=>Promise<T>):Promise<T>=>{const started=performance.now();try{return await measureMusicRead(name,work);}finally{if(timings)timings[name]=Math.round(performance.now()-started);}};
  try {
    const data = z.object({ customerId: z.string().min(1).optional(), cardId: z.string().min(1).optional(),
      dataScope: z.enum(["operational", "legacy"]).optional(),
      search: z.string().trim().max(200).default(""), history: z.boolean().default(false), page: z.number().int().min(0).max(50000).default(0) }).parse(input);
    const [actor,customerActor]=await measure("authorization",()=>Promise.all([courseManagerRead("wallet.read",{reuseVerifiedStore:previewOnly}),courseManagerRead("customer.read",{reuseVerifiedStore:previewOnly})]));
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
    const [cards,totals] = await measure("cardsAndTotals",()=>Promise.all([getCourseCards(storeId,data.customerId,{
      where:{
        ...(musicStore ? { unit: "SESSION" } : {}),
        ...(data.cardId ? {id:data.cardId} : data.history ? {OR:[{closedAt:{not:null}},{expiresAt:{lt:new Date()}}]} : {closedAt:null,...courseCardActiveExpiryWhere(new Date(), true)}),
        AND:[musicCardWhere(storeId,data.dataScope),...(visibleIds ? [{members:{some:{customerId:{in:visibleIds},storeId}}}] : []),
          ...(data.search ? [{OR:[{nameSnapshot:{contains:data.search,mode:"insensitive" as const}},{members:{some:{customerId:{in:matchingIds},storeId}}}]}] : [])],
      }, skip:data.cardId ? 0 : data.page*20, take:data.cardId ? 1 : 21, entries:!!data.cardId,
    }),data.customerId && !data.cardId ? measure("balanceSummary",()=>getCourseBalanceSummary(storeId, data.customerId!, musicStore, data.dataScope)) : Promise.resolve(undefined)]));
    return {success:true as const, rows:cards.slice(0,20),hasMore:cards.length>20,totals};
  } catch(error) { return failure(error); }
}

