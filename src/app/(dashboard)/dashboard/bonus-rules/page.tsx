import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getCachedBonusRules } from "@/lib/query-cache";
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

  const rules = await getCachedBonusRules(activeStoreId);
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
        subtitle="後台手動加分用的快速模板"
        actions={
          <Link
            href="/dashboard/growth"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 成長系統
          </Link>
        }
      />

      <ManualOnlyNotice />

      <BonusRulesManager initialRules={ruleRows} />
    </PageShell>
  );
}

/**
 * 重要提醒：BonusRule 不是自動加點規則
 *
 * 系統的自動加點是 hardcoded 在 `src/lib/points-config.ts` 的
 * `POINT_VALUES`，由 server action 在事件觸發時呼叫 `awardPoints()`
 * — 跟此頁的 BonusRule 表完全是兩套機制。
 *
 * BonusRule 唯一被讀取的地方是 `manual-points.ts:48`：店長在顧客頁
 * 按「手動加分」時，下拉選 rule，系統把 rule.points 帶入 + rule.name
 * 寫進 note，後續還是走 MANUAL_ADJUSTMENT。
 *
 * 這張卡片避免店長誤以為「啟用 BonusRule = 系統會自動發點」— 之前
 * 預設玩法卡（PresetPlaybookCards）的「一鍵套用」UX 就有這層誤導
 * 風險，這裡用對應表把自動 vs 手動的關係挑明。
 */
function ManualOnlyNotice() {
  const autoEvents = [
    { label: "完成服務（出席）", points: "+5", token: "ATTENDANCE" },
    { label: "朋友首次體驗（邀請者）", points: "+10", token: "REFERRAL_VISITED" },
    { label: "朋友首次體驗（被邀請者）", points: "+5", token: "REFERRAL_VISITED_SELF" },
    { label: "朋友首次儲值（邀請者）", points: "+15", token: "REFERRAL_CONVERTED" },
    { label: "朋友加入官方 LINE", points: "+1", token: "LINE_JOIN_REFERRER" },
    { label: "店家手動登記轉介紹", points: "+10", token: "REFERRAL_CREATED" },
  ];
  // iPad 門市操作 — 常駐顯示、不收合，讓店長交班時也能直接掃過對應表確認。
  // 使用 8/4 grid 撐滿桌機 / iPad-landscape 寬度，不用滑下去翻 details。
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 px-5 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <span aria-hidden>⚠️</span>
            這頁不會自動發點 — 是「後台手動加分」的快速模板
          </h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-amber-800">
            啟用 / 停用此頁規則不影響來店、推薦、LINE 等自動加點 — 它們是另一套內建邏輯。下方對應表是兩邊機制的完整對照。
          </p>
        </div>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800">
          常駐提示
        </span>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-amber-200 pt-4 xl:grid-cols-12">
        {/* 系統自動加 — 8 欄，密度最高 */}
        <div className="xl:col-span-8">
          <h3 className="mb-2 text-[12px] font-semibold text-amber-900">
            系統自動加 · 不需設定，事件觸發即發
          </h3>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {autoEvents.map((e) => (
              <li
                key={e.token}
                className="flex h-9 items-center justify-between rounded-md border border-amber-100 bg-white px-2.5 text-[12px]"
              >
                <span className="truncate text-earth-700">{e.label}</span>
                <span className="ml-2 shrink-0 font-mono text-[11px] tabular-nums text-amber-700">
                  {e.points}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-amber-700">
            來源：
            <code className="rounded bg-white px-1 py-0.5">
              src/lib/points-config.ts
            </code>
            的 POINT_VALUES，由 server action 在事件觸發時呼叫 awardPoints()
          </p>
        </div>

        {/* 這頁的 BonusRule — 4 欄，3 點重點 */}
        <div className="xl:col-span-4">
          <h3 className="mb-2 text-[12px] font-semibold text-amber-900">
            這頁的 BonusRule · 純手動模板
          </h3>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-earth-700">
            <li className="rounded-md border border-amber-100 bg-white px-2.5 py-1.5">
              <strong className="font-semibold text-amber-900">用法：</strong>
              店長在「顧客頁 → 手動加分」下拉選擇，系統帶入點數 + 規則名稱當備註，記為 MANUAL_ADJUSTMENT。
            </li>
            <li className="rounded-md border border-amber-100 bg-white px-2.5 py-1.5">
              <strong className="font-semibold text-amber-900">來店 / 推薦：</strong>
              自動加點已覆蓋，此處規則用於想額外補登的情境。
            </li>
            <li className="rounded-md border border-amber-100 bg-white px-2.5 py-1.5">
              <strong className="font-semibold text-amber-900">蒸足打卡：</strong>
              目前無自動 trigger，<u>只能透過此頁手動加 +3 點</u>。
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
