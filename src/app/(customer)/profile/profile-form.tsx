"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { updateProfileAction, type ProfileState } from "@/server/actions/profile";
import Link from "next/link";

interface Props {
  customer: {
    name: string;
    phone: string;
    email: string | null;
    gender: string | null;
    birthday: string | null;
    height: number | null;
    address: string | null;
    notes: string | null;
  };
  age: number | null;
}

export function ProfileForm({ customer, age }: Props) {
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    { error: null, success: false }
  );

  // 手機變更後自動登出
  useEffect(() => {
    if (state.success && state.phoneChanged) {
      const timer = setTimeout(() => {
        signOut({ callbackUrl: "/" });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.success, state.phoneChanged]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{state.error}</div>
      )}
      {state.success && state.phoneChanged && (
        <div className="rounded-lg bg-yellow-50 px-4 py-2 text-sm text-yellow-700">
          手機號碼已更新，請使用新手機號碼重新登入。即將自動登出...
        </div>
      )}
      {state.success && !state.phoneChanged && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-600">資料已更新</div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-earth-700">姓名</label>
        <input
          id="name" name="name" type="text" required
          defaultValue={customer.name}
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-medium text-earth-700">手機號碼（登入帳號）</label>
        <input
          id="phone" name="phone" type="tel" required
          defaultValue={customer.phone}
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <p className="mt-1 text-xs text-earth-400">修改後將自動登出，需用新號碼重新登入</p>
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-earth-700">Email（選填）</label>
        <input
          id="email" name="email" type="email"
          defaultValue={customer.email ?? ""}
          placeholder="example@email.com"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="birthday" className="mb-1 block text-sm font-medium text-earth-700">生日</label>
          <input
            id="birthday" name="birthday" type="date"
            defaultValue={customer.birthday ?? ""}
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {age !== null && (
            <p className="mt-1 text-xs text-earth-400">{age} 歲</p>
          )}
        </div>

        <div>
          <label htmlFor="gender" className="mb-1 block text-sm font-medium text-earth-700">性別</label>
          <select
            id="gender" name="gender"
            defaultValue={customer.gender ?? ""}
            className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">不指定</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="height" className="mb-1 block text-sm font-medium text-earth-700">身高（cm）</label>
        <input
          id="height" name="height" type="number" min="50" max="250" step="0.1"
          defaultValue={customer.height ?? ""}
          placeholder="例：165"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="address" className="mb-1 block text-sm font-medium text-earth-700">地址（選填）</label>
        <input
          id="address" name="address" type="text"
          defaultValue={customer.address ?? ""}
          placeholder="請輸入地址"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-earth-700">備註（選填）</label>
        <textarea
          id="notes" name="notes" rows={2}
          defaultValue={customer.notes ?? ""}
          placeholder="個人備註"
          className="w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm text-earth-900 placeholder:text-earth-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit" disabled={pending}
          className="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {pending ? "儲存中..." : "儲存變更"}
        </button>
        <Link
          href="/book"
          className="flex items-center justify-center rounded-lg border border-earth-300 px-4 py-2.5 text-sm text-earth-600 hover:bg-earth-50"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
