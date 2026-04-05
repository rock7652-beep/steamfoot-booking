"use client";

import { useActionState } from "react";
import { onboardingAction, type OnboardingState } from "@/server/actions/onboarding";

interface OnboardingFormProps {
  defaultName: string;
  defaultEmail: string;
}

export function OnboardingForm({ defaultName, defaultEmail }: OnboardingFormProps) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    onboardingAction,
    { error: null }
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </div>
      )}

      {/* 必填區塊 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-earth-700">基本資料（必填）</h3>

        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-earth-700">
            姓名
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultName}
            placeholder="請輸入您的姓名"
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-earth-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={defaultEmail}
            placeholder="example@email.com"
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium text-earth-700">
            手機號碼
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="0912345678"
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <p className="mt-1 text-xs text-earth-400">請輸入 09 開頭的 10 位數字</p>
        </div>
      </div>

      {/* 選填區塊 */}
      <div className="space-y-4 border-t border-earth-200 pt-5">
        <h3 className="text-sm font-semibold text-earth-700">補充資料（選填）</h3>

        <div>
          <label htmlFor="gender" className="mb-1 block text-sm font-medium text-earth-700">
            性別
          </label>
          <select
            id="gender"
            name="gender"
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">不指定</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>

        <div>
          <label htmlFor="birthday" className="mb-1 block text-sm font-medium text-earth-700">
            出生年月日
          </label>
          <input
            id="birthday"
            name="birthday"
            type="date"
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label htmlFor="height" className="mb-1 block text-sm font-medium text-earth-700">
            身高（cm）
          </label>
          <input
            id="height"
            name="height"
            type="number"
            min="50"
            max="250"
            step="0.1"
            placeholder="例：165"
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50"
      >
        {pending ? "儲存中..." : "完成設定"}
      </button>
    </form>
  );
}
