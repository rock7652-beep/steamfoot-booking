import { notFound } from "next/navigation";
import { isProduction } from "@/lib/runtime-env";
import { FeatureGate, LockedNavItem } from "@/components/feature-gate";
import { PlanPackageNotes } from "@/components/plan-package-notes";
import { FEATURES } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const metadata = { title: "加購提示介面驗收", robots: { index: false, follow: false } };
export default function Page() {
  if (isProduction()) notFound();
  return <main className="min-w-0 space-y-4 p-4">
    <h1 className="text-lg font-semibold">共用加購提示與方案說明</h1>
    <p className="text-sm">虛擬展店版資料，僅驗收呈現，不變更店家授權或交易。</p>
    {[FEATURES.INVENTORY, FEATURES.WORK_ORDERS].map(feature => <section key={feature}>
      <FeatureGate plan="ALLIANCE" feature={feature} enabled={false}><p>已開通</p></FeatureGate>
      <LockedNavItem label={feature === FEATURES.INVENTORY ? "進銷存管理" : "工單管理"} icon={<span aria-hidden="true">＋</span>} collapsed={false} targetPlan="ALLIANCE" feature={feature}/>
    </section>)}
    <PlanPackageNotes />
  </main>;
}
