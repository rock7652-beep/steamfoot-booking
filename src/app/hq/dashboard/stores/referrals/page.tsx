import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { isHqStoreView } from "@/lib/hq-store-view";
import { checkPermission } from "@/lib/permissions";
import { PageShell, PageHeader } from "@/components/desktop";
import { HqSubscriptionReferralView, type Lead, type Row, type Sub, type Reward } from "@/components/subscription-referrals/hq-view";
import { bindSubscriptionReferral, verifySubscriptionReferral, applySubscriptionReferralReward } from "@/server/actions/subscription-referral";
import { referralDatabase as db, subscriptionReferralsReady } from "@/server/services/subscription-referral/runtime";
export default async function HqSubscriptionReferralsPage({searchParams}:{searchParams:Promise<{page?:string;storeQuery?:string}>}){
  const user=await getCurrentUser();if(!user)redirect("/hq/login");
  if(getEffectiveActorRole(user)!=="ADMIN"||await isHqStoreView(user)||!await checkPermission(user.role,user.staffId,"staff.manage"))notFound();
  if(!await subscriptionReferralsReady())return <PageShell><PageHeader title="推薦活動管理"/><p role="status" className="p-4 text-base">活動尚未開通或資料表尚未就緒。此頁不會建立資料表，也不會變更訂閱或扣款。</p></PageShell>;
  const params=await searchParams;const page=Math.min(10000,Math.max(1,Number.parseInt(params.page??"1",10)||1));const storeQuery=(params.storeQuery??"").trim().slice(0,100);const offset=(page-1)*25;
  const [leads,relations,stores]=await Promise.all([
    db.query<Lead>('SELECT l.id,l."storeName",l."originalPayload"->>\'subscriptionReferralCode\' AS code,l."trialApplicationId" FROM "ConsultationLead" l LEFT JOIN "StoreSubscriptionReferral" r ON r."sourceLeadId"=l.id WHERE r.id IS NULL AND COALESCE(l."originalPayload"->>\'subscriptionReferralCode\',\'\')<>\'\' AND l."originalPayload"->>\'subscriptionReferralConfirmed\'=\'true\' ORDER BY l."createdAt" DESC,l.id LIMIT 26 OFFSET $1',[offset]),
    db.query<Row>('SELECT r.id,r.code,r."referrerStoreId",r."referredStoreId",a.name AS "referrerName",b.name AS "referredName",p."receiptRef",p."settledAt",p."subscriptionId" AS "paidSubscriptionId" FROM "StoreSubscriptionReferral" r JOIN "Store" a ON a.id=r."referrerStoreId" JOIN "Store" b ON b.id=r."referredStoreId" LEFT JOIN "StoreSubscriptionReferralPayment" p ON p."referralId"=r.id ORDER BY r."boundAt" DESC,r.id LIMIT 26 OFFSET $1',[offset]),
    db.query<{id:string;name:string}>('SELECT id,name FROM "Store" WHERE "archivedAt" IS NULL AND (name ILIKE $1 OR id=$2) ORDER BY name,id LIMIT 100',[`%${storeQuery}%`,storeQuery]),
  ]);
  const rows=relations.slice(0,25),ids=rows.map(r=>r.id),storeIds=rows.map(r=>r.referredStoreId);
  const [subs,rewards]=ids.length?await Promise.all([
    db.query<Sub>('SELECT id,"storeId",plan,"effectiveAt","startedAt" FROM "StoreSubscription" WHERE "storeId"=ANY($1::text[]) AND "billingStatus"=\'PAID\' AND NOT "isTrial" AND "priceAmount">0 ORDER BY "startedAt",id',[storeIds]),
    db.query<Reward>('SELECT w.id,w."referralId",w."beneficiaryStoreId",w.state,w.days,w."newExpiresOn",s.name AS "storeName",p."expiresAt",s."planStatus",p.status AS "subscriptionStatus",s."archivedAt" FROM "StoreSubscriptionReferralReward" w JOIN "Store" s ON s.id=w."beneficiaryStoreId" LEFT JOIN "StoreSubscription" p ON p.id=s."currentSubscriptionId" WHERE w."referralId"=ANY($1::text[]) ORDER BY w.id',[ids]),
  ]):[[],[]] as [Sub[],Reward[]];
  return <HqSubscriptionReferralView leads={leads.slice(0,25)} rows={rows} stores={stores} subs={subs} rewards={rewards} page={page} storeQuery={storeQuery} hasNext={leads.length>25||relations.length>25} actions={{bind:bindSubscriptionReferral,verify:verifySubscriptionReferral,apply:applySubscriptionReferralReward}}/>;
}
