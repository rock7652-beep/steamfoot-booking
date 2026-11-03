"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {courseManager,courseTransaction} from "@/server/services/course-access";
import {receiveMusicTuition} from "@/server/services/music-tuition";
import {handleActionError} from "@/lib/errors";
export async function recordMusicTuitionReceipt(input:unknown){
 try{
  const data=z.object({purchaseId:z.string().min(1).max(180),amount:z.number().int().positive().max(10000000),paymentDate:z.string(),method:z.enum(["CASH","BANK_TRANSFER","CARD","OTHER"]),lastFour:z.string().max(4).default(""),requestKey:z.string().uuid(),expectedReceived:z.number().int().min(0)}).parse(input);
  const {storeId,user}=await courseManager("transaction.create");
  await courseTransaction(storeId,tx=>receiveMusicTuition(tx,{storeId,userId:user.id},data));
  for(const path of ["/dashboard/courses","/dashboard/customers","/dashboard/revenue","/dashboard/cashbook","/dashboard/cash-drawer","/dashboard"])revalidatePath(path);
  return {success:true as const};
 }catch(error){return handleActionError(error);}
}
