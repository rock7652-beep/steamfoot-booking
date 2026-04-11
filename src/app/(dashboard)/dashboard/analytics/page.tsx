import { getCurrentUser } from "@/lib/session";
import { getShopPlan } from "@/lib/shop-config";
import { redirect, notFound } from "next/navigation";
import { hasFeature, FEATURES } from "@/lib/shop-plan";
import { FeatureGate } from "@/components/feature-gate";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") notFound();

  const plan = await getShopPlan();

  return (
    <FeatureGate plan={plan} feature={FEATURES.CROSS_BRANCH_ANALYTICS}>
      <div className="space-y-5">
        <h1 className="text-lg font-bold text-earth-900">聯盟數據</h1>

        {/* KPI Overview */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "本月預約數", value: "—", sub: "筆" },
            { label: "本月完成數", value: "—", sub: "筆" },
            { label: "新客數", value: "—", sub: "位" },
            { label: "回訪數", value: "—", sub: "位" },
            { label: "平均客單價", value: "—", sub: "元" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl bg-white p-4 shadow-sm border border-earth-100">
              <p className="text-[11px] text-earth-500">{kpi.label}</p>
              <p className="mt-1 text-2xl font-bold text-earth-800">
                {kpi.value}
                <span className="ml-1 text-xs font-normal text-earth-400">{kpi.sub}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Placeholder Charts */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-earth-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-earth-800">到店率趨勢</h3>
            <div className="mt-4 flex h-40 items-center justify-center rounded-lg bg-earth-50 text-sm text-earth-400">
              圖表開發中
            </div>
          </div>
          <div className="rounded-xl border border-earth-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-earth-800">回購率分析</h3>
            <div className="mt-4 flex h-40 items-center justify-center rounded-lg bg-earth-50 text-sm text-earth-400">
              圖表開發中
            </div>
          </div>
          <div className="rounded-xl border border-earth-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-earth-800">客單價分布</h3>
            <div className="mt-4 flex h-40 items-center justify-center rounded-lg bg-earth-50 text-sm text-earth-400">
              圖表開發中
            </div>
          </div>
          <div className="rounded-xl border border-earth-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-earth-800">活躍度 / 流失客戶</h3>
            <div className="mt-4 flex h-40 items-center justify-center rounded-lg bg-earth-50 text-sm text-earth-400">
              圖表開發中
            </div>
          </div>
        </div>
      </div>
    </FeatureGate>
  );
}
