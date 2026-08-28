import { getStaffDetail } from "@/server/queries/staff";
import { updateStaff, updateStaffPermissionsAction } from "@/server/actions/staff";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { SubmitButton } from "@/components/submit-button";
import {
  getStaffPermissions,
  checkPermission,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ALL_PERMISSIONS,
  ROLE_LABELS,
  type PermissionCode,
} from "@/lib/permissions";
import type { UserRole } from "@prisma/client";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  isSpaDemoStoreId,
  SPA_DEMO_PROVIDERS,
} from "@/lib/spa-demo-store";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}

export default async function EditStaffPage({ params, searchParams }: PageProps) {
  const { err } = await searchParams;
  const user = await getCurrentUser();
  if (!user) notFound();
  const activeStoreId = await getActiveStoreForRead(user);
  if (user.role !== "OWNER" && !(user.role === "ADMIN" && activeStoreId)) notFound();

  const { id } = await params;

  const staff = await getStaffDetail(id, activeStoreId).catch(() => null);
  if (!staff) notFound();
  const spaProvider = isSpaDemoStoreId(activeStoreId)
    ? SPA_DEMO_PROVIDERS.find((provider) => provider.id === staff.id) ?? null
    : null;

  // 取得該店長的現有權限
  const currentPerms = staff.isOwner
    ? new Set<PermissionCode>(ALL_PERMISSIONS as unknown as PermissionCode[])
    : await getStaffPermissions(id, activeStoreId!);

  // Layer 1：是否可管理店員（ADMIN 由 checkPermission 自動 true；
  // 否則須具 staff.manage）。false → 頁面唯讀，不顯示變更用 UI。
  const canManageStaff = await checkPermission(
    user.role,
    user.staffId,
    "staff.manage",
  );

  async function handleUpdate(formData: FormData) {
    "use server";
    const monthlyFeeRaw = formData.get("monthlySpaceFee") as string;
    const roleValue = formData.get("role") as string | null;
    const result = await updateStaff(id, {
      displayName: formData.get("displayName") as string,
      colorCode: formData.get("colorCode") as string,
      monthlySpaceFee: monthlyFeeRaw ? Number(monthlyFeeRaw) : 0,
      spaceFeeEnabled: formData.get("spaceFeeEnabled") === "true",
      ...(roleValue ? { role: roleValue as "OWNER" | "PARTNER" } : {}),
    });

    if (!result.success) {
      // Layer 2：不 throw（會炸 error boundary）→ 帶 err 導回本頁顯示紅字
      redirect(
        `/dashboard/staff/${id}/edit?err=${encodeURIComponent(result.error || "更新失敗")}`,
      );
    }

    redirect("/dashboard/staff");
  }

  async function handlePermissions(formData: FormData) {
    "use server";

    const perms: Record<string, boolean> = {};
    for (const code of ALL_PERMISSIONS) {
      perms[code] = formData.get(`perm_${code}`) === "on";
    }
    // 走有守門的 action（server 端把關 staff.manage + 階層 + 防自鎖），
    // 不再直呼 updateStaffPermissions（原本 server 端零守門）。
    const result = await updateStaffPermissionsAction(
      id,
      perms as Record<PermissionCode, boolean>,
    );
    if (!result.success) {
      // Layer 2：不 throw → 帶 err 導回本頁顯示紅字，不進 error boundary
      redirect(
        `/dashboard/staff/${id}/edit?err=${encodeURIComponent(result.error || "更新權限失敗")}`,
      );
    }
    revalidatePath(`/dashboard/staff/${id}/edit`);
    redirect(`/dashboard/staff/${id}/edit`);
  }

  // Owner（系統管理者）沒有權限設定區塊，維持原本窄版；其他員工 (含 PARTNER) 才用桌機版加寬。
  const containerWidth = staff.isOwner ? "max-w-lg" : "max-w-6xl";

  return (
    <div className={`mx-auto ${containerWidth} space-y-6 px-4 py-4`}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-earth-500">
        <Link href="/dashboard/staff" className="hover:text-earth-700">人員管理</Link>
        <span>/</span>
        <span className="text-earth-700">編輯</span>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {!canManageStaff ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          您沒有店員管理權限，僅可檢視；如需調整角色或權限，請聯繫具權限的管理者或系統管理者。
        </div>
      ) : null}

      {/* 桌機 / iPad 橫向：基本資料 + 權限並排（基本資料 1 欄、權限 2 欄寬）；
          手機 / iPad 直向（< lg）：上下單欄堆疊維持既有體驗。 */}
      <div className={`grid grid-cols-1 gap-6 ${!staff.isOwner ? "lg:grid-cols-3" : ""}`}>
        {/* 基本資料 */}
        <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-1 lg:self-start">
        <h1 className="mb-1 text-lg font-bold text-earth-900">編輯員工資料</h1>
        <p className="mb-5 text-sm text-earth-400">
          {staff.user.name}（{staff.user.email}）
          <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${
            staff.isOwner ? "bg-yellow-100 text-yellow-700" : "bg-primary-100 text-primary-700"
          }`}>
            {staff.isOwner ? "系統管理者" : ROLE_LABELS[staff.user.role as UserRole] ?? staff.user.role}
          </span>
        </p>

        <form action={handleUpdate} className="space-y-4">
          {/* 角色選擇（僅非 Owner 且具店員管理權限者可修改） */}
          {!staff.isOwner && canManageStaff && (
            <div>
              <label className="block text-sm font-medium text-earth-700">角色</label>
              <select
                name="role"
                defaultValue={staff.user.role}
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              >
                <option value="OWNER">店長（主要經營者）</option>
                <option value="PARTNER">合作店長</option>
              </select>
              <p className="mt-1 text-xs text-earth-400">變更角色不會自動調整已設定的權限，請在下方手動調整</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-earth-700">顯示名稱</label>
            <input
              type="text"
              name="displayName"
              required
              defaultValue={staff.displayName}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-earth-700">日曆識別色</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                name="colorCode"
                defaultValue={staff.colorCode}
                className="h-10 w-16 cursor-pointer rounded-lg border border-earth-300"
              />
              <span className="text-sm text-earth-500">{staff.colorCode}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-earth-700">每月空間費（元）</label>
            <input
              type="number"
              name="monthlySpaceFee"
              min="0"
              step="1"
              defaultValue={Number(staff.monthlySpaceFee)}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-earth-700">空間費</label>
            <select
              name="spaceFeeEnabled"
              defaultValue={staff.spaceFeeEnabled ? "true" : "false"}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none"
            >
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          </div>

          <div className="flex gap-3 border-t pt-4">
            {canManageStaff && (
              <SubmitButton label="儲存" pendingLabel="儲存中..." className="bg-primary-600 text-white hover:bg-primary-700" />
            )}
            <Link
              href="/dashboard/staff"
              className="rounded-lg border border-earth-300 px-5 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              {canManageStaff ? "取消" : "返回"}
            </Link>
          </div>
        </form>

        {spaProvider && (
          <section className="mt-5 space-y-3 border-t border-earth-100 pt-5">
            <div>
              <h2 className="text-sm font-semibold text-earth-900">專業與接客設定</h2>
              <p className="mt-0.5 text-xs text-earth-400">SPA 示範店人員資料</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-earth-400">專業項目</dt>
                <dd className="mt-0.5 text-earth-700">{spaProvider.specialties}</dd>
              </div>
              <div>
                <dt className="text-xs text-earth-400">緊急聯絡人</dt>
                <dd className="mt-0.5 text-earth-700">
                  {spaProvider.emergencyContact.name}（{spaProvider.emergencyContact.relation}）
                  <span className="ml-2 tabular-nums text-earth-500">{spaProvider.emergencyContact.phone}</span>
                </dd>
              </div>
            </dl>
            <Link
              href="/dashboard/staff"
              className="inline-flex rounded-lg border border-earth-300 px-3 py-2 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              返回人員管理設定專業與班表
            </Link>
          </section>
        )}
      </div>

      {/* 權限設定（僅非 Owner 員工、且操作者具店員管理權限時顯示） */}
      {!staff.isOwner && canManageStaff && (
        <div className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-1 text-lg font-bold text-earth-900">操作權限</h2>
          <p className="mb-4 text-xs text-earth-400">
            設定此員工可操作的功能範圍，勾選為允許。角色預設權限已自動帶入，可依需求額外增減。
          </p>

          <form action={handlePermissions} className="space-y-5">
            {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
              <div key={groupKey}>
                <h3 className="mb-2 text-sm font-semibold text-earth-700">
                  {group.label}
                </h3>
                {/* 桌機 / iPad 橫向（md 以上）兩欄排列，手機保持單欄 */}
                <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 md:grid-cols-2">
                  {group.codes.map((code) => (
                    <label
                      key={code}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-earth-50"
                    >
                      <input
                        type="checkbox"
                        name={`perm_${code}`}
                        defaultChecked={currentPerms.has(code)}
                        className="h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-earth-700">
                        {PERMISSION_LABELS[code]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="border-t pt-4">
              <SubmitButton label="儲存權限" pendingLabel="儲存中..." className="bg-primary-600 text-white hover:bg-primary-700" />
            </div>
          </form>
        </div>
      )}
      </div>

      {/* 統計 */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-earth-700">統計</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-earth-50 p-3">
            <p className="text-earth-500">名下顧客</p>
            <p className="text-xl font-bold text-earth-900">{staff._count.assignedCustomers}</p>
          </div>
          <div className="rounded-lg bg-earth-50 p-3">
            <p className="text-earth-500">歷史預約</p>
            <p className="text-xl font-bold text-earth-900">{staff._count.revenueBookings}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
