"use server";
import { revalidatePath } from "next/cache";
import { requireAdminSession, requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { getActiveStoreForRead } from "@/lib/store";
import { revalidateStorePlan, revalidateShopConfig } from "@/lib/revalidation";
import { referralBindSchema, referralVerifySchema, referralApplySchema, referralApplyBothSchema } from "@/lib/subscription-referral-forms";
import { ensureReferralCode, bindReferralLead, verifyReferralPayment, applyReferralReward, applyReferralRewards } from "@/server/services/subscription-referral/repository";
import { referralDatabase, requireSubscriptionReferralsReady } from "@/server/services/subscription-referral/runtime";
export type ReferralActionState={success:boolean;message:string;code?:string};
const hqPath="/hq/dashboard/stores/referrals";
async function hqActor(){const user=await requireAdminSession();if(getEffectiveActorRole(user)!=="ADMIN")throw new Error("請先返回總部操作");await requirePermission("staff.manage");await requireSubscriptionReferralsReady();return user;}
function errorMessage(error:unknown){return error instanceof Error&&!error.message.includes("\n")&&error.message.length<160&&/[\u3400-\u9fff]/.test(error.message)&&!error.message.startsWith("Invalid")?error.message:"操作未完成，請核對資料或重新整理後重試。";}
export async function createMySubscriptionReferralCode(_previous:ReferralActionState,form:FormData):Promise<ReferralActionState>{
  try{
    if([...form.keys()].some(key=>key!=="$ACTION_ID"&&key!=="$ACTION_REF"&&!key.startsWith("$ACTION_")))throw new Error("推薦碼只依目前登入店家建立");
    const user=await requireStaffSession();
    if(getEffectiveActorRole(user)!=="OWNER")throw new Error("此功能僅限店家老闆使用");
    const storeId=await getActiveStoreForRead(user);if(!storeId)throw new Error("請先選擇店家");
    // Referral management does not change operational access or reopen an expired subscription.
    await requirePermission("staff.view",undefined,{storeId});await requireSubscriptionReferralsReady();
    const code=await ensureReferralCode(referralDatabase,storeId,user.id);
    revalidatePath("/dashboard/settings/subscription-referrals");return {success:true,message:"推薦碼已建立，之後轉換方案仍沿用同一組。",code};
  }catch(error){return {success:false,message:errorMessage(error)};}
}
export async function bindSubscriptionReferral(_previous:ReferralActionState,form:FormData):Promise<ReferralActionState>{try{const user=await hqActor();const data=referralBindSchema.parse(Object.fromEntries(form));await bindReferralLead(referralDatabase,user.id,data.leadId,data.storeId);revalidatePath(hqPath);return {success:true,message:"已確認朋友的店家，接著確認收款。"};}catch(e){return {success:false,message:errorMessage(e)};}}
export async function verifySubscriptionReferral(_previous:ReferralActionState,form:FormData):Promise<ReferralActionState>{try{const user=await hqActor();const data=referralVerifySchema.parse(Object.fromEntries(form));const result=await verifyReferralPayment(referralDatabase,user.id,{...data,distinctOperator:true,firstPaymentConfirmed:true,refunded:data.refundStatus==="REFUNDED"},new Date());revalidatePath(hqPath);return {success:true,message:result.message};}catch(e){return {success:false,message:errorMessage(e)};}}
export async function applySubscriptionReferralReward(_previous:ReferralActionState,form:FormData):Promise<ReferralActionState>{try{const user=await hqActor();const data=referralApplySchema.parse(Object.fromEntries(form));const result=await applyReferralReward(referralDatabase,user.id,{...data,billingConfirmed:data.billingConfirmed==="on"},new Date());revalidateStorePlan();revalidateShopConfig();revalidatePath(hqPath);return {success:true,message:result.message};}catch(e){return {success:false,message:errorMessage(e)};}}

export async function applyBothSubscriptionReferralRewards(_previous:ReferralActionState,form:FormData):Promise<ReferralActionState>{
 try{
  const user=await hqActor();const data=referralApplyBothSchema.parse(Object.fromEntries(form));
  const result=await applyReferralRewards(referralDatabase,user.id,{referralId:data.referralId,referrer:{expectedExpiresOn:data.referrerExpiresOn,billingReference:data.referrerBillingReference},referred:{expectedExpiresOn:data.referredExpiresOn,billingReference:data.referredBillingReference},billingConfirmed:data.billingConfirmed==="on"},new Date());
  revalidateStorePlan();revalidateShopConfig();revalidatePath(hqPath);return {success:true,message:result.message};
 }catch(e){return {success:false,message:errorMessage(e)};}
}
