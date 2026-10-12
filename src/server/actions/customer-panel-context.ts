"use server";
import { requirePermission, checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext, userForViewContext } from "@/lib/store-view-context-server";
import { getCustomerDrawerDetailForUser } from "@/server/queries/customer";
import { getCachedPlans, getCachedStaffOptions } from "@/lib/query-cache";
import { selectOrdinaryServicePlans } from "@/lib/ordinary-service-plans";
import { handleActionError } from "@/lib/errors";
export async function getCustomerPanelContext(customerId:string) {
  try {
    const user=await requirePermission("customer.read");
    const context=await resolveStoreViewContextFromCookie(user);
    const storeId=storeIdForViewContext(await getActiveStoreForRead(user),context);
    const actor=userForViewContext(user,context);
    const customer=await getCustomerDrawerDetailForUser(actor,customerId,storeId);
    const [plans,staffOptions,canDiscount,canAssign,canEditNote]=await Promise.all([
      getCachedPlans(customer.storeId),getCachedStaffOptions(customer.storeId),
      checkPermission(actor.role,actor.staffId,"transaction.discount"),checkPermission(actor.role,actor.staffId,"customer.assign"),checkPermission(actor.role,actor.staffId,"customer.update"),
    ]);
    return {success:true as const,data:{customer,plans:selectOrdinaryServicePlans(plans).map(p=>({id:p.id,name:p.name,category:p.category,price:Number(p.price),sessionCount:p.sessionCount,validityDays:p.validityDays})),staffOptions,canDiscount,canAssign,canEditNote,readOnly:context?.isViewMode ?? false}};
  }catch(error){return handleActionError(error);}
}
