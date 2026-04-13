import { getCurrentUser } from "@/lib/session";
import { getShopPlan } from "@/lib/shop-config";
import { redirect, notFound } from "next/navigation";
import { FEATURES } from "@/lib/shop-plan";
import { FeatureGate } from "@/components/feature-gate";

export default async function TrainingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ADMIN") {
    notFound();
  }

  const plan = await getShopPlan();

  return (
    <FeatureGate plan={plan} feature={FEATURES.TRAINING_CONTENT}>
      <div className="space-y-5">
        <h1 className="text-lg font-bold text-earth-900">學習中心</h1>
        <p className="text-sm text-earth-500">店務 SOP、營運技巧、系統教學</p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "新手入門", desc: "系統基本操作指南", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
            { title: "預約管理技巧", desc: "如何減少未到率", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
            { title: "顧客經營", desc: "提升回購率的方法", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
            { title: "報表解讀", desc: "看懂營運數據", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2" },
            { title: "服務流程 SOP", desc: "標準服務作業程序", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
            { title: "更多內容", desc: "持續更新中", icon: "M12 6v6m0 0v6m0-6h6m-6 0H6" },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-earth-200 bg-white p-5 transition hover:shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
                <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-earth-800">{item.title}</h3>
              <p className="mt-1 text-xs text-earth-500">{item.desc}</p>
              <span className="mt-3 inline-block text-xs text-primary-600">即將推出</span>
            </div>
          ))}
        </div>
      </div>
    </FeatureGate>
  );
}
