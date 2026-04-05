"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/server/actions/profile";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    { error: null, success: false }
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{state.error}</div>
      )}
      {state.success && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-600">密碼已更新</div>
      )}

      <div>
        <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-earth-700">
          目前密碼
        </label>
        <input
          id="currentPassword" name="currentPassword" type="password" required
          placeholder="請輸入目前密碼"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-earth-700">
          新密碼
        </label>
        <input
          id="newPassword" name="newPassword" type="password" required
          placeholder="至少 4 位數字"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-earth-700">
          確認新密碼
        </label>
        <input
          id="confirmPassword" name="confirmPassword" type="password" required
          placeholder="再次輸入新密碼"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <button
        type="submit" disabled={pending}
        className="w-full rounded-lg border border-earth-300 bg-white px-4 py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:opacity-60"
      >
        {pending ? "修改中..." : "修改密碼"}
      </button>
    </form>
  );
}
