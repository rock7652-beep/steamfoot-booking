import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getShopConfig } from "@/lib/shop-config";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { PaymentSettingsForm } from "./payment-form";

export default async function PaymentSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "plans.edit"))) {
    redirect("/dashboard");
  }

  const shopConfig = await getShopConfig(user.storeId);

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
