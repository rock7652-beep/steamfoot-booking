import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCustomer } from "@/server/actions/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";

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
    const emailRaw = formData.get("email") as string;
    const notesRaw = formData.get("notes") as string;

    const result = await createCustomer({
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      email: emailRaw || undefined,
      lineName: lineNameRaw || undefined,
      notes: notesRaw || undefined,
      assignedStaffId: assignedStaffIdRaw || undefined,
    });

    if (!result.success) {
      throw new Error(result.error || "新增顧客失敗");
    }

    redirect(`/dashboard/customers/${result.data?.customerId ?? ""}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
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
            <label className="block text-sm font-medium text-earth-700">姓名</label>
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
            <label className="block text-sm font-medium text-earth-700">電話</label>
            <input
              type="tel"
              name="phone"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入電話號碼"
            />
          </div>

          {/* Line Name */}
          <div>
            <label className="block text-sm font-medium text-earth-700">LINE 名稱</label>
            <input
              type="text"
              name="lineName"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入 LINE 名稱（選填）"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-earth-700">備註</label>
            <textarea
              name="notes"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入備註（選填）"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-earth-700">Email</label>
            <input
              type="email"
              name="email"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入 Email（選填，供 Google 綁定比對）"
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
