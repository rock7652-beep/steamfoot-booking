"use client";

import { useState, useTransition } from "react";
import { createBonusRule } from "@/server/actions/bonus-rule";

export function BonusRuleForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const form = e.currentTarget;
    const fd = new FormData(form);

    startTransition(async () => {
      try {
        await createBonusRule(fd);
        setSuccess(true);
        form.reset();
        setTimeout(() => setSuccess(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "建立失敗");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-earth-600">
            名稱 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            required
            placeholder="例如：參加說明會"
            className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-earth-600">
            積分 <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="points"
            required
            min="1"
            placeholder="50"
            className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-earth-600">說明文字（前台顯示）</label>
        <input
          type="text"
          name="description"
          placeholder="例如：參加每月舉辦的創業說明會即可獲得積分"
          className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-earth-600">開始日期（選填）</label>
          <input
            type="date"
            name="startDate"
            className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-earth-600">結束日期（選填）</label>
          <input
            type="date"
            name="endDate"
            className="w-full rounded-lg border border-earth-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      {success && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-600">已新增</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {isPending ? "建立中…" : "新增項目"}
      </button>
    </form>
  );
}
