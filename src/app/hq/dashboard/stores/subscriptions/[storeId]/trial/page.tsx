import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { toLocalDateStr } from "@/lib/date-utils";
import { PageShell, PageHeader } from "@/components/desktop";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { TrialForm } from "./trial-form";

/**
 * /hq/dashboard/stores/subscriptions/[storeId]/trial — HQ 建立體驗（TRIAL，MVP）
 *
 * 店家建立 ≠ 體驗開始；HQ 決定開始日 + 體驗天數，系統自動算到期日。
 * 僅 HQ ADMIN 可進入（店長不可建立 Trial）。轉正式方案走既有「編輯訂閱」。
 */
export default async function CreateTrialPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/hq/login");

  const { storeId } = await params;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, slug: true, plan: true },
  });
  if (!store) redirect("/hq/dashboard/stores/subscriptions");

  return (
    <PageShell className="mx-auto flex max-w-[640px] flex-col gap-4 px-5 py-4">
      <PageHeader
        title={`建立體驗 · ${store.name}`}
        subtitle={`${store.slug}　設定開始日與體驗天數，系統自動算到期日`}
        actions={
          <Link
            href="/hq/dashboard/stores/subscriptions"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回列表
          </Link>
        }
      />
      <TrialForm storeId={store.id} defaultStart={toLocalDateStr()} />
    </PageShell>
  );
}
