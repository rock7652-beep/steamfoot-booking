import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { redirect } from "next/navigation";
import { ReferralShareSettingsForm } from "./referral-share-form";

export default async function ReferralShareSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "plans.edit"))) {
    redirect("/dashboard");
  }

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) redirect("/dashboard/settings");

  const [store, config] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, slug: true },
    }),
    prisma.shopConfig.findUnique({
      where: { storeId },
      select: { referralShareTemplate: true },
    }),
  ]);

  if (!store) redirect("/dashboard/settings");

  return (
    <PageShell>
      <PageHeader
        title="推薦分享文案"
        subtitle="設定顧客複製與 LINE 分享時使用的文案；推薦網址與推薦人資訊仍由系統安全產生。"
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      <ReferralShareSettingsForm
        storeName={store.name}
        storeSlug={store.slug}
        initialTemplate={config?.referralShareTemplate ?? null}
      />
    </PageShell>
  );
}
