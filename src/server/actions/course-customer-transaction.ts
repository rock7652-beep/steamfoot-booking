"use server";
import {z} from "zod";
import {courseManagerRead} from "@/server/services/course-access";
import {getMusicRevenueTransactions} from "@/server/queries/music-revenue-transactions";
import {coursePrisma} from "@/lib/course-db";
import {prisma} from "@/lib/db";
import {checkPermission,type PermissionCode} from "@/lib/permissions";
import {resolveStoreViewContextFromCookie} from "@/lib/store-view-context-server";
import {toLocalDateStr} from "@/lib/date-utils";
import {AppError,handleActionError} from "@/lib/errors";

/** Always re-read the same authorized customer's transaction; never accept client balances. */
export async function loadCourseCustomerTransaction(input:unknown){
 try{
  const data=z.object({customerId:z.string().min(1).max(100),purchaseId:z.string().min(1).max(100),dataScope:z.enum(["legacy","operational"]).optional()}).parse(input);
  const [actor,finance]=await Promise.all([courseManagerRead("customer.read"),courseManagerRead("transaction.read")]);
  const {user,storeId}=actor;
  if(finance.storeId!==storeId||finance.user.id!==user.id)throw new AppError("FORBIDDEN","店家範圍不一致");
  const customer=await prisma.customer.findFirst({where:{id:data.customerId,storeId,mergedIntoCustomerId:null},select:{id:true}});
  if(!customer)throw new AppError("NOT_FOUND","找不到本店學員");
  const purchase=await coursePrisma.coursePurchase.findFirst({where:{storeId,id:data.purchaseId,customerId:data.customerId},select:{createdAt:true}});
  if(!purchase)throw new AppError("NOT_FOUND","找不到本店學員交易");
  const date=toLocalDateStr(purchase.createdAt);
  const [result,view,permissions,staff]=await Promise.all([
   getMusicRevenueTransactions(storeId,{from:date,to:date,purchaseId:data.purchaseId,customerId:data.customerId,dataScope:data.dataScope}),
   resolveStoreViewContextFromCookie(user),
   Promise.all(["transaction.refund","wallet.create","transaction.create","transaction.void"].map(p=>checkPermission(user.role,user.staffId,p as PermissionCode))),
   prisma.staff.findMany({where:{storeId,status:"ACTIVE"},select:{id:true,displayName:true}}),
  ]);
  const order=result.rows[0];
  if(!order)throw new AppError("NOT_FOUND","此交易不在目前資料範圍");
  const readOnly=actor.isChildStoreView||view?.isViewMode||data.dataScope==="legacy";
  return {success:true as const,order,staffOptions:staff.map(s=>({id:s.id,name:s.displayName})),canRefund:!readOnly&&permissions[0],canConfirm:!readOnly&&permissions[1],canEdit:!readOnly&&permissions[2],canVoid:!readOnly&&permissions[3]&&order.tuitionDue===undefined};
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?"交易讀取失敗":result.error};}
}
