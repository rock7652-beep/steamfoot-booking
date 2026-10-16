import "server-only";
import {withPermissionRequestSession} from "@/lib/permission-request-session";
import {musicDataSeparationEnabled} from "@/server/services/music-data-scope";
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

export async function readCourseCards(input: unknown, previewOnly = false, timings?: Record<string,number>) {
  const work=()=>readCards(input,previewOnly,timings);
  return previewOnly ? withPermissionRequestSession(work) : work();
}

async function readCards(input: unknown, previewOnly: boolean, timings?: Record<string,number>) {
  const measure=async<T>(name:string,work:()=>Promise<T>):Promise<T>=>{const started=performance.now();try{return await work();}finally{if(timings)timings[name]=Math.round(performance.now()-started);}};
  try {
    const data = z.object({ customerId: z.string().min(1).optional(), cardId: z.string().min(1).optional(),
      dataScope: z.enum(["operational", "legacy"]).optional(),
      search: z.string().trim().max(200).default(""), history: z.boolean().default(false), page: z.number().int().min(0).max(50000).default(0) }).parse(input);
    const [actor,customerActor]=await measure("authorization",()=>Promise.all([courseManagerRead("wallet.read",{reuseVerifiedStore:previewOnly}),courseManagerRead("customer.read",{reuseVerifiedStore:previewOnly})]));
    const {user,storeId}=actor;
    if(customerActor.storeId!==storeId||customerActor.user.id!==user.id)throw new AppError("FORBIDDEN","店家範圍不一致");
    if(previewOnly&&!musicDataSeparationEnabled(storeId))throw new AppError("FORBIDDEN","僅供音樂測試站");
    const visibility = getManagerCustomerWhere(user.role,user.staffId,storeId);
    if (data.customerId && !await prisma.customer.findFirst({where:{...visibility,storeId,id:data.customerId,mergedIntoCustomerId:null},select:{id:true}}))
      throw new AppError("NOT_FOUND","找不到本店顧客");
    // Respect customer visibility even when browsing from the plan screen.
    const visibleIds = typeof visibility.assignedStaffId === "string"
      ? (await prisma.customer.findMany({where:{...visibility,storeId,mergedIntoCustomerId:null},select:{id:true}})).map(c=>c.id) : null;
    const matchingIds = data.search ? (await prisma.customer.findMany({where:{...visibility,storeId,mergedIntoCustomerId:null,
      OR:[{name:{contains:data.search,mode:"insensitive"}},{phone:{contains:data.search}}]},select:{id:true}})).map(c=>c.id) : [];
    const musicStore = !!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}});
    const [cards,totals] = await measure("cardsAndTotals",()=>Promise.all([getCourseCards(storeId,data.customerId,{
      where:{
        ...(musicStore ? { unit: "SESSION" } : {}),
        ...(data.cardId ? {id:data.cardId} : data.history ? {OR:[{closedAt:{not:null}},{expiresAt:{lt:new Date()}}]} : {closedAt:null,...courseCardActiveExpiryWhere(new Date(), true)}),
        AND:[musicCardWhere(storeId,data.dataScope),...(visibleIds ? [{members:{some:{customerId:{in:visibleIds},storeId}}}] : []),
          ...(data.search ? [{OR:[{nameSnapshot:{contains:data.search,mode:"insensitive" as const}},{members:{some:{customerId:{in:matchingIds},storeId}}}]}] : [])],
      }, skip:data.cardId ? 0 : data.page*20, take:data.cardId ? 1 : 21, entries:!!data.cardId,
    }),data.customerId && !data.cardId ? getCourseBalanceSummary(storeId, data.customerId, musicStore, data.dataScope) : Promise.resolve(undefined)]));
    return {success:true as const, rows:cards.slice(0,20),hasMore:cards.length>20,totals};
  } catch(error) { return failure(error); }
}

