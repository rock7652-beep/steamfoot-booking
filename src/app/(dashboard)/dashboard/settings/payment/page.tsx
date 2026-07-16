import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getShopConfig } from "@/lib/shop-config";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { PaymentSettingsForm } from "./payment-form";
import { getActiveStoreForRead } from "@/lib/store";

export default async function PaymentSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "plans.edit"))) {
    redirect("/dashboard");
  }

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) {
    return (
      <PageShell>
        <PageHeader title="付款設定" subtitle="請先從右上角切換到特定店舖" />
        <div className="rounded-xl border border-earth-200 bg-white p-8 text-center">
          <p className="text-sm text-earth-500">請先切換到特定店舖，才能查看或儲存付款設定。</p>
        </div>
      </PageShell>
    );
  }

  const shopConfig = await getShopConfig(storeId);

  return (
    <PageShell>
      <PageHeader
        title="付款設定"
        subtitle="這些資訊會顯示在前台購買頁，讓顧客知道怎麼轉帳並聯繫店長確認"
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      <PaymentSettingsForm
        initial={{
          bankName: shopConfig.bankName,
          bankCode: shopConfig.bankCode,
          bankAccountNumber: shopConfig.bankAccountNumber,
          lineOfficialUrl: shopConfig.lineOfficialUrl,
        }}
      />
    </PageShell>
  );
}
