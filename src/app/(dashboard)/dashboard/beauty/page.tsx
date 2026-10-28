import {redirectOperations} from "@/lib/operations-navigation-server";
import {operationsArea,legacyOperationsHref} from "@/lib/operations-navigation";
import {resolveBookingLineEntry} from "@/server/services/booking-line-entry";
import {customerLabelSnapshot} from "@/server/services/customer-label-snapshot";
import {CustomerLabelsSeed} from "@/components/customer-labels";
import {CashbookShortcut} from "../cashbook/_components/cashbook-shortcut";
import {BeautyHome} from '@/components/beauty/home';
import {CourseUnassignedPlans} from '../courses/unassigned-plans-view';
import {CourseTodos} from '../courses/todos-view';
import {beautyDailyHref,getBeautyUnassignedPlanPage,getBeautyHomeTodos} from '@/server/beauty/home';
import BeautyRemindersPage from "./reminders/page";
import {CustomerGrowthNavigation} from '@/components/customer-growth-navigation';
import {BeautySettingsWorkspace} from '@/components/beauty/settings-workspace';
import {CustomerLabelsSettings} from '@/components/customer-labels';
import {getStoreUsage} from '@/server/queries/usage';
import {PRICING_PLAN_INFO} from '@/lib/feature-flags';
import {getCurrentStorePlan} from '@/lib/store-plan';
import {SettingsListRow} from '@/components/settings';
import {CARE_REASONS,type CareReason} from '@/lib/customer-care-lifecycle';
import ScheduleSettingsPage from "../settings/hours/page";
import {CourseSettingsPanel} from "../courses/settings-panel";
import {CourseSettingsPanelContent} from "../courses/settings-panel-content";
import {isCourseSettingsPanel} from "@/lib/course-settings-panels";
import {courseAnalysisRange} from "@/lib/course-analytics";
import {beautyAnalysisBounds} from "@/lib/beauty/analytics";
import {BeautyAnalytics} from "@/components/beauty/analytics";
import {BeautyCare} from "@/components/beauty/care";
import {BeautyNativeOperations} from "@/components/beauty/native-operations-source";
import { redirect } from "next/navigation";
import { PageShell, PageHeader } from "@/components/desktop";
import { BeautyDashboard } from "@/components/beauty/dashboard";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { prisma } from "@/lib/db";
import { beautyManager } from "@/server/beauty/access";
import { beautyPageManager } from "@/server/beauty/page-access";
import { beautyDashboard } from "@/server/beauty/queries";
import { beautyPlanPurchaseIntentsEnabled } from "@/server/beauty/plan-checkout-input";
import { beautyCollectionIntentsEnabled } from "@/server/beauty/collection-intent";
import { tabs } from "@/lib/beauty/contracts";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import { toLocalDateStr, toLocalMonthStr } from "@/lib/date-utils";
import { isReadOnlyStoreTarget } from "@/lib/store-read-only";
export default async function BeautyPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;segment?:string;section?:string;
    date?: string;
    month?: string;
    calendar?: string;
    customerId?:string;bookingId?:string;
    action?:string;
    panel?:string;panelQuery?:string;perspective?:string;person?:string;area?:string;preset?:string;startDate?:string;endDate?:string;daily?:string;page?:string;dateFrom?:string;dateTo?:string;status?:string;staff?:string;summary?:string;
  }>;
}) {
  const u = await getCurrentUser();
  if (!u) redirect("/dashboard");
  const q = await searchParams;
  if(q.tab==="營運" && operationsArea(q.area)!=="ledger")return redirectOperations(legacyOperationsHref(operationsArea(q.area),q));
  if (!(await checkPermission(u.role, u.staffId, "booking.read")))
    return <PageShell><PageHeader title="美業" /><p role="alert">目前帳號尚未取得美業預約檢視權限，請聯絡店長調整。</p></PageShell>;
  if (process.env.BEAUTY_MODULE_ENABLED !== "1")
    return <PageShell><PageHeader title="美業" /><BeautyClosedNotice /></PageShell>;
  const tab = tabs.find((t) => t === q.tab) ?? "首頁",
    a = await beautyPageManager(u);
  if(tab==="人員管理")redirect("/dashboard/staff");
  if(tab==="圖片公告")redirect("/dashboard/image-announcements");
  const permission =
    tab === "顧客管理" || tab === "顧客經營"
      ? "customer.read"
      : tab === "營運"
        ? "transaction.read"
        : tab === "分析"
          ? "report.read"
          : tab === "技師管理"
            ? "staff.view"
            : tab === "收費方式"
              ? "plans.edit"
              : tab === "設定" || tab === "位置管理"
                ? "business_hours.view"
                : "booking.read";
  if (!(await checkPermission(u.role, u.staffId, permission)))
    redirect("/dashboard/beauty");
  const feature = (
    {
      顧客管理: FEATURES.CUSTOMER_MANAGEMENT,
      顧客經營: FEATURES.CUSTOMER_CARE,
      營運: FEATURES.TRANSACTION_MANAGEMENT,
      分析: FEATURES.BASIC_REPORTS,
      技師管理: FEATURES.STAFF_MANAGEMENT,
      服務項目: FEATURES.PLAN_MANAGEMENT,
      收費方式: FEATURES.PLAN_MANAGEMENT,
    } as Record<string, (typeof FEATURES)[keyof typeof FEATURES]>
  )[tab];
  if (feature) await requireStoreFeature(a.storeId, feature);
  if(tab==='首頁'&&(q.daily==='unassigned'||q.daily==='todos')){
    const authorize=async(storeId:string)=>{
      const actor=await beautyManager(q.daily==='unassigned'?'wallet.read':'booking.read');
      if(actor.storeId!==storeId)throw new Error('無權讀取其他店家');
      if(q.daily==='unassigned')await requireStoreFeature(storeId,FEATURES.PLAN_MANAGEMENT);
    };
    if(q.daily==='unassigned')return <CourseUnassignedPlans searchParams={Promise.resolve({page:q.page})} source={{authorize,load:getBeautyUnassignedPlanPage,href:beautyDailyHref,service:true}}/>;
    const view=await resolveStoreViewContextFromCookie(u);
    return <CourseTodos searchParams={Promise.resolve({page:q.page})} source={{authorize,load:getBeautyHomeTodos,href:beautyDailyHref,service:true,readOnly:!!view?.isViewMode||isReadOnlyStoreTarget(u,a.storeId)}}/>;
  }
  const date =
      q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : toLocalDateStr(),
    month =
      q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month)
        ? q.month
        : toLocalMonthStr();
  let financialDates:ReturnType<typeof courseAnalysisRange>|undefined;
  if(tab==='營運'){try{financialDates=courseAnalysisRange(q.dateFrom||q.dateTo?{startDate:q.dateFrom,endDate:q.dateTo}:q);beautyAnalysisBounds(financialDates);}catch{return <PageShell><p role="alert">請選擇有效且不超過一年的收支日期。</p></PageShell>;}}
  const [data, store, view] = await Promise.all([
    beautyDashboard(
      date,
      month,
      q.calendar === "week" || q.calendar === "month" ? q.calendar : "day",
      financialDates,
      tab==='技師管理',
      tab==='班表',
      tab==='收費方式',
    ),
    prisma.store.findUniqueOrThrow({
      where: { id: a.storeId },
      select: { id:true,name:true,slug: true },
    }),
    resolveStoreViewContextFromCookie(u),
  ]);
  const sharedSettings=tab==='設定'?await prisma.shopConfig.findUnique({where:{storeId:a.storeId},select:{address:true,shopPhone:true,mapUrl:true,lineOfficialId:true,lineOfficialUrl:true,bankName:true,bankCode:true,bankAccountNumber:true}}):null;
  const [systemPlan,usage]=tab==='設定'?await Promise.all([getCurrentStorePlan(),getStoreUsage(a.storeId)]):[null,null];
  const initialLabels=data.access.customerAccess&&["班表","顧客管理","顧客經營"].includes(tab)?await customerLabelSnapshot(data.customers.slice(0,500).map(c=>c.id)):null;
  const content = (
    <PageShell compact className="course-workspace min-w-0">
      {tab==='顧客經營'&&<CustomerGrowthNavigation active="care"/>}
      {tab!=='首頁'&&tab!=='班表'&&tab!=='顧客管理'&&tab!=='營運'&&<PageHeader compact title={tab} />}
      <BeautyDashboard
        planPurchaseRecoveryEnabled={beautyPlanPurchaseIntentsEnabled()}
        collectionRecoveryEnabled={beautyCollectionIntentsEnabled()}
        homeContent={tab==='首頁'?<BeautyHome data={data} readOnly={!!view?.isViewMode || isReadOnlyStoreTarget(u,a.storeId)}/>:undefined}
        key={`${a.storeId}:${tab}:${date}:${month}:${data.calendar}:${q.customerId??""}:${q.bookingId??""}:${q.action??""}:${q.preset??""}:${q.startDate??""}:${q.endDate??""}`}
        data={data}
        tab={tab}
        initialAppointmentId={q.bookingId}
        initialCustomerId={q.customerId}
        initialBooking={q.action==='booking'||q.action==='schedule'}
        analyticsContent={tab==='分析'?<BeautyAnalytics data={data} query={q}/>:undefined}
        careContent={tab==='顧客經營'?<BeautyCare data={data} selected={q.segment&&CARE_REASONS.includes(q.segment as CareReason)?q.segment as CareReason:null} readOnly={!!view?.isViewMode||isReadOnlyStoreTarget(u,a.storeId)}/>:undefined}
        operationsContent={tab==='營運'?<BeautyNativeOperations data={data} query={q} readOnly={!!view?.isViewMode||isReadOnlyStoreTarget(u,a.storeId)}/>:undefined}
        settingsContent={tab==='設定'?<BeautySettingsWorkspace bank={{bankName:sharedSettings?.bankName??"",bankCode:sharedSettings?.bankCode??"",bankAccountNumber:sharedSettings?.bankAccountNumber??""}} readOnly={!!view?.isViewMode||isReadOnlyStoreTarget(u,a.storeId)} data={data} publicTrialHref={resolveBookingLineEntry(store.slug)?.url??null} canPayment={await checkPermission(u.role,u.staffId,'plans.edit')} canEdit={!!data.manage.settings&&!view?.isViewMode&&!isReadOnlyStoreTarget(u,a.storeId)} initial={{section:'store',name:store.name,address:sharedSettings?.address??'',shopPhone:sharedSettings?.shopPhone??'',mapUrl:sharedSettings?.mapUrl??'',lineOfficialId:sharedSettings?.lineOfficialId??'',lineOfficialUrl:sharedSettings?.lineOfficialUrl??''}} labels={<CustomerLabelsSettings/>} subscription={<><SettingsListRow title="店家系統方案" summary={systemPlan?PRICING_PLAN_INFO[systemPlan].label:'請查看目前系統方案'} href="/dashboard/settings/plan" action="查看" expanded={false}/>{usage&&<SettingsListRow title="目前用量" summary={usage.metrics.map(m=>`${m.label} ${m.current.toLocaleString()}／${m.limit??'不限'}`).join('・')}/>}</>}/>:undefined}
        cashbookShortcut={tab==='班表'?<CashbookShortcut readOnly={!!view?.isViewMode||isReadOnlyStoreTarget(u,a.storeId)}/>:undefined}
        slug={store.slug}
        readOnly={!!view?.isViewMode || isReadOnlyStoreTarget(u, a.storeId)}
      />
      {tab==='設定'&&isCourseSettingsPanel(q.panel)&&['hours','payment','line','reminders','labels','referral','butler'].includes(q.panel)&&<CourseSettingsPanel confirmDiscard={false} panel={q.panel} workspaceHref="/dashboard/beauty">{q.panel==='reminders'?<BeautyRemindersPage searchParams={Promise.resolve(Object.fromEntries(new URLSearchParams(q.panelQuery??'')))}/>:q.panel==='hours'?<ScheduleSettingsPage searchParams={Promise.resolve(Object.fromEntries(new URLSearchParams(q.panelQuery??'')))}/>:<CourseSettingsPanelContent panel={q.panel} query={q.panelQuery}/>}</CourseSettingsPanel>}
    </PageShell>
  );
  return initialLabels?<CustomerLabelsSeed initial={initialLabels}>{content}</CustomerLabelsSeed>:content;
}
