import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { isReadOnlyStoreTarget } from "@/lib/store-read-only";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { operationsHref, type OperationsArea, type OperationsQuery } from "@/lib/operations-navigation";
import { OperationsTabs } from "./operations-tabs";
import CashbookWorkspace from "../../cashbook/workspace";
import MonthlyWorkspace from "../../service-fee-calculator/workspace";
import StoreRevenueWorkspace from "../../store-revenue/workspace";
import DataExportWorkspace from "../../data-export/workspace";
import { OperationsIncome } from "./operations-income";
import { BeautyMonthly } from "@/components/beauty/operations-monthly";
import ReconciliationWorkspace from "../../reconciliation/workspace";
import { toLocalMonthStr } from "@/lib/date-utils";

/** Dispatch before ledger authorization and load only the selected workspace. */
export async function OperationsAreaContent({ area, query }: { area: Exclude<OperationsArea,"ledger">; query: OperationsQuery }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const [active, view] = await Promise.all([getActiveStoreForRead(user), resolveStoreViewContextFromCookie(user)]);
  const storeId = storeIdForViewContext(active, view);
  if (!storeId) {
    if(area!=="exports"||getEffectiveActorRole(user)!=="ADMIN")return <PageShell><PageHeader title="營運"/><p>請先選擇店家。</p></PageShell>;
    const [report,customerExport,reportExport]=await Promise.all((["report.read","customer.export","report.export"] as const).map(p=>checkPermission(user.role,user.staffId,p)));
    const data=query.reportView==="data"||!report;
    return <PageShell compact><PageHeader compact title="營運"/><OperationsTabs active="exports" query={query}/><nav className="flex flex-wrap gap-2" aria-label="報表匯出內容">
      {report&&<Link className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm" href={`${operationsHref("exports",query)}&reportView=overview`}>收入總覽與報表</Link>}
      {(customerExport||reportExport)&&<Link className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm" href={`${operationsHref("exports",query)}&reportView=data`}>資料匯出</Link>}
    </nav>{data?(customerExport||reportExport?<DataExportWorkspace query={query}/>:<p role="alert">目前沒有匯出權限。</p>):<StoreRevenueWorkspace searchParams={Promise.resolve(query)}/>}</PageShell>;
  }
  const industry = await getStoreIndustryModule(storeId);
  const readOnly = !!view?.isViewMode || isReadOnlyStoreTarget(user, storeId);
  const [report, customerExport, reportExport, cashbook, ledger] = await Promise.all(
    (["report.read", "customer.export", "report.export", "cashbook.read", "transaction.read"] as const).map(p => checkPermission(user.role,user.staffId,p)),
  );
  const permitted = area === "income" ? report && (industry!=="beauty" || ledger) : area === "cashbook" ? cashbook || (report && query.checks==="1") : area === "exports" ? report || customerExport || reportExport : report;
  const feature = area === "cashbook" ? (cashbook?FEATURES.CASHBOOK:FEATURES.RECONCILIATION) : area === "monthly" ? FEATURES.SERVICE_FEE_CALCULATOR : area === "income" ? FEATURES.BASIC_REPORTS : null;
  let content;
  if (!permitted) content = <p role="alert">目前沒有此項營運功能的檢視權限。</p>;
  else if (feature && !await hasStoreFeature(storeId,feature)) content = <p role="status">此功能尚未開通。</p>;
  else if (area === "income") content = <OperationsIncome storeId={storeId} industry={industry} query={query}/>;
  else if (area === "cashbook") {
    const type = ["INCOME","EXPENSE","WITHDRAW","ADJUSTMENT"].includes(query.type??"") ? query.type as "INCOME"|"EXPENSE"|"WITHDRAW"|"ADJUSTMENT" : undefined;
    content = <>{!cashbook&&readOnly&&<p>目前為唯讀檢視，不提供帳務檢查。</p>}{cashbook&&<CashbookWorkspace searchParams={Promise.resolve({...query,type})}/>}
      {report && !readOnly && <details open={query.checks==="1"} className="rounded-lg border border-earth-200 bg-white p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">進階帳務檢查</summary>
        <p className="py-2 text-sm text-earth-600">檢查收退款連動、報表與額度等資料一致性；每日點錢請使用現金抽屜。</p>
        {query.checks==="1"||query.runId?<ReconciliationWorkspace searchParams={Promise.resolve({runId:query.runId})}/>:<Link className="inline-flex min-h-11 items-center text-sm text-primary-700 underline" href={`${operationsHref("cashbook",query)}&checks=1`}>查看帳務檢查紀錄</Link>}
      </details>}</>;
  } else if (area === "monthly") {
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month??"") ? query.month! : toLocalMonthStr();
    content = industry === "beauty" ? <BeautyMonthly storeId={storeId} month={month} readOnly={readOnly}/> : <MonthlyWorkspace searchParams={Promise.resolve(query)}/>;
  } else {
    const data = query.reportView === "data" || !report;
    content = <><nav aria-label="報表匯出內容" className="flex flex-wrap gap-2">
      {report && <Link aria-current={!data?"page":undefined} className="flex min-h-11 items-center rounded-lg border px-3 text-sm" href={`${operationsHref("exports",query)}&reportView=overview`}>收入總覽與報表</Link>}
      {(customerExport || reportExport) && !readOnly && <Link aria-current={data?"page":undefined} className="flex min-h-11 items-center rounded-lg border px-3 text-sm" href={`${operationsHref("exports",query)}&reportView=data`}>資料匯出</Link>}
    </nav>{data ? readOnly ? <p>目前為唯讀檢視，無法匯出資料。</p> : customerExport || reportExport ? <DataExportWorkspace query={query}/> : <p role="alert">目前沒有資料匯出權限。</p> : <StoreRevenueWorkspace searchParams={Promise.resolve(query)}/>}</>;
  }
  return <PageShell compact><PageHeader compact title="營運"/><OperationsTabs active={area} query={query} beautyLedger={industry==="beauty"}/>{content}</PageShell>;
}
