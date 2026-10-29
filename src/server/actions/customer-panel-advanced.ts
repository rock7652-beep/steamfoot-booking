"use server";
import { prisma } from "@/lib/db";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveStoreViewContextFromCookie, storeIdForViewContext, userForViewContext } from "@/lib/store-view-context-server";
import { AppError, handleActionError } from "@/lib/errors";
import { getLineConfigForStore } from "@/lib/line-config";
export async function getCustomerPanelAdvanced(customerId:string) {
  try {
    const user=await requirePermission("customer.read");
    const context=await resolveStoreViewContextFromCookie(user);
    const actor=userForViewContext(user,context);
    const storeId=storeIdForViewContext(await getActiveStoreForRead(user),context);
    const customer=await prisma.customer.findFirst({where:{id:customerId,...getStoreFilter(actor,storeId),mergedIntoCustomerId:null},select:{id:true,storeId:true,lineLinkStatus:true,lineUserId:true,lineLinkedAt:true,lineBindingCode:true,lineBindingCodeCreatedAt:true,customerStage:true,user:{select:{status:true}},followUps:{orderBy:{createdAt:"desc"},take:20,select:{id:true,result:true,note:true,createdAt:true,createdBy:{select:{name:true}}}}}});
    if(!customer || customer.user?.status === "SUSPENDED")throw new AppError("NOT_FOUND","顧客不存在");
    const [canManageLineRebind,request]=await Promise.all([
      checkPermission(actor.role,actor.staffId,"customer.identity.rebind"),
      prisma.lineRebindRequest.findFirst({where:{customerId,storeId:customer.storeId,status:{in:["PENDING_CAPTURE","CANDIDATE_CAPTURED"]}},select:{id:true,status:true,capturedAt:true,expiresAt:true,untilUsed:true,candidate:{select:{userIdHash:true}}}}),
    ]);
    return {success:true as const,data:{customer,canManageLineRebind:canManageLineRebind && (actor.role === "OWNER" || actor.role === "ADMIN") && !context?.isViewMode,canRunLineRebindDryRun:Boolean(getLineConfigForStore(customer.storeId).expectedBasicId),activeLineRebindRequest:request?{id:request.id,status:request.status,capturedAt:request.capturedAt?.toISOString()??null,expiresAt:request.expiresAt.toISOString(),untilUsed:request.untilUsed,userIdHashPrefix:request.candidate?.userIdHash.slice(0,8)??null}:null}};
  }catch(error){return handleActionError(error);}
}
