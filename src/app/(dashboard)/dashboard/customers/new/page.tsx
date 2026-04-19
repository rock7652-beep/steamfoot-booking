import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCustomer } from "@/server/actions/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { SubmitButton } from "@/components/submit-button";
import { FormErrorToast } from "@/components/form-error-toast";

interface PageProps {}

export default async function NewCustomerPage({}: PageProps) {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "customer.create"))) {
    redirect("/dashboard");
  }

  const staffOptions = await listStaffSelectOptions();

  async function handleSubmit(formData: FormData) {
    "use server";
    const assignedStaffIdRaw = formData.get("assignedStaffId") as string;
    const lineNameRaw = formData.get("lineName") as string;
    const notesRaw = formData.get("notes") as string;

    const result = await createCustomer({
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      email: formData.get("email") as string,
      gender: formData.get("gender") as "male" | "female" | "other",
      birthday: formData.get("birthday") as string,
      lineName: lineNameRaw || undefined,
      notes: notesRaw || undefined,
      assignedStaffId: assignedStaffIdRaw || undefined,
    });

    if (!result.success) {
      redirect(`/dashboard/customers/new?error=${encodeURIComponent(result.error || "新增顧客失敗")}`);
    }

    redirect(`/dashboard/customers/${result.data?.customerId ?? ""}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <FormErrorToast />
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="text-sm text-earth-500 hover:text-earth-700">
          ← 顧客列表
        </Link>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-earth-900">新增顧客</h1>

        <form action={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-earth-700">
              姓名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入顧客姓名"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-earth-700">
              電話 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              required
              pattern="^09\d{8}$"
              title="09 開頭共 10 碼"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="09 開頭共 10 碼"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-earth-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="example@email.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-earth-700">
                性別 <span className="text-red-500">*</span>
              </label>
              <select
                name="gender"
                required
                defaultValue=""
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              >
                <option value="" disabled>請選擇</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>

            {/* Birthday */}
            <div>
              <label className="block text-sm font-medium text-earth-700">
                生日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="birthday"
                required
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              />
            </div>
          </div>

          {/* Line Name — optional */}
          <div>
            <label className="block text-sm font-medium text-earth-700">LINE 名稱</label>
            <input
              type="text"
              name="lineName"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入 LINE 名稱（選填）"
            />
          </div>

          {/* Notes — optional */}
          <div>
            <label className="block text-sm font-medium text-earth-700">備註</label>
            <textarea
              name="notes"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入備註（選填）"
            />
          </div>

          {/* Assigned Staff — 選填 */}
          <div>
            <label className="block text-sm font-medium text-earth-700">
              直屬店長 <span className="text-xs text-earth-400">（選填，可稍後指派）</span>
            </label>
            <select
              name="assignedStaffId"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            >
              <option value="">暫不指派</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-6">
            <SubmitButton
              label="確認新增"
              pendingLabel="新增中..."
              className="bg-primary-600 text-white hover:bg-primary-700"
            />
            <Link
              href="/dashboard/customers"
              className="rounded-lg border border-earth-300 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
