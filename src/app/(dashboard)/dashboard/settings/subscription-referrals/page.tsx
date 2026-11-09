import {assertSubscriptionReferralQa} from "../../../../../../scripts/subscription-referral-qa-scope.mjs";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { getActiveStoreForRead } from "@/lib/store";
import { referralDatabase, subscriptionReferralsReady } from "@/server/services/subscription-referral/runtime";
import { PageShell, PageHeader } from "@/components/desktop";
import { createMySubscriptionReferralCode } from "@/server/actions/subscription-referral";
import { MySubscriptionReferralCode } from "@/components/subscription-referrals/my-code";
export default async function SubscriptionReferralsPage(){
  const user=await getCurrentUser();if(!user)redirect("/hq/login");
  if(getEffectiveActorRole(user)!=="OWNER"||!await checkPermission(user.role,user.staffId,"staff.view"))notFound();
  const storeId=await getActiveStoreForRead(user);if(!storeId)notFound();
  if(!await subscriptionReferralsReady())return <PageShell><PageHeader title="我的推薦"/><p role="status" className="p-4 text-base">推薦活動尚未開通，現有訂閱與推薦資料不受影響。</p></PageShell>;
  const [codes,rewards]=await Promise.all([
    referralDatabase.query<{code:string}>('SELECT code FROM "StoreSubscriptionReferralCode" WHERE "storeId"=$1',[storeId]),
    referralDatabase.query<{state:string;days:number}>('SELECT state,COALESCE(sum(days),0)::int AS days FROM "StoreSubscriptionReferralReward" WHERE "beneficiaryStoreId"=$1 GROUP BY state',[storeId]),
  ]);
  return <PageShell><PageHeader title="我的推薦" subtitle="好用，值得分享。成功推薦，雙方各得 30 天。"/><MySubscriptionReferralCode shareOrigin={assertSubscriptionReferralQa()?`https://${process.env.VERCEL_URL}`:undefined} initialCode={codes[0]?.code??null} createAction={createMySubscriptionReferralCode}/><dl className="grid gap-3 sm:grid-cols-2">{[["READY","已獲得、待套用"],["APPLIED","已發放"]].map(([state,label])=><div key={state} className="rounded-xl border border-earth-200 bg-white p-4"><dt className="text-base text-earth-600">{label}</dt><dd className="mt-2 text-2xl font-semibold">{rewards.find(row=>row.state===state)?.days??0} 天</dd></div>)}</dl><p className="text-base leading-7 text-earth-600">只顯示自己的推薦碼與獎勵天數，不公開朋友的電話、付款金額或其他聯絡資料。已到期的帳戶保留獎勵，重新啟用並核對後使用。</p></PageShell>;
}
