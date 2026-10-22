import {BeautyStoreSettings} from '@/components/beauty/store-settings';
import {CustomerLabelsSettings} from '@/components/customer-labels';
import {getCurrentStorePlan} from '@/lib/store-plan';
import {SettingsListRow} from '@/components/settings';
import {CARE_REASONS,type CareReason} from '@/lib/customer-care-lifecycle';
import ScheduleSettingsPage from "../settings/hours/page";
import PaymentSettingsPage from "../settings/payment/page";
import LineOfficialAccountsPage from "../settings/line-official-accounts/page";
import {SettingsPanel} from "@/components/settings";
import {courseAnalysisRange} from "@/lib/course-analytics";
import {beautyAnalysisBounds} from "@/lib/beauty/analytics";
import {BeautyAnalytics} from "@/components/beauty/analytics";
import {BeautyCare} from "@/components/beauty/care";
import {RevenueTabs} from "../revenue/_components/revenue-tabs";
import { redirect } from "next/navigation";
import { PageShell, PageHeader } from "@/components/desktop";
import { BeautyDashboard } from "@/components/beauty/dashboard";
import { BeautyClosedNotice } from "@/components/beauty/closed-notice";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { prisma } from "@/lib/db";
import { beautyManager } from "@/server/beauty/access";
import { beautyDashboard } from "@/server/beauty/queries";
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
    customerId?:string;
    action?:string;
    panel?:string;area?:string;preset?:string;startDate?:string;endDate?:string;
  }>;
}) {
  const u = await getCurrentUser();
  if (!u || !(await checkPermission(u.role, u.staffId, "booking.read")))
    redirect("/dashboard");
  if (process.env.BEAUTY_MODULE_ENABLED !== "1")
    return <PageShell><PageHeader title="美業" /><BeautyClosedNotice /></PageShell>;
  const q = await searchParams,
    tab = tabs.find((t) => t === q.tab) ?? "首頁",
    a = await beautyManager("booking.read");
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
  const date =
      q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : toLocalDateStr(),
    month =
      q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month)
        ? q.month
        : toLocalMonthStr();
  let financialDates:ReturnType<typeof courseAnalysisRange>|undefined;
  if(tab==='營運'){try{financialDates=courseAnalysisRange(q);beautyAnalysisBounds(financialDates);}catch{return <PageShell><p role="alert">請選擇有效且不超過一年的收支日期。</p></PageShell>;}}
  const [data, store, view] = await Promise.all([
    beautyDashboard(
      date,
      month,
      q.calendar === "week" || q.calendar === "month" ? q.calendar : "day",
      financialDates,
    ),
    prisma.store.findUniqueOrThrow({
      where: { id: a.storeId },
      select: { id:true,name:true,slug: true },
    }),
    resolveStoreViewContextFromCookie(u),
  ]);
  const sharedSettings=tab==='設定'?await prisma.shopConfig.findUnique({where:{storeId:a.storeId},select:{address:true,shopPhone:true,mapUrl:true,lineOfficialId:true,lineOfficialUrl:true}}):null;
  const systemPlan=tab==='設定'?await getCurrentStorePlan():null;
  return (
    <PageShell compact className="course-workspace min-w-0">
      <PageHeader compact title={tab} />
      <BeautyDashboard
        key={`${a.storeId}:${tab}:${date}:${month}:${data.calendar}:${q.customerId??""}:${q.action??""}:${q.preset??""}:${q.startDate??""}:${q.endDate??""}`}
        data={data}
        tab={tab}
        initialCustomerId={q.customerId}
        initialBooking={q.action==='booking'}
        analyticsContent={tab==='分析'?<BeautyAnalytics data={data} query={q}/>:undefined}
        careContent={tab==='顧客經營'?<BeautyCare data={data} selected={q.segment&&CARE_REASONS.includes(q.segment as CareReason)?q.segment as CareReason:null} readOnly={!!view?.isViewMode||isReadOnlyStoreTarget(u,a.storeId)}/>:undefined}
        operationsNavigation={tab==='營運'?<RevenueTabs readOnly={!!view?.isViewMode||isReadOnlyStoreTarget(u,a.storeId)}/>:undefined}
        settingsStoreContent={tab==='設定'?<BeautyStoreSettings storeId={a.storeId} canEdit={!!data.manage.settings&&!view?.isViewMode&&!isReadOnlyStoreTarget(u,a.storeId)} initial={{section:'store',name:store.name,address:sharedSettings?.address??'',shopPhone:sharedSettings?.shopPhone??'',mapUrl:sharedSettings?.mapUrl??'',lineOfficialId:sharedSettings?.lineOfficialId??'',lineOfficialUrl:sharedSettings?.lineOfficialUrl??''}}/>:undefined}
        settingsLabelsContent={tab==='設定'?<CustomerLabelsSettings/>:undefined}
        settingsSubscriptionContent={tab==='設定'?<SettingsListRow title="店家系統方案與用量" summary={String(systemPlan??'請查看目前系統方案')} href="/dashboard/settings/plan" action="查看" expanded={false}/>:undefined}
        slug={store.slug}
        readOnly={!!view?.isViewMode || isReadOnlyStoreTarget(u, a.storeId)}
      />
      {tab==='設定'&&['hours','payment','line'].includes(q.panel??'')&&<SettingsPanel title={q.panel==='hours'?'營業時間與公休':q.panel==='payment'?'銀行與收款資料':'LINE 官方帳號'} sourceHref={`/dashboard/beauty?tab=設定&section=${q.section??'store'}`}>{q.panel==='hours'?<ScheduleSettingsPage/>:q.panel==='payment'?<PaymentSettingsPage/>:(u.role==='OWNER'||u.role==='ADMIN')?<LineOfficialAccountsPage/>:<p role="alert">此設定僅供店主查看。</p>}</SettingsPanel>}
    </PageShell>
  );
}
