"use client";

import { useState } from "react";
import { createReminderRule } from "@/server/actions/reminder";

const QUICK_PRESETS = [
  { label: "預約前 24 小時", offsetMinutes: 1440 },
  { label: "預約前 12 小時", offsetMinutes: 720 },
  { label: "預約前 3 小時", offsetMinutes: 180 },
];

interface Props {
  templates: Array<{ id: string; name: string }>;
}

export function CreateRuleForm({ templates }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"relative" | "fixed">("relative");
  const [offsetMinutes, setOffsetMinutes] = useState(1440);
  const [customHours, setCustomHours] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const templateId = (form.get("templateId") as string) || undefined;

    const finalOffsetMinutes =
      type === "relative"
        ? customHours
          ? Math.round(Number(customHours) * 60)
          : offsetMinutes
        : undefined;

    const result = await createReminderRule({
      name,
      type,
      offsetMinutes: finalOffsetMinutes,
      offsetDays: type === "fixed" ? Number(form.get("offsetDays") ?? 1) : undefined,
      fixedTime: type === "fixed" ? (form.get("fixedTime") as string) || "20:00" : undefined,
      templateId,
      isEnabled: true,
    });

    if (result.success) {
      setOpen(false);
      setType("relative");
      setOffsetMinutes(1440);
      setCustomHours("");
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

          {/* Type selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-earth-700">觸發模式</label>
            <div className="flex gap-3">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="typeRadio"
                  checked={type === "relative"}
                  onChange={() => setType("relative")}
                  className="accent-primary-600"
                />
                <span className="text-sm text-earth-700">預約前 X 小時</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="typeRadio"
                  checked={type === "fixed"}
                  onChange={() => setType("fixed")}
                  className="accent-primary-600"
                />
                <span className="text-sm text-earth-700">固定時間</span>
              </label>
            </div>
          </div>

          {/* Relative: quick presets + custom */}
          {type === "relative" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-earth-700">提前時間</label>
              <div className="flex flex-wrap gap-2">
                {QUICK_PRESETS.map((p) => (
                  <button
                    key={p.offsetMinutes}
                    type="button"
                    onClick={() => { setOffsetMinutes(p.offsetMinutes); setCustomHours(""); }}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                      !customHours && offsetMinutes === p.offsetMinutes
                        ? "border-primary-600 bg-primary-50 text-primary-700 font-medium"
                        : "border-earth-300 text-earth-600 hover:bg-earth-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-earth-500">或自訂：</span>
                <input
                  type="number"
                  min="0.5"
                  max="168"
                  step="0.5"
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  placeholder="小時"
                  className="w-20 rounded-lg border border-earth-300 px-2 py-1.5 text-sm"
                />
                <span className="text-sm text-earth-500">小時前</span>
              </div>
              <p className="text-xs text-earth-400">
                選擇的提前時間：
                {customHours
                  ? `${customHours} 小時（${Math.round(Number(customHours) * 60)} 分鐘）`
                  : `${offsetMinutes / 60} 小時（${offsetMinutes} 分鐘）`}
              </p>
            </div>
          )}

          {/* Fixed: offsetDays + fixedTime */}
          {type === "fixed" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-earth-700">提前天數</label>
                <select
                  name="offsetDays"
                  defaultValue="1"
                  className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
                >
                  <option value="0">當天</option>
                  <option value="1">前 1 天</option>
                  <option value="2">前 2 天</option>
                  <option value="3">前 3 天</option>
                  <option value="7">前 7 天</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-earth-700">發送時間</label>
                <input
                  name="fixedTime"
                  type="time"
                  defaultValue="20:00"
                  className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-earth-400">
                  例：前 1 天 20:00 → 預約日前一晚 8 點發送
                </p>
              </div>
            </div>
          )}

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
