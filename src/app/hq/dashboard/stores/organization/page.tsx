import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { getCurrentUser } from "@/lib/session";
import { listStoreOrganizationAction } from "@/server/actions/store-organization";
import { StoreOrganizationManager } from "./store-organization-manager";

export default async function StoreOrganizationPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/hq/login");

  const result = await listStoreOrganizationAction();
  const stores = result.success ? result.data : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-earth-900">店舖組織</h1>
          <p className="mt-1 text-sm text-earth-500">
            設定店舖之間的查看關係。此設定不影響營收、顧客、預約、方案或歷史資料。
          </p>
        </div>
        <Link
          href="/hq/dashboard/stores"
          className="rounded-lg border border-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
        >
          返回店舖管理
        </Link>
      </div>

      {result.success ? (
        <StoreOrganizationManager stores={stores} />
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}
    </div>
  );
}
