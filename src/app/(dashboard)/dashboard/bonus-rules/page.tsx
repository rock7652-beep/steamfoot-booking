import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getBonusRules } from "@/server/queries/bonus-rule";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { BonusRuleList } from "./bonus-rule-list";
import { BonusRuleForm } from "./bonus-rule-form";

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
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/growth" className="text-sm text-earth-500 hover:text-earth-700">
            ← 人才培育
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-earth-900">獎勵項目管理</h1>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 text-center">
          <p className="text-sm text-yellow-800">
            請先在右上角切換到特定分店，才能管理該店的獎勵項目
          </p>
        </div>
      </div>
    );
  }

  const rules = await getBonusRules(activeStoreId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/growth" className="text-sm text-earth-500 hover:text-earth-700">
          ← 人才培育
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-earth-900">獎勵項目管理</h1>
          <p className="mt-1 text-sm text-earth-500">
            設定活動獎勵積分項目，啟用後會顯示在前台積分攻略及手動加分選單中
          </p>
        </div>
      </div>

      {/* 新增表單 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-earth-800">新增獎勵項目</h2>
        <BonusRuleForm />
      </div>

      {/* 現有項目列表 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-earth-800">
          所有獎勵項目（{rules.length}）
        </h2>
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
      </div>
    </div>
  );
}
