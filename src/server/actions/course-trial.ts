"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {courseManager,courseTransaction} from "@/server/services/course-access";
import {handleActionError,AppError} from "@/lib/errors";
import {getTrialSettings} from "@/lib/shop-config";
import {reserveTrialCourse} from "@/server/services/course-booking";
import {collectCourseTrialInTransaction,voidCourseTrialInTransaction} from "@/server/services/course-trial-payment";
import {paymentMethodValues,paymentSplitSchema} from "@/lib/payment-splits";
import {coursePrisma} from "@/lib/course-db";
import {courseTrialPrice} from "@/lib/course-trial-price";
import {prisma} from "@/lib/db";
import {revalidateShopConfig} from "@/lib/revalidation";
const id=z.string().min(1).max(100);
const settingsSchema=z.object({trialEnabled:z.boolean(),trialDefaultPrice:z.number().int().min(0).max(1000000),trialAllowPriceEdit:z.boolean(),trialMinPrice:z.number().int().min(0).max(1000000),trialMaxPrice:z.number().int().min(0).max(1000000)}).refine(d=>d.trialMinPrice<=d.trialDefaultPrice&&d.trialDefaultPrice<=d.trialMaxPrice,"預設體驗金額須介於最低與最高價格");
function refresh(){revalidatePath("/dashboard","layout");revalidatePath("/book");}
export async function saveCourseTrialSettings(input:unknown){try{
 const {storeId}=await courseManager("trial.manage");const data=settingsSchema.parse(input);
 await prisma.shopConfig.upsert({where:{storeId},create:{storeId,...data},update:data});
 revalidateShopConfig();revalidatePath("/dashboard/settings/trial");revalidatePath("/dashboard/courses");revalidatePath("/book");return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function createCourseTrial(input:unknown){try{
 const {storeId,user}=await courseManager("trial.create");await courseManager("booking.create");
 const data=z.object({allowOverCapacity:z.boolean().optional(),sessionId:id,customerId:id.nullable().default(null),customerName:z.string().trim().min(1).max(80).optional(),requestKey:z.string().uuid(),price:z.number().int().min(0).max(1000000).optional(),notes:z.string().max(1000).default("")}).parse(input);
 const settings=await getTrialSettings(storeId);if(!settings.trialEnabled)throw new AppError("FORBIDDEN","店家體驗功能已關閉");
 if(!data.customerId&&!data.customerName)throw new AppError("VALIDATION","請加入體驗者");
 const session=await coursePrisma.courseSession.findFirst({where:{id:data.sessionId,storeId,cancelledAt:null},select:{template:{select:{musicTrialMode:true,musicPricePerLesson:true}}}});
 if(!session)throw new AppError("NOT_FOUND","找不到本店課程");
 const trialPrice=courseTrialPrice(data.price,settings,session.template);
 await reserveTrialCourse({storeId,userId:user.id,name:user.name??"店長"},{sessionId:data.sessionId,customerId:data.customerId,customerName:data.customerName,requestKey:data.requestKey,notes:data.notes,allowOverCapacity:data.allowOverCapacity,trialPrice});refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function collectCourseTrial(input:unknown){try{
 const {storeId,user}=await courseManager("trial.confirm");
 const data=z.object({bookingId:id,requestKey:z.string().uuid(),amount:z.number().int().min(0).max(1000000),paymentMethod:z.enum(paymentMethodValues).optional(),paymentSplits:z.array(paymentSplitSchema).min(2).max(5).optional(),note:z.string().trim().max(500).optional(),originalPaymentId:id.optional(),reason:z.string().trim().min(1).max(500).optional()}).parse(input);
 if(data.originalPaymentId)await courseManager("transaction.void");
 if(data.amount>0&&!data.paymentMethod)throw new AppError("VALIDATION","請選付款方式");
 const pricing=await getTrialSettings(storeId);
 const receipt=await courseTransaction(storeId,tx=>collectCourseTrialInTransaction(tx,{storeId,userId:user.id},{...data,paymentMethod:data.amount===0?"OTHER":data.paymentMethod!},pricing));refresh();return {success:true as const,receipt:{id:receipt.id,amount:receipt.amount,status:receipt.status,paymentMethod:receipt.paymentMethod}};
}catch(e){return handleActionError(e);}}

export async function voidCourseTrialPayment(input:unknown){try{
 const {storeId,user}=await courseManager("transaction.void");
 const data=z.object({paymentId:id,reason:z.string().trim().min(1).max(500)}).parse(input);
 await courseTransaction(storeId,tx=>voidCourseTrialInTransaction(tx,{storeId,userId:user.id},data.paymentId,data.reason));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}

export async function supplementCourseTrialCustomer(input:unknown){try{
 const {storeId,user}=await courseManager("booking.update");await courseManager("customer.read");
 const data=z.object({bookingId:id,name:z.string().trim().min(1).max(80),phone:z.string().trim().min(1).max(30)}).parse(input);
 const {normalizePhone}=await import("@/lib/normalize");data.phone=normalizePhone(data.phone);
 if(!/^09\d{8}$/.test(data.phone))throw new AppError("VALIDATION","手機請填09開頭共10碼");
 const {getManagerCustomerWhere}=await import("@/lib/manager-visibility");
 const visibility=getManagerCustomerWhere(user.role,user.staffId,storeId);
 let canCreate=false;try{await courseManager("customer.create");canCreate=true;}catch{}
 const limits=await (await import("@/lib/feature-gate")).getStoreLimitsByStoreId(storeId);
 const {attachCourseTrialCustomer}=await import("@/server/services/course-trial-customer");
 const result=await courseTransaction(storeId,tx=>attachCourseTrialCustomer(tx,{storeId,userId:user.id,canCreate,maxCustomers:limits.maxCustomers,assignedStaffId:typeof visibility.assignedStaffId==="string"?visibility.assignedStaffId:undefined},data));
 refresh();revalidatePath("/dashboard/customers");return {success:true as const,...result};
}catch(e){return handleActionError(e);}}
