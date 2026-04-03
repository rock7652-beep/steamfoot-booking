import { getStaffDetail } from "@/server/queries/staff";
import { updateStaff } from "@/server/actions/staff";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditStaffPage({ params }: PageProps) {
  const { id } = await params;

  const staff = await getStaffDetail(id).catch(() => null);
  if (!staff) notFound();

  async function handleUpdate(formData: FormData) {
    "use server";
    const monthlyFeeRaw = formData.get("monthlySpaceFee") as string;
    const result = await updateStaff(id, {
      displayName: formData.get("displayName") as string,
      colorCode: formData.get("colorCode") as string,
      monthlySpaceFee: monthlyFeeRaw ? Number(monthlyFeeRaw) : 0,
      spaceFeeEnabled: formData.get("spaceFeeEnabled") === "true",
    });

    if (!result.success) {
      throw new Error(result.error || "更新失敗");
    }

    redirect("/dashboard/staff");
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-700">首頁</Link>
        <span>/</span>
        <Link href="/dashboard/staff" className="hover:text-gray-700">店長管理</Link>
        <span>/</span>
        <span className="text-gray-700">編輯店長</span>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-gray-900">編輯店長資料</h1>
        <p className="mb-6 text-sm text-gray-400">
          帳號：{staff.user.name}（{staff.user.email}）
        </p>

        <form action={handleUpdate} className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">顯示名稱</label>
            <input
              type="text"
              name="displayName"
              required
              defaultValue={staff.displayName}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Color Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700">日曆識別色</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                name="colorCode"
                defaultValue={staff.colorCode}
                className="h-10 w-16 cursor-pointer rounded-lg border border-gray-300"
              />
              <span className="text-sm text-gray-500">目前：{staff.colorCode}</span>
            </div>
          </div>

          {/* Monthly Space Fee */}
          <div>
            <label className="block text-sm font-medium text-gray-700">每月空間費（元）</label>
            <input
              type="number"
              name="monthlySpaceFee"
              min="0"
              step="1"
              defaultValue={Number(staff.monthlySpaceFee)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Space Fee Enabled */}
          <div>
            <label className="block text-sm font-medium text-gray-700">空間費狀態</label>
            <select
              name="spaceFeeEnabled"
              defaultValue={staff.spaceFeeEnabled ? "true" : "false"}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
            >
              <option value="true">啟用（每月自動產生帳單）</option>
              <option value="false">停用</option>
            </select>
          </div>

          {/* Info row */}
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            帳號資訊（Email / 電話 / 密碼）請由系統管理員在資料庫直接修改。
          </div>

          {/* Buttons */}
          <div className="flex gap-3 border-t pt-5">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              儲存變更
            </button>
            <Link
              href="/dashboard/staff"
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </Link>
          </div>
        </form>
      </div>

      {/* Stats */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">統計資料</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-gray-500">名下顧客</p>
            <p className="text-xl font-bold text-gray-900">{staff._count.assignedCustomers}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-gray-500">歷史預約</p>
            <p className="text-xl font-bold text-gray-900">{staff._count.revenueBookings}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
