"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setReminderEnabled, setReminderTemplate } from "@/server/actions/reminder";

interface Props {
  initialEnabled: boolean;
  initialTemplateId: string | null;
  templates: Array<{ id: string; name: string }>;
}

export function ReminderCard({ initialEnabled, initialTemplateId, templates }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [templateId, setTemplateId] = useState<string>(initialTemplateId ?? "");
  const [togglePending, setTogglePending] = useState(false);
  const [templatePending, startTemplateTransition] = useTransition();

  async function handleToggle() {
    setTogglePending(true);
    try {
      const result = await setReminderEnabled(!enabled);
      if (result.success) {
        setEnabled(!enabled);
        toast.success(!enabled ? "已啟用明日預約提醒" : "已停用明日預約提醒");
      } else {
        toast.error(result.error ?? "操作失敗");
      }
    } catch {
      toast.error("操作失敗，請稍後再試");
    } finally {
      setTogglePending(false);
    }
  }

  function handleTemplateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    const prev = templateId;
    setTemplateId(newId);
    startTemplateTransition(async () => {
      const result = await setReminderTemplate(newId === "" ? null : newId);
      if (!result.success) {
        setTemplateId(prev);
        toast.error(result.error ?? "模板更新失敗");
        return;
      }
      toast.success("已更新模板");
    });
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-earth-900">明日預約提醒</h3>
          <p className="mt-1 text-sm leading-relaxed text-earth-500">
            每天台灣時間 18:00，自動提醒「明天有預約且已綁定 LINE」的顧客。
          </p>
          <p className="mt-2 rounded-lg bg-primary-50 px-3 py-2 text-xs leading-relaxed text-primary-800">
            預約的正式排程應只啟用這一個時點；每一條啟用中的規則都會各自傳送一張 LINE 卡片，請勿同時啟用重複規則。下方模板文字會顯示在「方案／單次預約」卡片的提醒內容，不會另外再傳一則重複文字。首次體驗使用固定的體驗提醒卡。
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={togglePending}
          aria-label={enabled ? "停用提醒" : "啟用提醒"}
          aria-pressed={enabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-primary-600" : "bg-earth-300"
          } ${togglePending ? "opacity-50" : ""}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="mt-5 border-t border-earth-100 pt-4">
        <label htmlFor="reminder-template" className="block text-sm font-medium text-earth-700">
          使用模板
        </label>
        <select
          id="reminder-template"
          value={templateId}
          onChange={handleTemplateChange}
          disabled={templatePending || templates.length === 0}
          className="mt-1.5 block w-full max-w-md rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-50"
        >
          <option value="">使用預設模板</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-earth-400">
          {templates.length === 0
            ? "尚未建立任何模板，目前使用內建預設文案。可至「訊息模板」頁建立。"
            : "變更後，下次 18:00 會把新文案放入方案／單次 LINE 卡片的「提醒內容」；首次體驗卡不受影響。"}
        </p>
      </div>
    </div>
  );
}
