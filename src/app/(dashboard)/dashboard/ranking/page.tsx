import { getCurrentUser } from "@/lib/session";
import { getShopPlan } from "@/lib/shop-config";
import { redirect, notFound } from "next/navigation";
import { hasFeature, FEATURES } from "@/lib/shop-plan";
import { FeatureGate } from "@/components/feature-gate";

export default async function RankingPage() {
  /* MVP: 排行榜暫時隱藏 */
  redirect("/dashboard");

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const plan = await getShopPlan();

  return (
    <FeatureGate plan={plan} feature={FEATURES.RANKING}>
      <div className="space-y-5">
        <h1 className="text-lg font-bold text-earth-900">排行榜</h1>

        {/* Tabs */}
        <div className="flex gap-2">
          <span className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white">
            店長排名
          </span>
          <span className="rounded-lg border border-earth-200 px-3 py-1.5 text-sm text-earth-600">
            分店排名
          </span>
        </div>

        {/* Ranking Table Skeleton */}
        <div className="rounded-xl border border-earth-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-earth-100 bg-earth-50">
                <th className="px-5 py-3 text-left font-medium text-earth-600">排名</th>
                <th className="px-5 py-3 text-left font-medium text-earth-600">名稱</th>
                <th className="px-5 py-3 text-right font-medium text-earth-600">預約數</th>
                <th className="px-5 py-3 text-right font-medium text-earth-600">完成數</th>
                <th className="px-5 py-3 text-right font-medium text-earth-600">新客數</th>
                <th className="px-5 py-3 text-right font-medium text-earth-600">營收</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-earth-400">
                  排行榜數據將在多店上線後啟用
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </FeatureGate>
  );
}
