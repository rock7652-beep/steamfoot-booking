import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCustomer } from "@/server/actions/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubmitButton } from "@/components/submit-button";
import { FormErrorToast } from "@/components/form-error-toast";
import {
  PageShell,
  PageHeader,
  FormShell,
  FormSection,
  FormGrid,
  StickyFormActions,
} from "@/components/desktop";

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ existingCustomerId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "customer.create"))) {
    redirect("/dashboard");
  }

  const staffOptions = await listStaffSelectOptions();
  const { existingCustomerId } = await searchParams;

  async function handleSubmit(formData: FormData) {
    "use server";
    const assignedStaffIdRaw = (formData.get("assignedStaffId") as string) || "";
    const lineNameRaw = (formData.get("lineName") as string) || "";
    const notesRaw = (formData.get("notes") as string) || "";

    const result = await createCustomer({
      name: ((formData.get("name") as string) ?? "").trim(),
      phone: normalizePhone((formData.get("phone") as string) ?? ""),
      email: normalizeEmail((formData.get("email") as string) ?? ""),
      gender: formData.get("gender") as "male" | "female" | "other",
      birthday: (formData.get("birthday") as string) ?? "",
      lineName: lineNameRaw || undefined,
      notes: notesRaw || undefined,
      assignedStaffId: assignedStaffIdRaw || undefined,
    });

    if (!result.success) {
      const params = new URLSearchParams();
      params.set("error", result.error || "新增顧客失敗");
      if (result.existingCustomerId) {
        params.set("existingCustomerId", result.existingCustomerId);
      }
      redirect(`/dashboard/customers/new?${params.toString()}`);
    }

    redirect(`/dashboard/customers?saved=${encodeURIComponent("已新增顧客")}`);
  }

  return (
    <PageShell>
      <FormErrorToast />

      <PageHeader
        title="新增顧客"
        subtitle="填妥基本資料後建檔，之後可隨時編輯"
        actions={
          <Link
            href="/dashboard/customers"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 顧客列表
          </Link>
        }
      />

      {existingCustomerId ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">
            此手機或 Email 已存在於本店
          </p>
          <p className="mt-1 text-amber-800">
            請前往既有顧客資料確認，避免建立重複的客戶。
          </p>
          <Link
            href={`/dashboard/customers/${existingCustomerId}`}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            前往既有顧客 →
          </Link>
        </div>
      ) : null}

      <FormShell width="md">
        <form action={handleSubmit} className="space-y-6 pb-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* 左欄：基本資料 + 個人資訊 */}
            <div className="space-y-6">
              <FormSection title="基本資料" description="姓名與聯絡方式（必填）">
                <div>
                  <label className={labelCls}>
                    姓名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className={`mt-1 ${inputCls}`}
                    placeholder="輸入顧客姓名"
                  />
                </div>

                <FormGrid>
                  <div>
                    <label className={labelCls}>
                      電話 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      pattern="^(09\d{8}|09\d{2}[\s-]?\d{3}[\s-]?\d{3})$"
                      title="09 開頭共 10 碼，可含空格或 -"
                      className={`mt-1 ${inputCls}`}
                      placeholder="0912345678"
                    />
                    <p className="mt-1 text-[11px] text-earth-400">
                      可直接貼上 0912-345-678，系統會自動轉成 10 碼
                    </p>
                  </div>
                  <div>
                    <label className={labelCls}>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      className={`mt-1 ${inputCls}`}
                      placeholder="example@email.com"
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
                      defaultValue=""
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
                      type="date"
                      name="birthday"
                      required
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>
                </FormGrid>
              </FormSection>
            </div>

            {/* 右欄：系統關聯 */}
            <div className="space-y-6">
              <FormSection title="系統關聯" description="可稍後再指派">
                <div>
                  <label className={labelCls}>
                    直屬店長 / 教練
                    <span className="ml-1 text-xs text-earth-400">（選填）</span>
                  </label>
                  <select name="assignedStaffId" className={`mt-1 ${inputCls}`}>
                    <option value="">暫不指派</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>
                    LINE 名稱
                    <span className="ml-1 text-xs text-earth-400">（選填）</span>
                  </label>
                  <input
                    type="text"
                    name="lineName"
                    className={`mt-1 ${inputCls}`}
                    placeholder="顧客 LINE 暱稱"
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
              className={inputCls}
              placeholder="特殊需求、健康狀況、偏好時段（選填）"
            />
          </FormSection>

          <StickyFormActions
            info={<span>儲存後會回到顧客列表</span>}
          >
            <Link
              href="/dashboard/customers"
              className="rounded-lg border border-earth-300 bg-white px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              取消
            </Link>
            <SubmitButton
              label="確認新增"
              pendingLabel="新增中..."
              className="bg-primary-600 text-white hover:bg-primary-700"
            />
          </StickyFormActions>
        </form>
      </FormShell>
    </PageShell>
  );
}
