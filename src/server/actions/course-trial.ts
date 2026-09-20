"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {courseManager,courseTransaction} from "@/server/services/course-access";
import {handleActionError,AppError} from "@/lib/errors";
import {getTrialSettings,clampTrialTotal} from "@/lib/shop-config";
import {reserveTrialCourse} from "@/server/services/course-booking";
import {collectCourseTrialInTransaction,voidCourseTrialInTransaction} from "@/server/services/course-trial-payment";
import {paymentMethodValues,paymentSplitSchema} from "@/lib/payment-splits";
import {prisma} from "@/lib/db";
import {revalidateShopConfig} from "@/lib/revalidation";
const id=z.string().min(1).max(100);
const settingsSchema=z.object({trialEnabled:z.boolean(),trialDefaultPrice:z.number().int().min(0).max(1000000),trialAllowPriceEdit:z.boolean(),trialMinPrice:z.number().int().min(0).max(1000000),trialMaxPrice:z.number().int().min(0).max(1000000)}).refine(d=>d.trialMinPrice<=d.trialDefaultPrice&&d.trialDefaultPrice<=d.trialMaxPrice,"預設體驗金額須介於最低與最高價格");
function refresh(){revalidatePath("/dashboard","layout");revalidatePath("/book");}
export async function saveCourseTrialSettings(input:unknown){try{
 const {storeId}=await courseManager("trial.manage");const data=settingsSchema.parse(input);
 await prisma.shopConfig.upsert({where:{storeId},create:{storeId,...data},update:data});
 revalidateShopConfig();refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function createCourseTrial(input:unknown){try{
 const {storeId,user}=await courseManager("trial.create");await courseManager("booking.create");
 const data=z.object({sessionId:id,customerId:id,requestKey:z.string().uuid(),price:z.number().int().min(0).max(1000000).optional(),notes:z.string().max(1000).default("")}).parse(input);
 const settings=await getTrialSettings(storeId);if(!settings.trialEnabled)throw new AppError("FORBIDDEN","店家體驗功能已關閉");
 const trialPrice=clampTrialTotal(data.price,1,settings);
 await reserveTrialCourse({storeId,userId:user.id,name:user.name??"店長"},{sessionId:data.sessionId,customerId:data.customerId,requestKey:data.requestKey,notes:data.notes,trialPrice});refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function collectCourseTrial(input:unknown){try{
 const {storeId,user}=await courseManager("trial.confirm");
 const data=z.object({bookingId:id,requestKey:z.string().uuid(),amount:z.number().int().min(0).max(1000000),paymentMethod:z.enum(paymentMethodValues),paymentSplits:z.array(paymentSplitSchema).min(2).max(5).optional(),note:z.string().trim().max(500).optional(),originalPaymentId:id.optional(),reason:z.string().trim().min(1).max(500).optional()}).parse(input);
 if(data.originalPaymentId)await courseManager("transaction.void");
 const pricing=await getTrialSettings(storeId);
 await courseTransaction(storeId,tx=>collectCourseTrialInTransaction(tx,{storeId,userId:user.id},data,pricing));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}

export async function voidCourseTrialPayment(input:unknown){try{
 const {storeId,user}=await courseManager("transaction.void");
 const data=z.object({paymentId:id,reason:z.string().trim().min(1).max(500)}).parse(input);
 await courseTransaction(storeId,tx=>voidCourseTrialInTransaction(tx,{storeId,userId:user.id},data.paymentId,data.reason));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
