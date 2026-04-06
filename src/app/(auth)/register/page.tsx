"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { customerRegisterAction, type RegisterState } from "@/server/actions/customer-auth";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    customerRegisterAction,
    { error: null }
  );

  // 若後台建立的顧客，導向開通頁面
  useEffect(() => {
    if (state.error === "NEEDS_ACTIVATION") {
      const form = document.querySelector("form");
      const phoneInput = form?.querySelector<HTMLInputElement>('input[name="phone"]');
      const phone = phoneInput?.value ?? "";
      router.push(`/activate?phone=${encodeURIComponent(phone)}`);
    }
  }, [state.error, router]);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-earth-900">註冊新帳號</h1>
        <p className="mt-1 text-sm text-earth-500">蒸足健康站會員</p>
      </div>

      <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
        <form action={formAction} className="space-y-4">
          {state.error && state.error !== "NEEDS_ACTIVATION" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}

          {/* 必填 */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-earth-700">
              姓名
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="請輸入姓名"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-earth-700">
              手機號碼
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="0912345678"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-earth-400">此為登入帳號，09 開頭共 10 碼</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-earth-700">
              密碼
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="至少 4 位數字"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-earth-700">
              確認密碼
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              placeholder="再次輸入密碼"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* 選填 */}
          <div className="border-t border-earth-200 pt-4">
            <p className="mb-3 text-xs text-earth-400">以下為選填</p>

            <div className="space-y-4">
              <div>
                <label htmlFor="gender" className="block text-sm font-medium text-earth-700">
                  性別
                </label>
                <select
                  id="gender"
                  name="gender"
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">不指定</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="other">其他</option>
                </select>
              </div>

              <div>
                <label htmlFor="birthday" className="block text-sm font-medium text-earth-700">
                  生日
                </label>
                <input
                  id="birthday"
                  name="birthday"
                  type="date"
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-earth-700">
                  備註
                </label>
                <input
                  id="notes"
                  name="notes"
                  type="text"
                  placeholder="選填"
                  className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {pending ? "註冊中..." : "註冊"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-earth-500 hover:text-earth-700">
            已有帳號？返回登入
          </Link>
        </div>
      </div>
    </div>
  );
}
