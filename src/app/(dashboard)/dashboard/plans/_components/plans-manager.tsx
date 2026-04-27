"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiStrip, type KpiStripItem } from "@/components/desktop";
import { PlanActiveToggle } from "../plan-active-toggle";
import { PlanPublishToggle } from "../plan-publish-toggle";
import { PlanFormDrawer, type PlanRow } from "./plan-form-drawer";
import type { PlanCategory } from "@prisma/client";

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  TRIAL: "體驗",
  SINGLE: "單次",
  PACKAGE: "課程",
};

const CATEGORY_COLOR: Record<PlanCategory, string> = {
  TRIAL: "bg-purple-100 text-purple-700",
  SINGLE: "bg-blue-100 text-blue-700",
  PACKAGE: "bg-green-100 text-green-700",
};

type StatusFilter = "active" | "all";
type VisibilityFilter = "all" | "public" | "internal";
type CategoryFilter = "all" | PlanCategory;

interface Props {
  initialPlans: PlanRow[];
  canManage: boolean;
}

export function PlansManager({ initialPlans, canManage }: Props) {
  // Lifted into client state so create/edit/toggle can patch in place
  // without router.refresh — server still revalidates the cache, so a
  // future navigation gets fresh data.
  const [plans, setPlans] = useState<PlanRow[]>(initialPlans);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilter>("all");
  const [drawer, setDrawer] = useState<{
    mode: "new" | "edit";
    plan: PlanRow | null;
  } | null>(null);

  // KPI strip — counts run off the full plans set, not the filtered view,
  // so店長 sees a stable snapshot regardless of which filter is active.
  const kpis: KpiStripItem[] = useMemo(() => {
    const active = plans.filter((p) => p.isActive);
    const publicCount = active.filter((p) => p.publicVisible).length;
    const internalCount = active.length - publicCount;
    const inactiveCount = plans.length - active.length;
    const totalAvg = active.reduce((acc, p) => {
      const price = Number(p.price);
      if (p.sessionCount <= 0) return acc;
      return acc + price / p.sessionCount;
    }, 0);
    const avg = active.length > 0 ? Math.round(totalAvg / active.length) : 0;
    return [
      { label: "上架中", value: active.length, tone: "primary" },
      { label: "顧客可購買", value: publicCount, tone: "blue" },
      { label: "僅後台指派", value: internalCount, tone: "earth" },
      { label: "已下架", value: inactiveCount, tone: "amber" },
      { label: "平均單堂價", value: `$${avg.toLocaleString()}`, tone: "green" },
    ];
  }, [plans]);

  const visiblePlans = useMemo(() => {
    return plans.filter((p) => {
      if (statusFilter === "active" && !p.isActive) return false;
      if (visibilityFilter === "public" && !(p.isActive && p.publicVisible))
        return false;
      if (visibilityFilter === "internal" && !(p.isActive && !p.publicVisible))
        return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter)
        return false;
      return true;
    });
  }, [plans, statusFilter, visibilityFilter, categoryFilter]);

  function patchPlan(id: string, patch: Partial<PlanRow>) {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function handleSaved(row: PlanRow) {
    setPlans((prev) => {
      const idx = prev.findIndex((p) => p.id === row.id);
      if (idx === -1) {
        // New plan — sort by sortOrder asc (matches server order). New plan
        // with no sortOrder lands at end of its tier; close enough until
        // next refresh.
        return [...prev, row].sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }
      const next = [...prev];
      next[idx] = row;
      return next;
    });
  }

  return (
    <>
      <KpiStrip items={kpis} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-earth-200 pb-2">
        <FilterPill
          label="上架中"
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        />
        <FilterPill
          label="全部"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <span className="mx-1 h-4 w-px bg-earth-200" />
        <FilterPill
          label="顧客可購買"
          tone="blue"
          active={visibilityFilter === "public"}
          onClick={() =>
            setVisibilityFilter(
              visibilityFilter === "public" ? "all" : "public",
            )
          }
        />
        <FilterPill
          label="僅後台指派"
          tone="earth"
          active={visibilityFilter === "internal"}
          onClick={() =>
            setVisibilityFilter(
              visibilityFilter === "internal" ? "all" : "internal",
            )
          }
        />
        <span className="mx-1 h-4 w-px bg-earth-200" />
        {(["all", "TRIAL", "SINGLE", "PACKAGE"] as const).map((cat) => (
          <FilterPill
            key={cat}
            label={cat === "all" ? "全部類別" : CATEGORY_LABEL[cat]}
            active={categoryFilter === cat}
            onClick={() => setCategoryFilter(cat)}
          />
        ))}
        <span className="ml-auto text-[11px] text-earth-400">
          顯示 {visiblePlans.length} / {plans.length} 筆
        </span>
        {canManage && (
          <button
            type="button"
            onClick={() => setDrawer({ mode: "new", plan: null })}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
          >
            ＋ 新增方案
          </button>
        )}
      </div>

      {visiblePlans.length === 0 ? (
        plans.length === 0 ? (
          <div className="rounded-xl border border-earth-200 bg-white p-8 text-center">
            <EmptyState
              icon="settings"
              title="尚無課程方案"
              description="建立第一個方案，顧客就能購買或店長可指派"
            />
            {canManage && (
              <button
                type="button"
                onClick={() => setDrawer({ mode: "new", plan: null })}
                className="mt-4 inline-flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
              >
                ＋ 新增方案
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-earth-200 bg-white px-4 py-6 text-center text-sm text-earth-500">
            目前沒有符合條件的方案
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-earth-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
              <tr>
                <th className="px-3 py-2">類別</th>
                <th className="px-3 py-2">方案名稱</th>
                <th className="px-3 py-2 text-right">價格</th>
                <th className="px-3 py-2 text-right">堂數</th>
                <th className="px-3 py-2 text-right">單堂均價</th>
                <th className="px-3 py-2 text-right">效期</th>
                <th className="px-3 py-2 text-right">使用中</th>
                <th className="px-3 py-2">前台</th>
                <th className="px-3 py-2">狀態</th>
                {canManage && <th className="px-3 py-2 text-right">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {visiblePlans.map((plan) => {
                const price = Number(plan.price);
                const avg =
                  plan.sessionCount > 0
                    ? Math.round(price / plan.sessionCount)
                    : 0;
                return (
                  <tr
                    key={plan.id}
                    className={`h-12 transition hover:bg-primary-50/40 ${
                      !plan.isActive ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CATEGORY_COLOR[plan.category]}`}
                      >
                        {CATEGORY_LABEL[plan.category]}
                      </span>
                    </td>
                    <td className="px-3">
                      <div className="font-medium text-earth-900">
                        {plan.name}
                      </div>
                      {plan.description && (
                        <div className="line-clamp-1 text-[11px] text-earth-400">
                          {plan.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 text-right font-semibold text-primary-700 tabular-nums">
                      ${price.toLocaleString()}
                    </td>
                    <td className="px-3 text-right text-[13px] text-earth-700 tabular-nums">
                      {plan.sessionCount}
                    </td>
                    <td className="px-3 text-right text-[12px] text-earth-500 tabular-nums">
                      ${avg.toLocaleString()}
                    </td>
                    <td className="px-3 text-right text-[12px] text-earth-500 tabular-nums">
                      {plan.validityDays ? `${plan.validityDays} 天` : "—"}
                    </td>
                    <td className="px-3 text-right text-[12px] tabular-nums">
                      {plan._count.wallets > 0 ? (
                        <span className="text-earth-700">
                          {plan._count.wallets}
                        </span>
                      ) : (
                        <span className="text-earth-300">0</span>
                      )}
                    </td>
                    <td className="px-3">
                      {canManage ? (
                        <PlanPublishToggle
                          planId={plan.id}
                          planName={plan.name}
                          publicVisible={plan.publicVisible}
                          isActive={plan.isActive}
                          compact
                          onChange={(next) =>
                            patchPlan(plan.id, { publicVisible: next })
                          }
                        />
                      ) : (
                        <span className="text-[11px] text-earth-500">
                          {plan.publicVisible ? "顧客可購買" : "僅後台指派"}
                        </span>
                      )}
                    </td>
                    <td className="px-3">
                      {canManage ? (
                        <PlanActiveToggle
                          planId={plan.id}
                          planName={plan.name}
                          isActive={plan.isActive}
                          compact
                          onChange={(next) =>
                            patchPlan(plan.id, {
                              isActive: next,
                              // 下架時自動關閉前台可購買，與 server 一致
                              publicVisible: next ? plan.publicVisible : false,
                            })
                          }
                        />
                      ) : (
                        <span className="text-[11px] text-earth-500">
                          {plan.isActive ? "上架中" : "已下架"}
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDrawer({ mode: "edit", plan })}
                          className="text-[12px] text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          編輯
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <PlanFormDrawer
          open={!!drawer}
          mode={drawer?.mode ?? "new"}
          plan={drawer?.plan ?? null}
          onClose={() => setDrawer(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  tone = "primary",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "primary" | "blue" | "earth";
}) {
  const activeClass =
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : tone === "earth"
        ? "bg-earth-200 text-earth-700"
        : "bg-primary-600 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium transition ${
        active
          ? activeClass
          : "bg-earth-100 text-earth-600 hover:bg-earth-200"
      }`}
    >
      {label}
    </button>
  );
}
