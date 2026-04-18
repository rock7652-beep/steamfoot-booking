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
      <p className="text-center text-sm text-earth-400 py-6">
        尚未建立任何獎勵項目，請在上方新增
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} />
      ))}
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
    if (!confirm(`確定要停用「${rule.name}」嗎？`)) return;
    const fd = new FormData();
    fd.set("id", rule.id);
    startTransition(async () => {
      await deleteBonusRule(fd);
    });
  }

  return (
    <div className={`rounded-lg border p-4 ${rule.isActive ? "bg-white" : "bg-earth-50 opacity-60"}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-earth-900">{rule.name}</span>
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700">
              +{rule.points} 點
            </span>
            {!rule.isActive && (
              <span className="rounded bg-earth-200 px-1.5 py-0.5 text-[10px] text-earth-500">已停用</span>
            )}
          </div>
          {rule.description && (
            <p className="mt-1 text-xs text-earth-500">{rule.description}</p>
          )}
          {(rule.startDate || rule.endDate) && (
            <p className="mt-1 text-[11px] text-earth-400">
              {rule.startDate && `${rule.startDate}`}
              {rule.startDate && rule.endDate && " ~ "}
              {rule.endDate && `${rule.endDate}`}
              {!rule.startDate && rule.endDate && `截止 ${rule.endDate}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 ml-3">
          <button
            type="button"
            onClick={handleToggle}
            disabled={isPending}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              rule.isActive
                ? "bg-earth-100 text-earth-600 hover:bg-earth-200"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            {rule.isActive ? "停用" : "啟用"}
          </button>
          {!rule.isActive && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition"
            >
              刪除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
