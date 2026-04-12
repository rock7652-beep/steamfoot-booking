"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createMessageTemplate } from "@/server/actions/reminder";

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

const SAMPLE_VARS = {
  customerName: "王小明",
  bookingDate: "2026-04-07",
  bookingTime: "14:00",
  shopName: "蒸足",
  staffName: "Alice 店主",
  bookingLink: "https://www.steamfoot.com/my-bookings",
};

const DEFAULT_BODY = `{{customerName}} 您好！

明天 {{bookingDate}} {{bookingTime}} 有一筆蒸足預約，請記得準時到店。

如需取消或改期，請點擊：{{bookingLink}}

{{shopName}} 敬上`;

export function CreateTemplateForm() {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = renderTemplate(body, SAMPLE_VARS);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      const result = await createMessageTemplate({
        name: form.get("name") as string,
        body,
        isDefault: form.get("isDefault") === "on",
      });

      if (result.success) {
        toast.success("訊息模板已建立");
        setOpen(false);
        setBody(DEFAULT_BODY);
      } else {
        toast.error(result.error);
        setError(result.error);
      }
    } catch {
      toast.error("操作失敗，請稍後再試");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
      >
        新增模板
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-earth-900">新增訊息模板</h2>

        <form onSubmit={handleSubmit} className="mt-4">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Left: Editor */}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-earth-700">模板名稱</label>
                <input
                  name="name"
                  required
                  placeholder="例：預約提醒 - 基本"
                  className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-earth-700">模板內容</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm font-mono"
                />
                <p className="mt-1 text-xs text-earth-400">
                  可用變數：{"{{customerName}} {{bookingDate}} {{bookingTime}} {{shopName}} {{staffName}} {{bookingLink}}"}
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-earth-700">
                <input type="checkbox" name="isDefault" className="rounded" />
                設為預設模板
              </label>
            </div>

            {/* Right: Preview */}
            <div>
              <label className="mb-1 block text-sm font-medium text-earth-700">手機預覽</label>
              <div className="rounded-2xl bg-earth-100 p-4">
                <div className="mx-auto w-[260px] overflow-hidden rounded-[28px] border-4 border-earth-300 bg-white">
                  {/* Phone header */}
                  <div className="bg-[#06C755] px-4 py-2">
                    <p className="text-center text-xs font-medium text-white">蒸足 LINE</p>
                  </div>
                  {/* Chat area */}
                  <div className="min-h-[300px] bg-[#7AABBB]/20 p-3">
                    <div className="rounded-lg bg-white p-3 text-xs leading-relaxed text-earth-700 shadow-sm">
                      {preview.split("\n").map((line, i) => (
                        <span key={i}>
                          {line}
                          {i < preview.split("\n").length - 1 && <br />}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending ? "建立中..." : "建立模板"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setBody(DEFAULT_BODY); }}
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
