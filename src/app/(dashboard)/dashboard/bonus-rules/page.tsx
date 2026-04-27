import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getBonusRules } from "@/server/queries/bonus-rule";
import { redirect, notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { BonusRulesManager } from "./_components/bonus-rules-manager";
import type { BonusRuleRow } from "./_components/bonus-rule-drawer";

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
      <PageShell>
        <PageHeader
          title="獎勵項目管理"
          subtitle="設定分享、推薦、來店等點數規則"
          actions={
            <Link
              href="/dashboard/growth"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 成長系統
            </Link>
          }
        />
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-4 text-sm text-yellow-800">
          請先在右上角切換到特定分店，才能管理該店的獎勵項目
        </div>
      </PageShell>
    );
  }

  const rules = await getBonusRules(activeStoreId);
  const ruleRows: BonusRuleRow[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    points: r.points,
    description: r.description,
    isActive: r.isActive,
    startDate: r.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: r.endDate?.toISOString().slice(0, 10) ?? null,
    sortOrder: r.sortOrder,
  }));

  return (
    <PageShell>
      <PageHeader
        title="獎勵項目管理"
        subtitle="設定分享、推薦、來店等點數規則"
        actions={
          <Link
            href="/dashboard/growth"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 成長系統
          </Link>
        }
      />

      <BonusRulesManager initialRules={ruleRows} />
    </PageShell>
  );
}
