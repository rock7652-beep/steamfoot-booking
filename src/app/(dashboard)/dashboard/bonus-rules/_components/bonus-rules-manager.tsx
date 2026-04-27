"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { KpiStrip, type KpiStripItem } from "@/components/desktop";
import {
  deleteBonusRule,
  updateBonusRule,
} from "@/server/actions/bonus-rule";
import { PresetPlaybookCards } from "../preset-playbook-cards";
import {
  BonusRuleDrawer,
  type BonusRuleRow,
} from "./bonus-rule-drawer";

/**
 * 名稱對應 PresetPlaybookCards 的 3 張預設 — 命中此清單代表是「系統預設玩法」，
 * 介面上顯示「預設」badge 並把刪除按鈕收起，避免店長誤刪掉 onboarding
 * 入口。停用仍允許（這也是 spec 的允許範圍）。
 */
const SYSTEM_PRESET_NAMES = new Set(["來店蒸足", "蒸足打卡", "推薦朋友"]);

interface Props {
  initialRules: BonusRuleRow[];
}

export function BonusRulesManager({ initialRules }: Props) {
  // Lifted into client state so toggle / delete / create can patch in
  // place — server actions still revalidate, future nav gets fresh data.
  const [rules, setRules] = useState<BonusRuleRow[]>(initialRules);
  const [drawer, setDrawer] = useState<{
    mode: "new" | "edit";
    rule: BonusRuleRow | null;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const kpis: KpiStripItem[] = useMemo(() => {
    const active = rules.filter((r) => r.isActive).length;
    const inactive = rules.length - active;
    const preset = rules.filter((r) => SYSTEM_PRESET_NAMES.has(r.name)).length;
    const custom = rules.length - preset;
    return [
      { label: "已啟用", value: active, tone: "primary" },
      { label: "已停用", value: inactive, tone: "amber" },
      { label: "系統預設", value: preset, tone: "blue" },
      { label: "自訂規則", value: custom, tone: "earth" },
    ];
  }, [rules]);

  const ruleNames = useMemo(() => rules.map((r) => r.name), [rules]);

  function patchRule(id: string, patch: Partial<BonusRuleRow>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleSaved(row: BonusRuleRow) {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      if (idx === -1) {
        return [...prev, row].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        );
      }
      const next = [...prev];
      next[idx] = row;
      return next;
    });
  }

  function handleToggle(rule: BonusRuleRow) {
    setPendingId(rule.id);
    const fd = new FormData();
    fd.set("id", rule.id);
    fd.set("name", rule.name);
    fd.set("points", String(rule.points));
    fd.set("isActive", String(!rule.isActive));
    if (rule.description) fd.set("description", rule.description);
    if (rule.startDate) fd.set("startDate", rule.startDate);
    if (rule.endDate) fd.set("endDate", rule.endDate);
    startTransition(async () => {
      try {
        const result = await updateBonusRule(fd);
        if (!result.success) {
          toast.error(result.error || "切換失敗");
          return;
        }
        patchRule(rule.id, { isActive: !rule.isActive });
        toast.success(rule.isActive ? "已停用" : "已啟用");
      } finally {
        setPendingId((cur) => (cur === rule.id ? null : cur));
      }
    });
  }

  function handleDelete(rule: BonusRuleRow) {
    if (
      !confirm(`確定刪除「${rule.name}」嗎？此動作無法復原。\n\n（既有點數紀錄不受影響）`)
    ) {
      return;
    }
    setPendingId(rule.id);
    const fd = new FormData();
    fd.set("id", rule.id);
    startTransition(async () => {
      try {
        const result = await deleteBonusRule(fd);
        if (!result.success) {
          toast.error(result.error || "刪除失敗");
          return;
        }
        setRules((prev) => prev.filter((r) => r.id !== rule.id));
        toast.success(`已刪除「${rule.name}」`);
      } finally {
        setPendingId((cur) => (cur === rule.id ? null : cur));
      }
    });
  }

  const sortedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        // 啟用中排前面，再按 sortOrder + name 排序
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      }),
    [rules],
  );

  return (
    <>
      <KpiStrip items={kpis} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* 左 8：規則 compact table */}
        <div className="xl:col-span-8">
          <section className="rounded-xl border border-earth-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-earth-900">獎勵規則</h2>
                <p className="text-[11px] text-earth-400">
                  停用後既有點數紀錄不受影響；系統預設不可刪除，只能停用
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawer({ mode: "new", rule: null })}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
              >
                ＋ 新增自訂規則
              </button>
            </header>

            {sortedRules.length === 0 ? (
              <div className="flex items-center justify-between rounded-lg border-t border-earth-100 px-4 py-4 text-xs text-earth-500">
                <span>尚無自訂規則</span>
                <button
                  type="button"
                  onClick={() => setDrawer({ mode: "new", rule: null })}
                  className="text-[11px] font-medium text-primary-600 hover:text-primary-700"
                >
                  + 新增自訂規則
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
                    <tr>
                      <th className="px-3 py-2">名稱</th>
                      <th className="px-3 py-2 text-right">點數</th>
                      <th className="px-3 py-2">類型</th>
                      <th className="px-3 py-2">期間</th>
                      <th className="px-3 py-2">狀態</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-earth-100">
                    {sortedRules.map((r) => {
                      const isPreset = SYSTEM_PRESET_NAMES.has(r.name);
                      const isPending = pendingId === r.id;
                      const period =
                        r.startDate || r.endDate
                          ? `${r.startDate ?? "—"} ~ ${r.endDate ?? "—"}`
                          : "—";
                      return (
                        <tr
                          key={r.id}
                          className={`h-12 transition hover:bg-primary-50/40 ${
                            !r.isActive ? "opacity-60" : ""
                          } ${isPending ? "opacity-40" : ""}`}
                        >
                          <td className="px-3">
                            <div className="font-medium text-earth-900">
                              {r.name}
                            </div>
                            {r.description && (
                              <div className="line-clamp-1 text-[11px] text-earth-400">
                                {r.description}
                              </div>
                            )}
                          </td>
                          <td className="px-3 text-right">
                            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[12px] font-bold tabular-nums text-primary-700">
                              +{r.points}
                            </span>
                          </td>
                          <td className="px-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                isPreset
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-earth-100 text-earth-600"
                              }`}
                            >
                              {isPreset ? "預設" : "自訂"}
                            </span>
                          </td>
                          <td className="px-3 text-[11px] tabular-nums text-earth-500">
                            {period}
                          </td>
                          <td className="px-3">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                r.isActive
                                  ? "bg-green-50 text-green-700"
                                  : "bg-earth-100 text-earth-500"
                              }`}
                            >
                              {r.isActive ? "● 啟用" : "○ 停用"}
                            </span>
                          </td>
                          <td className="px-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setDrawer({ mode: "edit", rule: r })
                                }
                                disabled={isPending}
                                className="rounded-md border border-earth-200 bg-white px-2.5 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-50"
                              >
                                編輯
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggle(r)}
                                disabled={isPending}
                                className={
                                  r.isActive
                                    ? "rounded-md border border-earth-200 bg-white px-2.5 py-1 text-[11px] font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-50"
                                    : "rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                }
                              >
                                {r.isActive ? "停用" : "啟用"}
                              </button>
                              {!isPreset && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(r)}
                                  disabled={isPending}
                                  className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  刪除
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* 右 4：推薦玩法模板（既有 component） */}
        <aside className="xl:col-span-4">
          <PresetPlaybookCards existingRuleNames={ruleNames} />
        </aside>
      </div>

      <BonusRuleDrawer
        open={!!drawer}
        mode={drawer?.mode ?? "new"}
        rule={drawer?.rule ?? null}
        onClose={() => setDrawer(null)}
        onSaved={handleSaved}
      />
    </>
  );
}
