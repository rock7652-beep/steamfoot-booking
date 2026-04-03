import { getStaffDetail } from "@/server/queries/staff";
import { updateStaff } from "@/server/actions/staff";
import {
  getStaffPermissions,
  updateStaffPermissions,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ALL_PERMISSIONS,
  type PermissionCode,
} from "@/lib/permissions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditStaffPage({ params }: PageProps) {
  const { id } = await params;

  const staff = await getStaffDetail(id).catch(() => null);
  if (!staff) notFound();

  // 取得該店長的現有權限
  const currentPerms = staff.isOwner
    ? new Set<PermissionCode>(ALL_PERMISSIONS as unknown as PermissionCode[])
    : await getStaffPermissions(id);

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

  async function handlePermissions(formData: FormData) {
    "use server";

    const perms: Record<string, boolean> = {};
    for (const code of ALL_PERMISSIONS) {
      perms[code] = formData.get(`perm_${code}`) === "on";
    }
    await updateStaffPermissions(id, perms as Record<PermissionCode, boolean>);

    revalidatePath(`/dashboard/staff/${id}/edit`);
    redirect(`/dashboard/staff/${id}/edit`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/staff" className="hover:text-gray-700">店長管理</Link>
        <span>/</span>
        <span className="text-gray-700">編輯</span>
      </div>

      {/* 基本資料 */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h1 className="mb-1 text-lg font-bold text-gray-900">編輯店長資料</h1>
        <p className="mb-5 text-sm text-gray-400">
          {staff.user.name}（{staff.user.email}）
          {staff.isOwner && (
            <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
              Owner
            </span>
          )}
        </p>

        <form action={handleUpdate} className="space-y-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-700">日曆識別色</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                name="colorCode"
                defaultValue={staff.colorCode}
                className="h-10 w-16 cursor-pointer rounded-lg border border-gray-300"
              />
              <span className="text-sm text-gray-500">{staff.colorCode}</span>
            </div>
          </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700">空間費</label>
            <select
              name="spaceFeeEnabled"
              defaultValue={staff.spaceFeeEnabled ? "true" : "false"}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
            >
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          </div>

          <div className="flex gap-3 border-t pt-4">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 active:bg-indigo-800"
            >
              儲存
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

      {/* 權限設定（僅非 Owner 的 Manager 顯示） */}
      {!staff.isOwner && (
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-gray-900">操作權限</h2>
          <p className="mb-4 text-xs text-gray-400">
            設定此店長可操作的功能範圍，勾選為允許。
          </p>

          <form action={handlePermissions} className="space-y-5">
            {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
              <div key={groupKey}>
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  {group.label}
                </h3>
                <div className="space-y-1.5">
                  {group.codes.map((code) => (
                    <label
                      key={code}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        name={`perm_${code}`}
                        defaultChecked={currentPerms.has(code)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">
                        {PERMISSION_LABELS[code]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="border-t pt-4">
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 active:bg-indigo-800"
              >
                儲存權限
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 統計 */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">統計</h2>
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
