import {getActiveStoreForRead} from "@/lib/store";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {getCurrentLineOfficialAccountStatus} from "@/server/actions/line-official-accounts";
import { notFound } from "next/navigation";
import { getHqStoreViewContext } from "@/lib/hq-store-view-context";
import { PageHeader, PageShell } from "@/components/desktop";
import { getCurrentUser } from "@/lib/session";
import { getAllLineOfficialAccountStatuses } from "@/server/actions/line-official-accounts";
import { LineOfficialAccountsCard } from "./line-official-accounts-card";

export default async function LineOfficialAccountsPage() {
  const user = await getCurrentUser();
  if(!user)notFound();
  const storeId=await getActiveStoreForRead(user);
  if(storeId&&await getStoreIndustryModule(storeId)==="beauty"){
    const status=await getCurrentLineOfficialAccountStatus();
    return <PageShell><PageHeader title="LINE 訊息串接" subtitle="查看目前店家的官方帳號連線；官方 LINE 連結在店家資料設定。"/><LineOfficialAccountsCard scope="current" initialStatuses={[status]}/></PageShell>;
  }
  if (getHqStoreViewContext(user) || (user.role !== "OWNER" && user.role !== "ADMIN")) notFound();

  const statuses = await getAllLineOfficialAccountStatuses();

  return (
    <PageShell className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-4">
      <PageHeader
        title="LINE 官方帳號"
        subtitle="查看各分店是否正常；需要時再重新驗證"
      />
      <LineOfficialAccountsCard initialStatuses={statuses} />
    </PageShell>
  );
}
