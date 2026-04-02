import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCustomer } from "@/server/actions/customer";
import { getCurrentUser } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

interface PageProps {}

export default async function NewCustomerPage({}: PageProps) {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (user.role === "CUSTOMER") redirect("/book");

  const staffOptions = await listStaffSelectOptions();

  async function handleSubmit(formData: FormData) {
    "use server";
    const result = await createCustomer({
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      lineName: formData.get("lineName") as string,
      notes: formData.get("notes") as string,
      assignedStaffId: formData.get("assignedStaffId") as string,
    });

    if (!result.success) {
      throw new Error(result.error || "新增顧客失敗");
    }

    redirect(`/dashboard/customers/${result.data!.customerId}`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="text-sm text-gray-500 hover:text-gray-700">
          ← 顧客列表
        </Link>
      </div>

      {/* Form Card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-bold text-gray-900">新增顧客</h1>

        <form action={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">姓名</label>
            <input
              type="text"
              name="name"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入顧客姓名"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700">電話</label>
            <input
              type="tel"
              name="phone"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入電話號碼"
            />
          </div>

          {/* Line Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">LINE 名稱</label>
            <input
              type="text"
              name="lineName"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入 LINE 名稱（選填）"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700">備註</label>
            <textarea
              name="notes"
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="輸入備註（選填）"
            />
          </div>

          {/* Assigned Staff */}
          <div>
            <label className="block text-sm font-medium text-gray-700">直屬店長</label>
            <select
              name="assignedStaffId"
              required={user.role === "OWNER"}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">
                {user.role === "OWNER" ? "請選擇店長" : "（自動分配）"}
              </option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-6">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              確認新增
            </button>
            <Link
              href="/dashboard/customers"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
