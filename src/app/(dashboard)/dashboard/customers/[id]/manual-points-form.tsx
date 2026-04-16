"use client";

import { useState, useTransition } from "react";
import { manualAwardPoints } from "@/server/actions/manual-points";

interface BonusRuleOption {
  id: string;
  name: string;
  points: number;
}

interface Props {
  customerId: string;
  bonusRules: BonusRuleOption[];
}

export function ManualPointsForm({ customerId, bonusRules }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleRuleChange(ruleId: string) {
    setSelectedRuleId(ruleId);
    if (ruleId) {
      const rule = bonusRules.find((r) => r.id === ruleId);
      if (rule) setPoints(String(rule.points));
    } else {
      setPoints("");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const fd = new FormData(e.currentTarget);
    fd.set("customerId", customerId);

    startTransition(async () => {
      try {
        await manualAwardPoints(fd);
        setOpen(false);
        setSelectedRuleId("");
        setPoints("");
        setNote("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失敗");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition"
      >
        + 手動加分
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
          <div
            className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-earth-900">手動加分</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-earth-400 hover:text-earth-600"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="hidden" name="customerId" value={customerId} />

              {/* 獎勵項目選擇 */}
              {bonusRules.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-earth-600">
                    選擇獎勵項目（可選）
                  </label>
                  <select
                    name="bonusRuleId"
                    value={selectedRuleId}
                    onChange={(e) => handleRuleChange(e.target.value)}
                    className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">自由輸入</option>
                    {bonusRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name}（+{rule.points} 分）
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 積分 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-earth-600">
                  積分 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="points"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  placeholder="例如 50"
                  required
                  className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <p className="mt-1 text-[11px] text-earth-400">正數為加分，負數為扣分</p>
              </div>

              {/* 備註 */}
              <div>
                <label className="mb-1 block text-xs font-medium text-earth-600">備註</label>
                <input
                  type="text"
                  name="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="補充說明（選填）"
                  className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-earth-200 px-4 py-2 text-sm text-earth-600 hover:bg-earth-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {isPending ? "處理中…" : "確認加分"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
