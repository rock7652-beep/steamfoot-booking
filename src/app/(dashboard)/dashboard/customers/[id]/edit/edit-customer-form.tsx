"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateCustomer } from "@/server/actions/customer";
import { normalizePhone, normalizeEmail } from "@/lib/normalize";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  FormShell,
  FormSection,
  FormGrid,
  StickyFormActions,
} from "@/components/desktop";

interface CustomerData {
  id: string;
  name: string;
  phone: string;
  email: string;
  gender: string;
  birthday: string;
  height: number | null;
  notes: string;
  lineName: string;
}

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export function EditCustomerForm({ customer }: { customer: CustomerData }) {
  const router = useRouter();

  const [state, action, pending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      const heightStr = (formData.get("height") as string) ?? "";
      const height = parseFloat(heightStr);
      const input = {
        name: ((formData.get("name") as string) ?? "").trim(),
        phone: normalizePhone((formData.get("phone") as string) ?? ""),
        email: normalizeEmail((formData.get("email") as string) ?? ""),
        gender: (formData.get("gender") as string) as "male" | "female" | "other",
        birthday: ((formData.get("birthday") as string) ?? "").trim(),
        height: isNaN(height) ? 0 : height,
        lineName: ((formData.get("lineName") as string) ?? "") || null,
        notes: ((formData.get("notes") as string) ?? "") || null,
      };

      const result = await updateCustomer(customer.id, input);
      if (result.success) {
        toast.success("已儲存");
        router.push(`/dashboard/customers/${customer.id}`);
        router.refresh();
        return { error: null };
      }
      toast.error(result.error ?? "更新失敗");
      return { error: result.error ?? "更新失敗" };
    },
    { error: null },
  );

  return (
    <FormShell width="md">
      <form action={action} className="space-y-6 pb-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 左欄 */}
          <div className="space-y-6">
            <FormSection title="基本資料" description="姓名與聯絡方式（必填）">
              <div>
                <label className={labelCls}>
                  姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={customer.name}
                  className={`mt-1 ${inputCls}`}
                />
              </div>

              <FormGrid>
                <div>
                  <label className={labelCls}>
                    電話 <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="phone"
                    type="tel"
                    required
                    pattern="^(09\d{8}|09\d{2}[\s-]?\d{3}[\s-]?\d{3})$"
                    title="09 開頭共 10 碼，可含空格或 -"
                    defaultValue={customer.phone}
                    className={`mt-1 ${inputCls}`}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={customer.email}
                    className={`mt-1 ${inputCls}`}
                  />
                </div>
              </FormGrid>
            </FormSection>

            <FormSection title="個人資訊">
              <FormGrid>
                <div>
                  <label className={labelCls}>
                    性別 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="gender"
                    required
                    defaultValue={customer.gender}
                    className={`mt-1 ${inputCls}`}
                  >
                    <option value="" disabled>
                      請選擇
                    </option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>
                    生日 <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="birthday"
                    type="date"
                    required
                    defaultValue={customer.birthday}
                    className={`mt-1 ${inputCls}`}
                  />
                </div>
              </FormGrid>
              <div>
                <label className={labelCls}>
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
                  className={`mt-1 ${inputCls}`}
                />
              </div>
            </FormSection>
          </div>

          {/* 右欄 */}
          <div className="space-y-6">
            <FormSection title="系統關聯">
              <div>
                <label className={labelCls}>
                  LINE 名稱
                  <span className="ml-1 text-xs text-earth-400">
                    （LINE 綁定後會自動填入）
                  </span>
                </label>
                <input
                  name="lineName"
                  type="text"
                  defaultValue={customer.lineName}
                  className={`mt-1 ${inputCls}`}
                />
              </div>
            </FormSection>
          </div>
        </div>

        {/* 備註 — 滿版 */}
        <FormSection title="備註">
          <textarea
            name="notes"
            rows={4}
            defaultValue={customer.notes}
            className={inputCls}
            placeholder="特殊需求、健康狀況、偏好時段（選填）"
          />
        </FormSection>

        {state.error ? (
          <p className="text-sm text-red-600">{state.error}</p>
        ) : null}

        <StickyFormActions info={<span>儲存後會回到顧客詳情</span>}>
          <Link
            href={`/dashboard/customers/${customer.id}`}
            className="rounded-lg border border-earth-300 bg-white px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                儲存中...
              </>
            ) : (
              "儲存"
            )}
          </button>
        </StickyFormActions>
      </form>
    </FormShell>
  );
}
