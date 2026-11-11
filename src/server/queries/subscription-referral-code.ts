import "server-only";
import { referralDatabase, subscriptionReferralsReady } from "@/server/services/subscription-referral/runtime";
import { SUBSCRIPTION_REFERRAL_CODE_RE } from "@/lib/subscription-referral-code";

/** Caller must derive the store and authorize the owner before this read. Never creates a code. */
export async function readStoreSubscriptionReferralCode(storeId:string){
  try{
    if(!await subscriptionReferralsReady())return {available:false,code:null,readError:false};
    const rows=await referralDatabase.query<{code:string}>('SELECT code FROM "StoreSubscriptionReferralCode" WHERE "storeId"=$1',[storeId]);
    const code=rows[0]?.code??null;
    if(code&&!SUBSCRIPTION_REFERRAL_CODE_RE.test(code))throw Error('Invalid stored code');
    return {available:true,code,readError:false};
  }catch{return {available:false,code:null,readError:true};}
}
