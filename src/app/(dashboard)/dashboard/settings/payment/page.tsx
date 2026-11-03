import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getShopConfig } from "@/lib/shop-config";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsReturnLink as Link } from "@/components/settings/settings-navigation";
import { PageShell, PageHeader } from "@/components/desktop";
import { PaymentSettingsForm } from "./payment-form";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { isReadOnlyStoreTarget } from "@/lib/store-read-only";

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

  const [shopConfig, contact, industryModule] = await Promise.all([getShopConfig(storeId), prisma.shopConfig.findUnique({ where: { storeId }, select: { lineOfficialId: true } }), getStoreIndustryModule(storeId)]);

  return (
    <PageShell>
      <PageHeader
        title="付款設定"
        subtitle={industryModule === "beauty" ? "銀行資訊會顯示在美業「我的方案」，供顧客轉帳後送出核帳申請" : "這些資訊會顯示在前台購買頁，讓顧客知道怎麼轉帳並聯繫店長確認"}
        actions={
          <Link
            href="/dashboard/settings?section=payment"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      <PaymentSettingsForm
        key={storeId}
        storeId={storeId}
        isBeauty={industryModule === "beauty"}
        readOnly={isReadOnlyStoreTarget(user, storeId)}
        initial={{
          bankName: shopConfig.bankName,
          bankCode: shopConfig.bankCode,
          bankAccountNumber: shopConfig.bankAccountNumber,
          lineOfficialUrl: shopConfig.lineOfficialUrl,
          lineOfficialId: contact?.lineOfficialId ?? null,
        }}
      />
    </PageShell>
  );
}
