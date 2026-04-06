"use client";

import { useState } from "react";
import { createReminderRule } from "@/server/actions/reminder";

const TRIGGER_OPTIONS = [
  { value: "BEFORE_BOOKING_1D", label: "預約前一天" },
  { value: "BEFORE_BOOKING_2H", label: "預約前 2 小時（即將推出）", disabled: true },
  { value: "AFTER_SERVICE_7D", label: "服務後 7 天（即將推出）", disabled: true },
  { value: "INACTIVE_30D", label: "30 天未回訪（即將推出）", disabled: true },
];

interface Props {
  templates: Array<{ id: string; name: string }>;
}

export function CreateRuleForm({ templates }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const result = await createReminderRule({
      name: form.get("name") as string,
      triggerType: form.get("triggerType") as "BEFORE_BOOKING_1D",
      templateId: (form.get("templateId") as string) || undefined,
      isEnabled: true,
    });

    if (result.success) {
      setOpen(false);
    } else {
      setError(result.error);
    }
    setPending(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
      >
        新增規則
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-earth-900">新增提醒規則</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-earth-700">規則名稱</label>
            <input
              name="name"
              required
              placeholder="例：預約前一天提醒"
              className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-earth-700">觸發條件</label>
            <select name="triggerType" className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm">
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-earth-700">訊息模板</label>
            <select name="templateId" className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm">
              <option value="">使用預設模板</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending ? "建立中..." : "建立規則"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-earth-300 px-4 py-2 text-sm text-earth-600 hover:bg-earth-50"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
