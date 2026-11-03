import {musicDataScope} from "@/server/services/music-data-scope";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { toLocalDateStr, toLocalMonthStr, monthRange } from "@/lib/date-utils";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { FEATURES as FF } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import {
  DATA_EXPORT_LOCKED_MESSAGE,
  DATA_EXPORT_SELECT_STORE_MESSAGE,
  hasDataExportFeature,
} from "@/lib/data-export-gate";
import { UpgradeNoticePage } from "@/components/upgrade-notice";
import { prisma } from "@/lib/db";
import { getStoreFilter } from "@/lib/manager-visibility";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import { RevenueReportClient } from "@/components/reports/RevenueReportClient";

export default async function StoreRevenuePage({searchParams}: {searchParams:Promise<{dataScope?:string;dateFrom?:string;dateTo?:string}>}) {
  const query=await searchParams;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "report.read"))) {
    redirect("/dashboard");
  }

  const [activeStoreId, canReportExport] = await Promise.all([
    getActiveStoreForRead(user),
    checkPermission(user.role, user.staffId, "report.export"),
  ]);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const reportsUser = userForViewContext(user, storeViewContext);
  const canExportData = !isViewMode && (await hasDataExportFeature(reportsStoreId).catch(() => false));
  const dataExportLockedMessage = reportsStoreId
    ? DATA_EXPORT_LOCKED_MESSAGE
    : DATA_EXPORT_SELECT_STORE_MESSAGE;

  const gateStoreId = reportsStoreId ?? activeStoreId;
  if (gateStoreId && !(await hasStoreFeature(gateStoreId, FF.BASIC_REPORTS))) {
    return (
      <UpgradeNoticePage
        title="分析尚未開通"
        description="分析基本版加購原價 NT$500／月，專業版與展店版內含；請聯絡總部確認與開通。"
      />
    );
  }

  const reportIndustry=reportsStoreId?await getStoreIndustryModule(reportsStoreId):null;
  if (reportsStoreId && (reportIndustry === "course"||reportIndustry==="beauty")) {
    const music = !!(await prisma.storeFeatureEntitlement.findFirst({where:{storeId:reportsStoreId,featureKey:"business.music",status:"ENABLED"},select:{id:true}}));
    const store = await prisma.store.findUniqueOrThrow({ where: { id: reportsStoreId }, select: { id: true, name: true } });
    const month = toLocalMonthStr();
    return <div className="space-y-4"><h1 className="admin-page-title">{reportIndustry==="beauty"?"服務收入總覽":"課程收入總覽"}</h1>
      <details className="text-sm text-earth-600"><summary className="min-h-11 cursor-pointer py-2">統計方式與日期說明</summary><p>方案依核帳日、體驗依收款日；退款與體驗作廢／更正沖銷依發生日另列，淨收入為兩者差額。收款紀錄數包含更正前原單，付款顧客數去重，不是上課人次。實付快照不隨改價更動，現金帳連動不重複加計；手動收支請查看現金帳。</p></details>
      <RevenueReportClient key={query.dataScope??"operational"} dataScope={musicDataScope(reportsStoreId,query.dataScope)??undefined} canReadDetails={reportIndustry!=="beauty"||(await checkPermission(user.role,user.staffId,"transaction.read")&&await hasStoreFeature(reportsStoreId,FF.TRANSACTION_MANAGEMENT))} serviceMode={reportIndustry==="beauty"} courseMode musicMode={music} mode="store" stores={[store]} coaches={[]} isAdmin={false} isViewMode={isViewMode} canExportData={canExportData && canReportExport} dataExportLockedMessage={dataExportLockedMessage} defaultStartDate={query.dateFrom??month+"-01"} defaultEndDate={query.dateTo??toLocalDateStr(monthRange(month).end)} />
    </div>;
  }

  const admin = getEffectiveActorRole(user) === "ADMIN";
  const storeFilter = getStoreFilter(reportsUser, reportsStoreId);

  // Load store list + coach list for filters
  const [stores, staffList] = await Promise.all([
    prisma.store.findMany({
      ...(admin ? {} : { where: { id: reportsStoreId ?? user.storeId! } }),
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.staff.findMany({
      where: { ...storeFilter, status: "ACTIVE" },
      select: { id: true, displayName: true, user: { select: { role: true } } },
      orderBy: { displayName: "asc" },
    }),
  ]);

  const coaches = staffList.map((s) => ({
    id: s.id,
    name: s.displayName,
    role: s.user.role,
  }));

  // Default: this month
  const reportMonth=toLocalMonthStr();
  const defaultStart=reportMonth+"-01";
  const defaultEnd=toLocalDateStr(monthRange(reportMonth).end);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="admin-page-title">店營收報表</h1>

        </div>
      </div>

      <RevenueReportClient
        steamfootMode={reportIndustry==="steamfoot"}
        mode="store"
        stores={stores}
        coaches={coaches}
        isAdmin={admin}
        isViewMode={isViewMode}
        canExportData={canExportData && canReportExport}
        dataExportLockedMessage={dataExportLockedMessage}
        defaultStartDate={query.dateFrom??defaultStart}
        defaultEndDate={query.dateTo??defaultEnd}
      />
    </div>
  );
}
