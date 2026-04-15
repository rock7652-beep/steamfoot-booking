import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listStoresAction } from "@/server/actions/store-onboarding";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "營運中", color: "bg-green-100 text-green-700" },
  TRIAL: { label: "試用", color: "bg-amber-100 text-amber-700" },
  PAYMENT_PENDING: { label: "待付款", color: "bg-yellow-100 text-yellow-700" },
  PAST_DUE: { label: "逾期", color: "bg-red-100 text-red-700" },
  CANCELLED: { label: "已取消", color: "bg-gray-100 text-gray-500" },
  EXPIRED: { label: "已過期", color: "bg-gray-100 text-gray-500" },
};

export default async function StoresPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/hq/login");

  const result = await listStoresAction();
  const stores = result.success ? result.data : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-earth-900">店舖管理</h1>
          <p className="mt-1 text-sm text-earth-500">管理所有分店，建立新店或查看交付狀態</p>
        </div>
        <Link
          href="/hq/dashboard/stores/new"
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + 建立新店
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-earth-200 bg-earth-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-earth-600">店名</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">Slug</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">方案</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">狀態</th>
              <th className="px-4 py-3 text-left font-medium text-earth-600">類型</th>
              <th className="px-4 py-3 text-right font-medium text-earth-600">人員</th>
              <th className="px-4 py-3 text-right font-medium text-earth-600">顧客</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-earth-100">
            {stores.map((store) => {
              const status = STATUS_LABELS[store.planStatus] ?? { label: store.planStatus, color: "bg-gray-100 text-gray-600" };
              return (
                <tr key={store.id} className="hover:bg-earth-50/50">
                  <td className="px-4 py-3 font-medium text-earth-900">{store.name}</td>
                  <td className="px-4 py-3 text-earth-500 font-mono text-xs">{store.slug}</td>
                  <td className="px-4 py-3 text-earth-600">{store.plan}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {store.isDemo ? (
                      <span className="text-xs text-amber-600">Demo</span>
                    ) : (
                      <span className="text-xs text-green-600">正式</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-earth-600">{store.staffCount}</td>
                  <td className="px-4 py-3 text-right text-earth-600">{store.customerCount}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/hq/dashboard/stores/${store.id}`}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      詳情
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {stores.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-earth-400">尚無店舖</div>
        )}
      </div>
    </div>
  );
}
