"use client";

import { useTransition } from "react";
import { updateBonusRule, deleteBonusRule } from "@/server/actions/bonus-rule";

interface RuleItem {
  id: string;
  name: string;
  points: number;
  description: string | null;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}

interface Props {
  rules: RuleItem[];
}

export function BonusRuleList({ rules }: Props) {
  if (rules.length === 0) {
    return (
      <div className="rounded-[12px] border border-dashed border-earth-200 bg-earth-50/40 px-4 py-6 text-center">
        <p className="text-sm text-earth-600">尚未建立任何獎勵規則</p>
        <p className="mt-1 text-[12px] text-earth-400">
          從上方「推薦玩法」點一鍵套用，或用「進階自訂規則」自建
        </p>
      </div>
    );
  }

  const active = rules.filter((r) => r.isActive);
  const inactive = rules.filter((r) => !r.isActive);

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <p className="mb-2 mt-1 text-[11px] font-semibold uppercase tracking-wide text-earth-400">
            已停用（{inactive.length}）
          </p>
          <div className="space-y-2">
            {inactive.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleCard({ rule }: { rule: RuleItem }) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const fd = new FormData();
    fd.set("id", rule.id);
    fd.set("name", rule.name);
    fd.set("points", String(rule.points));
    fd.set("isActive", String(!rule.isActive));
    if (rule.description) fd.set("description", rule.description);
    if (rule.startDate) fd.set("startDate", rule.startDate);
    if (rule.endDate) fd.set("endDate", rule.endDate);

    startTransition(async () => {
      await updateBonusRule(fd);
    });
  }

  function handleDelete() {
    if (!confirm(`確定要刪除「${rule.name}」嗎？`)) return;
    const fd = new FormData();
    fd.set("id", rule.id);
    startTransition(async () => {
      await deleteBonusRule(fd);
    });
  }

  const hasPeriod = rule.startDate || rule.endDate;

  return (
    <div
      className={`rounded-[14px] border p-4 transition ${
        rule.isActive
          ? "border-earth-200 bg-white hover:border-primary-200"
          : "border-earth-200 bg-earth-50/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-earth-900">{rule.name}</span>
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-bold text-primary-700">
              +{rule.points} 點
            </span>
            {rule.isActive ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                ● 啟用
              </span>
            ) : (
              <span className="rounded-full bg-earth-200 px-2 py-0.5 text-[11px] font-semibold text-earth-500">
                ○ 停用
              </span>
            )}
          </div>

          {rule.description && (
            <p className="mt-1.5 text-[12px] text-earth-600">{rule.description}</p>
          )}

          {hasPeriod && (
            <p className="mt-1 text-[11px] text-earth-400">
              有效期間 ·{" "}
              {rule.startDate && <span className="tabular-nums">{rule.startDate}</span>}
              {rule.startDate && rule.endDate && " ~ "}
              {rule.endDate && !rule.startDate && "截止 "}
              {rule.endDate && <span className="tabular-nums">{rule.endDate}</span>}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={
              rule.isActive
                ? "rounded-md border border-earth-200 bg-white px-3 py-1.5 text-[12px] font-medium text-earth-700 transition hover:bg-earth-50 disabled:opacity-50"
                : "rounded-md bg-green-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
            }
          >
            {rule.isActive ? "停用" : "啟用"}
          </button>
          {!rule.isActive && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-[12px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              刪除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
