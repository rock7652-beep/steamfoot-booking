import { listStaff } from "@/server/queries/staff";
import { createStaff } from "@/server/actions/staff";
import { getCurrentUser } from "@/lib/session";
import { getShopPlan } from "@/lib/shop-config";
import { FEATURES } from "@/lib/shop-plan";
import { FeatureGate } from "@/components/feature-gate";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StaffStatusToggle } from "./staff-status-toggle";

interface PageProps {}

export default async function StaffPage({}: PageProps) {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (user.role !== "OWNER") notFound();

  const [staffList, shopPlan] = await Promise.all([listStaff(), getShopPlan()]);

  async function handleCreateStaff(formData: FormData) {
    "use server";
    const result = await createStaff({
      name: formData.get("name") as string,
      displayName: formData.get("displayName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      password: formData.get("password") as string,
      colorCode: formData.get("colorCode") as string,
      monthlySpaceFee: formData.get("monthlySpaceFee")
        ? Number(formData.get("monthlySpaceFee"))
        : 0,
    });

    if (!result.success) {
      throw new Error(result.error || "新增店長失敗");
    }

    redirect("/dashboard/staff");
  }

  const STATUS_COLOR: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    INACTIVE: "bg-red-100 text-red-700",
    SUSPENDED: "bg-yellow-100 text-yellow-700",
  };

  return (
    <FeatureGate plan={shopPlan} feature={FEATURES.STAFF_MANAGEMENT}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-earth-500 hover:text-earth-700">
          ← 首頁
        </Link>
      </div>

      {/* Create Form Card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-earth-900">新增店長</h2>

        <form action={handleCreateStaff} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Real Name */}
          <div>
            <label className="block text-sm font-medium text-earth-700">真實姓名</label>
            <input
              type="text"
              name="name"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入真實姓名"
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-earth-700">顯示名稱</label>
            <input
              type="text"
              name="displayName"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入顯示名稱（客戶端顯示用）"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-earth-700">Email</label>
            <input
              type="email"
              name="email"
              required
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入 Email"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-earth-700">電話（選填）</label>
            <input
              type="tel"
              name="phone"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入電話"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-earth-700">密碼</label>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="至少 6 個字元"
            />
          </div>

          {/* Color Code */}
          <div>
            <label className="block text-sm font-medium text-earth-700">顏色代碼（選填）</label>
            <input
              type="color"
              name="colorCode"
              defaultValue="#6366f1"
              className="mt-1 block h-10 w-full rounded-lg border border-earth-300"
            />
          </div>

          {/* Monthly Space Fee */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-earth-700">
              月度空間費（元，選填）
            </label>
            <input
              type="number"
              name="monthlySpaceFee"
              min="0"
              step="1"
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="輸入月度費用，預設 0"
            />
          </div>

          {/* Submit Button */}
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              新增店長
            </button>
          </div>
        </form>
      </div>

      {/* Staff List Card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-earth-900">店長列表</h2>

        {staffList.length === 0 ? (
          <p className="text-earth-400">暫無店長</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-earth-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-earth-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">姓名</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">電話</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">狀態</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">顧客數</th>
                  <th className="px-4 py-3 text-left font-medium text-earth-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-earth-100">
                {staffList.map((staff) => (
                  <tr key={staff.id} className="hover:bg-earth-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-earth-900">
                          {staff.displayName}
                        </div>
                        <div className="text-xs text-earth-500">{staff.user.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-earth-600">{staff.user.email}</td>
                    <td className="px-4 py-3 text-earth-600">
                      {staff.user.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          STATUS_COLOR[staff.status] ||
                          "bg-earth-100 text-earth-700"
                        }`}
                      >
                        {staff.status === "ACTIVE"
                          ? "啟用"
                          : staff.status === "INACTIVE"
                            ? "停用"
                            : "已停權"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-earth-600">
                      {staff._count.assignedCustomers}
                    </td>
                    <td className="px-4 py-3">
                      {!staff.isOwner && (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/staff/${staff.id}/edit`}
                            className="text-sm text-primary-600 hover:underline"
                          >
                            編輯
                          </Link>
                          <StaffStatusToggle staffId={staff.id} currentStatus={staff.status} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </FeatureGate>
  );
}
