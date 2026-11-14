"use server";
import {z} from "zod";
import {prisma} from "@/lib/db";
import {coursePrisma} from "@/lib/course-db";
import {getManagerCustomerWhere} from "@/lib/manager-visibility";
import {AppError,handleActionError} from "@/lib/errors";
import {courseManagerRead} from "@/server/services/course-access";
import {readMusicTuition} from "@/server/services/music-tuition";

/** Read only actionable amounts across all purchases, including purchases without a card. */
export async function loadMusicCustomerAttention(input:unknown) {
 try {
  const customerId=z.string().min(1).max(200).parse(input);
  const [actor,finance]=await Promise.all([courseManagerRead("customer.read"),courseManagerRead("transaction.read")]);
  const {storeId,user}=actor;
  if(storeId!==finance.storeId||user.id!==finance.user.id)throw new AppError("FORBIDDEN","店家範圍不一致");
  const [customer,music]=await Promise.all([
   prisma.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),id:customerId,storeId,mergedIntoCustomerId:null},select:{id:true}}),
   prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}),
  ]);
  if(!customer||!music)throw new AppError("NOT_FOUND","找不到本店學員");
  const orders=await coursePrisma.coursePurchase.findMany({where:{storeId,customerId,status:{in:["CONFIRMED","PENDING"]},voidedAt:null},select:{id:true,status:true,price:true}});
  const tuition=await readMusicTuition(coursePrisma,storeId,orders.filter(order=>order.status==="CONFIRMED").map(order=>order.id));
  const outstanding=orders.filter(order=>order.status==="CONFIRMED").reduce((sum,order)=>sum+Math.max(0,(tuition.get(order.id)?.due??order.price)-order.price),0);
  return {success:true as const,data:{outstanding,pending:orders.filter(order=>order.status==="PENDING").length}};
 }catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?"讀取失敗":result.error};}
}
