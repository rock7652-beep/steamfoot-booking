"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "@/server/actions/profile";

interface ProfileFormProps {
  customer: {
    name: string;
    email: string | null;
    phone: string;
    gender: string | null;
    birthday: string | null; // ISO date string
    height: number | null;
  };
}

export function ProfileForm({ customer }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    { error: null, success: false }
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600">
          資料已更新
        </div>
      )}

      {/* 必填欄位 */}
      <div className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-earth-700">
            姓名
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={customer.name}
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label htmlFor="email-display" className="mb-1 block text-sm font-medium text-earth-700">
            Email
          </label>
          <input
            id="email-display"
            type="email"
            disabled
            value={customer.email || ""}
            className="w-full rounded-lg border border-earth-200 bg-earth-50 px-3 py-2.5 text-sm text-earth-500"
          />
          <p className="mt-1 text-xs text-earth-400">Email 綁定 Google 帳號，無法修改</p>
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
            defaultValue={customer.phone}
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <p className="mt-1 text-xs text-earth-400">請輸入 09 開頭的 10 位數字</p>
        </div>
      </div>

      {/* 選填欄位 */}
      <div className="space-y-4 border-t border-earth-200 pt-5">
        <h3 className="text-sm font-semibold text-earth-500">補充資料</h3>

        <div>
          <label htmlFor="gender" className="mb-1 block text-sm font-medium text-earth-700">
            性別
          </label>
          <select
            id="gender"
            name="gender"
            defaultValue={customer.gender || ""}
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
            defaultValue={customer.birthday || ""}
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
            defaultValue={customer.height ?? ""}
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
        {pending ? "儲存中..." : "儲存變更"}
      </button>
    </form>
  );
}
