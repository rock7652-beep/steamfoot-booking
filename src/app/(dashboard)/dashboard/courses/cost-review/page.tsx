import {notFound} from 'next/navigation';
import {getCurrentUser} from '@/lib/session';
import {checkPermission} from '@/lib/permissions';
import {resolveStoreViewContextFromCookie} from '@/lib/store-view-context-server';
import {getActiveStoreForRead} from '@/lib/store';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {toLocalMonthStr} from '@/lib/date-utils';
import {settlementMonth} from '@/lib/course-monthly-settlement';
import {courseCostReviewerRole} from '@/lib/course-cost-review';
import {requireCourseStore} from '@/lib/industry-module-server';
import {canMusicFinance,readMusicFinanceScope} from '@/server/services/music-finance-access';
import {getCourseCostReview} from '@/server/queries/course-cost-review';
import {PageShell,PageHeader} from '@/components/desktop';
import {DashboardLink} from '@/components/dashboard-link';
import {CourseCostReviewView} from './cost-review-view';
export default async function CourseCostReviewPage({searchParams}:{searchParams:Promise<{month?:string;dataScope?:string}>}){
 const user=await getCurrentUser();
 if(!user||!courseCostReviewerRole(user.role)||!(await Promise.all((['report.read','transaction.read','wallet.read'] as const).map(p=>checkPermission(user.role,user.staffId,p)))).every(Boolean))notFound();
 const storeId=await getActiveStoreForRead(user);if(!storeId)notFound();await requireCourseStore(storeId);
 if(!await hasStoreFeature(storeId,FEATURES.BASIC_REPORTS))notFound();
 const params=await searchParams,parsed=settlementMonth.safeParse(params.month??toLocalMonthStr());
 if(!parsed.success)return <PageShell><PageHeader title="成本核對"/><p role="alert">請選擇有效月份。</p></PageShell>;
 const readOnly=(await resolveStoreViewContextFromCookie(user))?.isViewMode??false;
 const [canConfirm,feesAllowed]=await Promise.all([
  readOnly?false:checkPermission(user.role,user.staffId,'plans.edit'),
  Promise.all((['cashbook.read','teacher.compensation.read','teacher.settlement.read'] as const).map(p=>checkPermission(user.role,user.staffId,p))).then(async grants=>grants.every(Boolean)&&await canMusicFinance(user,storeId,'teacher.settlement.read')&&await readMusicFinanceScope(user,storeId)===null),
 ]);
 const data=await getCourseCostReview(storeId,parsed.data,{fees:feesAllowed},params.dataScope);
 return <PageShell className="mx-auto w-full min-w-0 max-w-[1440px] space-y-4 p-4 md:p-6"><PageHeader title="成本與收款核對" subtitle="店長核對收費、交易成本與授課費" actions={<DashboardLink href={"/dashboard/courses?"+new URLSearchParams({view:"plans",...(params.dataScope?{dataScope:params.dataScope}:{})})} className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 text-sm">管理收費方式</DashboardLink>}/>
  <form className="flex flex-wrap items-end gap-3"><label>核對月份<input type="month" name="month" defaultValue={parsed.data} required className="mt-1 block min-h-11 rounded-lg border border-earth-200 px-3"/></label>{params.dataScope&&<input type="hidden" name="dataScope" value={params.dataScope}/>}<button type="submit" className="min-h-11 rounded-lg bg-primary-700 px-4 text-white">查看</button></form>
  <CourseCostReviewView data={data} canConfirm={canConfirm}/>
 </PageShell>;
}
