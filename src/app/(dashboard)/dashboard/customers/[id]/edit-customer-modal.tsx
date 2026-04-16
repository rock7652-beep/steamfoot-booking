"use client";

import { useState, useActionState } from "react";
import { updateCustomer } from "@/server/actions/customer";
import { toast } from "sonner";

interface CustomerData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  birthday: string | null; // ISO date string (YYYY-MM-DD)
  height: number | null;
  notes: string | null;
  lineName: string | null;
}

export function EditCustomerModal({ customer }: { customer: CustomerData }) {
  const [open, setOpen] = useState(false);

  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }) => {
      const form = document.getElementById("edit-customer-form") as HTMLFormElement;
      const fd = new FormData(form);

      const input: Record<string, unknown> = {
        name: fd.get("name") as string,
        phone: fd.get("phone") as string,
        email: (fd.get("email") as string) || null,
        gender: (fd.get("gender") as string) || null,
        birthday: (fd.get("birthday") as string) || null,
        notes: (fd.get("notes") as string) || null,
        lineName: (fd.get("lineName") as string) || null,
      };

      const heightStr = fd.get("height") as string;
      if (heightStr) {
        const h = parseFloat(heightStr);
        if (!isNaN(h)) input.height = h;
      } else {
        input.height = null;
      }

      const result = await updateCustomer(customer.id, input);
      if (result.success) {
        toast.success("顧客資料已更新");
        setOpen(false);
        return { error: null };
      }
      toast.error(result.error ?? "更新失敗");
      return { error: result.error ?? "更新失敗" };
    },
    { error: null }
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 transition hover:bg-earth-50"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
        編輯資料
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 transition hover:bg-earth-50"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
        編輯資料
      </button>

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="absolute inset-0 bg-earth-900/40 backdrop-blur-[2px]" onClick={() => !pending && setOpen(false)} />
        <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <button
            type="button"
            onClick={() => !pending && setOpen(false)}
            className="absolute right-3 top-3 rounded-lg p-1 text-earth-400 hover:bg-earth-100 hover:text-earth-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h3 className="mb-4 text-lg font-bold text-earth-900">編輯顧客資料</h3>

          <form id="edit-customer-form" action={action} className="space-y-3">
            {/* 名稱 */}
            <div>
              <label className="block text-sm font-medium text-earth-700">
                名稱 <span className="text-red-500">*</span>
              </label>
              <input
                name="name"
                type="text"
                defaultValue={customer.name}
                required
                className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* 電話 */}
            <div>
              <label className="block text-sm font-medium text-earth-700">
                手機號碼 <span className="text-red-500">*</span>
              </label>
              <input
                name="phone"
                type="tel"
                required
                defaultValue={customer.phone}
                className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-earth-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={customer.email ?? ""}
                className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* 性別 */}
              <div>
                <label className="block text-sm font-medium text-earth-700">
                  性別 <span className="text-red-500">*</span>
                </label>
                <select
                  name="gender"
                  required
                  defaultValue={customer.gender ?? ""}
                  className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="" disabled>請選擇</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                  <option value="other">其他</option>
                </select>
              </div>

              {/* 生日 */}
              <div>
                <label className="block text-sm font-medium text-earth-700">
                  生日 <span className="text-red-500">*</span>
                </label>
                <input
                  name="birthday"
                  type="date"
                  required
                  defaultValue={customer.birthday ?? ""}
                  className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* 身高 */}
            <div>
              <label className="block text-sm font-medium text-earth-700">
                身高 (cm) <span className="text-red-500">*</span>
              </label>
              <input
                name="height"
                type="number"
                step="0.1"
                min="50"
                max="250"
                required
                defaultValue={customer.height ?? ""}
                className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* LINE 名稱 */}
            <div>
              <label className="block text-sm font-medium text-earth-700">
                LINE 名稱 <span className="text-red-500">*</span>
              </label>
              <input
                name="lineName"
                type="text"
                required
                defaultValue={customer.lineName ?? ""}
                className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* 備註 */}
            <div>
              <label className="block text-sm font-medium text-earth-700">備註</label>
              <textarea
                name="notes"
                rows={2}
                defaultValue={customer.notes ?? ""}
                className="mt-1 w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    儲存中...
                  </span>
                ) : (
                  "儲存"
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-earth-200 px-4 py-2.5 text-sm text-earth-600 transition hover:bg-earth-50 disabled:opacity-60"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
