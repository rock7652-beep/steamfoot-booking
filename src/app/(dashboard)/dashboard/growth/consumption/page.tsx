import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { AppError } from "@/lib/app-error";
import { hasDataExportFeature } from "@/lib/data-export-gate";
import { PageHeader, PageShell } from "@/components/desktop";
import { consumptionMetrics, parseConsumptionFilters, type ConsumptionParams } from "@/lib/customer-consumption";
import { getCustomerConsumption, getCustomerConsumptionAccess, getCustomerConsumptionOptions } from "@/server/queries/customer-consumption";
import { ConsumptionFiltersForm } from "./consumption-filters";
import { ConsumptionResults } from "./consumption-results";

export const dynamic = "force-dynamic";

export default async function CustomerConsumptionPage({ searchParams }: { searchParams: Promise<ConsumptionParams> }) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) redirect("/dashboard");
  const params = await searchParams;
  let access;
  try { access = await getCustomerConsumptionAccess(false); }
  catch (error) {
    if (!(error instanceof AppError)) throw error;
    return <PageShell compact><PageHeader title="期間消耗統計" /><p role="status" className="p-4 text-earth-700">{error.message}</p></PageShell>;
  }
  const options = await getCustomerConsumptionOptions(access);
  const [exportPermission, exportFeature] = await Promise.all([
    checkPermission(user.role, user.staffId, "customer.export"), hasDataExportFeature(access.storeId),
  ]);
  let data, errorMessage;
  try { data = await getCustomerConsumption(params); }
  catch (error) {
    if (!(error instanceof AppError) || error.code !== "VALIDATION") throw error;
    errorMessage = error.message;
  }
  const filters = data?.filters ?? parseConsumptionFilters({});
  const metrics = data?.metrics ?? consumptionMetrics(options);
  return <PageShell compact>
    <PageHeader compact title="期間消耗統計" subtitle="依期間與收費方式找出顧客名單。" />
    <ConsumptionFiltersForm key={JSON.stringify(params)} params={params} filters={filters} options={options} metrics={metrics} error={errorMessage} />
    <p className="text-sm leading-6 text-earth-600">有扣堂、扣格、扣點或服務扣款即納入；同一筆服務只計一次。購買方案不計消耗次數。{filters.includeAbsent ? "包含曠課／請假扣除。" : "不包含曠課／請假扣除。"}</p>
    {data && <ConsumptionResults {...data} courseMode={data.module === "course"} canExport={exportPermission && exportFeature} />}
    <details className="rounded-lg border border-earth-200 px-3 text-sm text-earth-600">
      <summary className="flex min-h-11 cursor-pointer items-center">統計口徑與餘額說明</summary>
      <div className="space-y-2 pb-3 leading-6">
        <p>服務消耗依服務日期歸屬；實付依收款日期計算、扣除所選期間的退款，取消或作廢的收款不納入。消耗金額與實付金額可能對應同一筆服務，請勿相加。</p>
        <p>包含期間內零消耗的顧客。指定收費方式時，只列有該方式方案或期間紀錄的顧客，並只統計該方式；不同收費方式的每點／每格價值可能不同，建議指定後比較。</p>
        <p>目前方案餘額為查詢當下的剩餘額度，非期間末餘額，亦尚未扣除預約占用。共卡餘額不可跨顧客加總。未個別建檔的同行者不會依姓名推定歸戶；無服務日期的紙本補登不列入期間服務消耗。</p>
      </div>
    </details>
  </PageShell>;
}
