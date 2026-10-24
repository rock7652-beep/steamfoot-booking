"use server";
import {z} from "zod";
import {courseManagerRead} from "@/server/services/course-access";
import {prisma} from "@/lib/db";
import {checkPermission} from "@/lib/permissions";
import {getManagerCustomerWhere} from "@/lib/manager-visibility";
import {musicCustomerWhere} from "@/server/services/music-data-scope";
import {resolveStoreViewContextFromCookie} from "@/lib/store-view-context-server";
import {getMusicLeaveWorkspace} from "@/server/queries/music-leave-workspace";
import {AppError,handleActionError} from "@/lib/errors";
/** One authorized student's records only; no store-wide pending list or financial amounts. */
export async function loadMusicStudentMakeups(customerId:string,dataScope?:"operational"|"legacy"){
 try{
  const input=z.object({customerId:z.string().min(1).max(100),dataScope:z.enum(["operational","legacy"]).optional()}).parse({customerId,dataScope});
  const {storeId,user}=await courseManagerRead("booking.read");
  const allowed=await Promise.all([checkPermission(user.role,user.staffId,"customer.read"),checkPermission(user.role,user.staffId,"wallet.read")]);
  if(allowed.some(v=>!v))return {success:true as const,data:null};
  if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}))return {success:true as const,data:null};
  const customer=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,id:input.customerId,mergedIntoCustomerId:null,AND:[musicCustomerWhere(storeId,input.dataScope)]},select:{id:true,name:true}});
  if(!customer)throw new AppError("NOT_FOUND","找不到可檢視的學員");
  const [workspace,canCreate,context]=await Promise.all([getMusicLeaveWorkspace(storeId,[customer],input.dataScope),checkPermission(user.role,user.staffId,"booking.create"),resolveStoreViewContextFromCookie(user)]);
  return {success:true as const,data:{...workspace,customerName:customer.name,canArrange:canCreate&&!context?.isViewMode}};
 }catch(error){return handleActionError(error);}
}
