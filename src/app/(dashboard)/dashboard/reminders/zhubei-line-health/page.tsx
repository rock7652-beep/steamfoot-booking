import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { prisma } from "@/lib/db";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { ZhubeiLineHealthCard } from "../zhubei-line-health-card";

export default async function ZhubeiLineHealthPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  if (!activeStoreId) {
    redirect("/dashboard/reminders");
  }

  const [store, canManageLineHealth] = await Promise.all([
    prisma.store.findUnique({ where: { id: activeStoreId }, select: { slug: true } }),
    checkPermission(user.role, user.staffId, "business_hours.manage"),
  ]);

  if (store?.slug !== "zhubei" || !canManageLineHealth) {
    redirect("/dashboard/reminders");
  }

  return (
    <PageShell>
      <PageHeader
        title="竹北 LINE OA 身分檢查"
        subtitle="安全讀取 Production Bot Info，不發送訊息、不接觸顧客資料"
        actions={
          <Link
            href="/dashboard/reminders"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回提醒管理
          </Link>
        }
      />
      <ZhubeiLineHealthCard />
    </PageShell>
  );
}
