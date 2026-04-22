import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getBonusRules } from "@/server/queries/bonus-rule";
import { redirect, notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { BonusRuleList } from "./bonus-rule-list";
import { BonusRuleForm } from "./bonus-rule-form";
import { PresetPlaybookCards } from "./preset-playbook-cards";

export default async function BonusRulesPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }
  // 僅 ADMIN / OWNER 可管理
  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    notFound();
  }

  const activeStoreId = await getActiveStoreForRead(user);

  // ADMIN 在「全部分店」模式下無法管理獎勵項目 — 需切換到特定店
  if (!activeStoreId) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <Link href="/dashboard/growth" className="text-sm text-earth-500 hover:text-earth-700">
          ← 人才培育
        </Link>
        <h1 className="text-xl font-bold text-earth-900">獎勵項目管理</h1>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 text-center">
          <p className="text-sm text-yellow-800">
            請先在右上角切換到特定分店，才能管理該店的獎勵項目
          </p>
        </div>
      </div>
    );
  }

  const rules = await getBonusRules(activeStoreId);
  const ruleNames = rules.map((r) => r.name);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6">
      {/* 麵包屑 */}
      <Link
        href="/dashboard/growth"
        className="text-[13px] text-earth-500 hover:text-earth-700"
      >
        ← 人才培育
      </Link>

      {/* 頁首 */}
      <header>
        <h1 className="text-[22px] font-bold text-earth-900">獎勵項目管理</h1>
        <p className="mt-1 text-sm text-earth-500">
          設定集點規則 — 先從推薦玩法一鍵套用，再視需要微調細節
        </p>
      </header>

      {/* A. 推薦玩法（新手入口） */}
      <PresetPlaybookCards existingRuleNames={ruleNames} />

      {/* C. 已建立規則列表（先放列表，第二眼就看到目前啟用哪些） */}
      <section className="rounded-[20px] border-2 border-primary-200 bg-white p-5 shadow-[0_1px_0_rgb(0_0_0_/_0.02)]">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-[14px]"
            >
              📋
            </span>
            <div>
              <h2 className="text-base font-semibold text-earth-900">目前已啟用的玩法</h2>
              <p className="text-[12px] text-earth-500">這間店正在跑哪些集點規則</p>
            </div>
          </div>
          <span className="rounded-full bg-primary-600 px-2.5 py-0.5 text-[12px] font-bold text-white">
            {rules.filter((r) => r.isActive).length} / {rules.length}
          </span>
        </header>
        <BonusRuleList
          rules={rules.map((r) => ({
            id: r.id,
            name: r.name,
            points: r.points,
            description: r.description,
            isActive: r.isActive,
            startDate: r.startDate?.toISOString().slice(0, 10) ?? null,
            endDate: r.endDate?.toISOString().slice(0, 10) ?? null,
          }))}
        />
      </section>

      {/* B. 進階自訂（降權，放最下 — 需自訂時再展開） */}
      <details className="group rounded-[20px] border border-earth-200 bg-earth-50/40 px-5 py-4 open:bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-earth-800">進階自訂規則</h2>
            <p className="text-[12px] text-earth-500">
              自己定名稱、點數、期間 — 不確定就用上方預設玩法
            </p>
          </div>
          <span className="text-[12px] text-earth-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4 border-t border-earth-100 pt-4">
          <BonusRuleForm />
        </div>
      </details>
    </div>
  );
}
