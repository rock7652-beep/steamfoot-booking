import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getShopConfig } from "@/lib/shop-config";
import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PaymentSettingsForm } from "./payment-form";

export default async function PaymentSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "plans.edit"))) {
    redirect("/dashboard");
  }

  const shopConfig = await getShopConfig(user.storeId);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings" className="text-sm text-earth-500 hover:text-earth-700">
          ← 設定
        </Link>
        <h1 className="text-xl font-bold text-earth-900">付款設定</h1>
      </div>

      <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
        <p className="mb-6 text-sm text-earth-500">
          這些資訊會顯示在前台購買頁，讓顧客知道怎麼轉帳、怎麼聯繫店長確認。
        </p>

        <PaymentSettingsForm
          initial={{
            bankName: shopConfig.bankName,
            bankCode: shopConfig.bankCode,
            bankAccountNumber: shopConfig.bankAccountNumber,
            lineOfficialUrl: shopConfig.lineOfficialUrl,
          }}
        />
      </div>
    </div>
  );
}
