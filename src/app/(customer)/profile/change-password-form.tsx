"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/server/actions/profile";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    { error: null, success: false }
  );

  const inputCls = "w-full rounded-xl border border-earth-300 px-4 h-12 text-base text-earth-900 placeholder:text-earth-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500";
  const labelCls = "mb-2 block text-base font-medium text-earth-800";

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-medium text-red-700">{state.error}</div>
      )}
      {state.success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-base font-medium text-green-700">密碼已更新</div>
      )}

      <div>
        <label htmlFor="currentPassword" className={labelCls}>
          目前密碼
        </label>
        <input
          id="currentPassword" name="currentPassword" type="password" required
          placeholder="請輸入目前密碼"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="newPassword" className={labelCls}>
          新密碼
        </label>
        <input
          id="newPassword" name="newPassword" type="password" required
          placeholder="至少 4 位數字"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className={labelCls}>
          確認新密碼
        </label>
        <input
          id="confirmPassword" name="confirmPassword" type="password" required
          placeholder="再次輸入新密碼"
          className={inputCls}
        />
      </div>

      <button
        type="submit" disabled={pending}
        className="w-full min-h-[52px] rounded-xl border border-earth-300 bg-white px-4 text-base font-semibold text-earth-800 hover:bg-earth-50 disabled:opacity-60"
      >
        {pending ? "修改中..." : "修改密碼"}
      </button>
    </form>
  );
}
