import { notFound } from "next/navigation";
import { requireDashboardCoreFeature } from "@/lib/dashboard-core-feature";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { customerMessageAccess } from "@/server/services/customer-message-access";
import { customerMessageOptions,customerMessageSearch,customerMessageHistory } from "@/server/services/customer-messages";
import { PageHeader,PageShell } from "@/components/desktop";
import {DashboardLink} from "@/components/dashboard-link";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {customerMessageSelection} from "@/server/services/customer-messages";
import { CustomerMessageComposer } from "./composer";
export const maxDuration=300;
export default async function CustomerMessagesPage({searchParams}:{searchParams:Promise<{view?:string;customerId?:string;selection?:string}>}) {
  await requireDashboardCoreFeature("customer_management");
  const user=await getCurrentUser();
  if(!user || !await checkPermission(user.role,user.staffId,"customer.message.send") || !await checkPermission(user.role,user.staffId,"customer.read"))notFound();
  const storeId=await getActiveStoreForRead(user);
  if(!storeId)notFound();
  await customerMessageAccess(storeId);
  const params=await searchParams,historyOnly=params.view==="history";
  const industryModule=await getStoreIndustryModule(storeId);
  const back=industryModule==="course"?"/dashboard/courses?view=customers":industryModule==="beauty"?"/dashboard/beauty?tab=顧客管理":"/dashboard/customers";
  const initialSelected=!historyOnly&&params.customerId?await customerMessageSelection(storeId,[params.customerId]):[];
  const [options,initial,history]=await Promise.all([customerMessageOptions(storeId),historyOnly?Promise.resolve({rows:[],total:0,page:1}):customerMessageSearch(storeId,{}),customerMessageHistory(storeId)]);
  return <PageShell><PageHeader title={historyOnly?"發送紀錄":"發送訊息"} subtitle={historyOnly?"查看本店 LINE 訊息的處理結果":"選顧客、寫內容，確認後由本店 LINE 發送"} actions={<><DashboardLink href={back} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 text-sm">返回顧客管理</DashboardLink><DashboardLink href={historyOnly?"/dashboard/customers/messages":"/dashboard/customers/messages?view=history"} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-earth-200 px-3 text-sm">{historyOnly?"發送訊息":"發送紀錄"}</DashboardLink></>}/><CustomerMessageComposer key={`${user.id}:${storeId}:${historyOnly}:${params.customerId??params.selection??""}`} options={options} initial={initial} initialHistory={history} initialSelected={initialSelected} selectionToken={params.selection} historyOnly={historyOnly}/></PageShell>;
}
