import { notFound } from 'next/navigation';
import Link from 'next/link';
import { assertSubscriptionReferralQa,REFERRAL_QA_ROLE,REFERRAL_QA_STORES } from '../../../scripts/subscription-referral-qa-scope.mjs';
import { ReferralQaShell } from '@/components/subscription-referrals/qa-shell';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatTWDateTime, toLocalDateStr } from '@/lib/date-utils';
export const dynamic='force-dynamic';
export default async function ReferralTestPage(){
 if(!assertSubscriptionReferralQa())notFound();
 const user=await getCurrentUser();
 const stores=await prisma.store.findMany({select:{id:true,name:true,planExpiresAt:true},orderBy:{id:'asc'}});
 const identity=await prisma.$queryRaw<{role:string;superuser:boolean;bypass:boolean}[]>`SELECT current_user AS role,rolsuper AS superuser,rolbypassrls AS bypass FROM pg_roles WHERE rolname=current_user`;
 if(identity[0]?.role!==REFERRAL_QA_ROLE||identity[0].superuser||identity[0].bypass||stores.length!==REFERRAL_QA_STORES.length||stores.some(s=>!REFERRAL_QA_STORES.includes(s.id)))throw Error('Referral QA database isolation check failed');
 const paid=await prisma.storeSubscription.findUnique({where:{id:'referral-qa-20261105-sub-b'},select:{startedAt:true}});
 return <ReferralQaShell>
  <h1 className="text-2xl font-semibold">推薦功能測試</h1>
  <p className="text-base">目前登入：{user?.name??'尚未登入'}。切換帳號前，先按上方登出。</p>
  <section className="space-y-3 rounded-xl border bg-white p-4">
   <h2 className="text-xl font-semibold">先用總部帳號試一次</h2>
   <p className="break-all text-base">帳號：referral-hq@steamfoot-qa.invalid</p>
   <p className="text-base">密碼請使用對話中提供的測試密碼。</p>
   <Link href="/hq/login?intent=subscription-referral" className="inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-4 py-2 text-base text-white">登入總部帳號</Link>
   <ol className="list-decimal space-y-3 pl-6 text-base leading-7">
    <li><strong>確認朋友的店家：</strong>展開「滿30天朋友」，選同名店家，勾選後按確認。</li>
    <li><strong>確認收款：</strong>填入下方測試資料，選「沒有退款」，勾選首次收款與不同經營者，再按「確認收款」。</li>
    <li><strong>一次發放：</strong>填扣款安排紀錄 QA-BILLING-B，勾選免費期間不扣款，再按「確認發放雙方各 30 天」。</li>
   </ol>
   <div className="space-y-1 rounded-lg bg-earth-50 p-3 text-base"><p>測試收款時間：{paid?formatTWDateTime(paid.startedAt):'尚未就緒'}</p><p>收款憑證：QA-PAID-B</p><p>這次核對紀錄：QA-REVIEW-B</p></div>
   <Link href="/hq/dashboard/stores/referrals" className="inline-flex min-h-11 items-center underline">已登入？前往推薦獎勵 →</Link>
   <p className="text-base text-earth-600">已準備滿 30 天的合成案例，不用等待。只會修改測試資料，不會真的扣款或發送通知。</p>
  </section>
  <details className="space-y-3 rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer text-lg font-semibold">其他測試：推薦碼、朋友申請、查看獎勵</summary>
   <div className="space-y-2 break-all text-base"><p>推薦人：referral-a@steamfoot-qa.invalid</p><p>朋友：referral-b@steamfoot-qa.invalid</p><p>新朋友：referral-c@steamfoot-qa.invalid</p></div>
   <p className="text-base">切換帳號後可查看自己的推薦碼與已發放天數。推薦碼 SB-TESTABCD；複製連結只會指向本測試站。</p>
   <div className="flex flex-wrap gap-4"><Link href="/dashboard/settings/subscription-referrals" className="inline-flex min-h-11 items-center underline">店家我的推薦</Link><Link href="/apply?ref=SB-TESTABCD" className="inline-flex min-h-11 items-center underline">朋友申請表</Link></div>
   <p className="text-base text-earth-600">申請表在測試版須用總部帳號，店名以「【HQ測試】推薦驗收」開頭；新申請仍需先在需求諮詢關聯體驗申請。這是測試限制，正式朋友不需總部登入。</p>
  </details>
  <details className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer text-base font-semibold">查看測試店目前到期日</summary>{stores.map(s=><p className="break-words text-base" key={s.id}>{s.name}：{s.planExpiresAt?toLocalDateStr(s.planExpiresAt):'未設定'}</p>)}</details>
 </ReferralQaShell>;
}
