import { listStaff } from "@/server/queries/staff";
import { createStaff } from "@/server/actions/staff";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, ROLE_LABELS } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { getActiveStoreForRead } from "@/lib/store";
import { cookies } from "next/headers";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { EmptyState } from "@/components/ui/empty-state";
import { notFound, redirect } from "next/navigation";
import {
  PageShell,
  PageHeader,
  KpiStrip,
  FormShell,
  FormSection,
  FormGrid,
  StickyFormActions,
  type KpiStripItem,
} from "@/components/desktop";
import { SubmitButton } from "@/components/submit-button";
import { StaffStatusToggle } from "./staff-status-toggle";
import type { UserRole } from "@prisma/client";

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "staff.view"))) notFound();

  const activeStoreId = await getActiveStoreForRead(user);
  const adminActiveStoreCookie =
    user.role === "ADMIN"
      ? (await cookies()).get("active-store-id")?.value ?? null
      : null;
  const adminMissingStore =
    user.role === "ADMIN" && (!adminActiveStoreCookie || adminActiveStoreCookie === "__all__");
  const canManageStaff =
    user.role === "OWNER" || (user.role === "ADMIN" && !adminMissingStore);
  const [staffList, plan] = await Promise.all([listStaff(activeStoreId), getCurrentStorePlan()]);

  async function handleCreateStaff(formData: FormData) {
    "use server";
    const roleValue = (formData.get("role") as string) || "OWNER";
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
      role: roleValue as "OWNER" | "PARTNER",
    });

    if (!result.success) {
      throw new Error(result.error || "新增店長失敗");
    }

    redirect("/dashboard/staff");
  }

  const STATUS_COLOR: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-700",
    INACTIVE: "bg-red-100 text-red-700",
  };

  const totalCount = staffList.length;
  const activeCount = staffList.filter((s) => s.status === "ACTIVE").length;
  const inactiveCount = totalCount - activeCount;

  const kpis: KpiStripItem[] = [
    { label: "員工總數", value: totalCount, tone: "earth" },
    { label: "啟用中", value: activeCount, tone: "primary" },
    { label: "停用中", value: inactiveCount, tone: "amber" },
  ];

  return (
    <FeatureGate plan={plan} feature={FEATURES.STAFF_MANAGEMENT}>
      <PageShell>
        <PageHeader
          title="人員管理"
          subtitle="建立員工、指派角色與可視範圍"
          actions={
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 返回設定
            </Link>
          }
        />

        <KpiStrip items={kpis} />

        {adminMissingStore && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            目前尚未選擇操作店家，請從 HQ 選擇店家後再管理人員。
          </div>
        )}

        {canManageStaff && (
          <FormShell width="md">
            <form action={handleCreateStaff} className="space-y-6 pb-4">
              <FormSection
                title="新增員工"
                description="系統會根據角色自動帶入預設權限，建立後可在編輯頁調整"
              >
                <div>
                  <label className={labelCls}>角色</label>
                  <select name="role" defaultValue="OWNER" className={`mt-1 ${inputCls}`}>
                    <option value="OWNER">店長（主要經營者）</option>
                    <option value="PARTNER">合作店長</option>
                  </select>
                </div>

                <FormGrid>
                  <div>
                    <label className={labelCls}>
                      真實姓名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      className={`mt-1 ${inputCls}`}
                      placeholder="輸入真實姓名"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      顯示名稱 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="displayName"
                      required
                      className={`mt-1 ${inputCls}`}
                      placeholder="顧客端顯示用"
                    />
                  </div>
                </FormGrid>

                <FormGrid>
                  <div>
                    <label className={labelCls}>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      className={`mt-1 ${inputCls}`}
                      placeholder="登入用 Email"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      電話 <span className="text-xs text-earth-400">（選填）</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      className={`mt-1 ${inputCls}`}
                      placeholder="09 開頭共 10 碼"
                    />
                  </div>
                </FormGrid>

                <FormGrid>
                  <div>
                    <label className={labelCls}>
                      密碼 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={6}
                      className={`mt-1 ${inputCls}`}
                      placeholder="至少 6 個字元"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      顏色代碼 <span className="text-xs text-earth-400">（預約卡顯示用）</span>
                    </label>
                    <input
                      type="color"
                      name="colorCode"
                      defaultValue="#6366f1"
                      className="mt-1 block h-10 w-full rounded-lg border border-earth-300"
                    />
                  </div>
                </FormGrid>

                <div>
                  <label className={labelCls}>
                    月度空間費 <span className="text-xs text-earth-400">（元，選填，預設 0）</span>
                  </label>
                  <input
                    type="number"
                    name="monthlySpaceFee"
                    min="0"
                    step="1"
                    className={`mt-1 ${inputCls}`}
                    placeholder="0"
                  />
                </div>
              </FormSection>

              <StickyFormActions info={<span>建立後會回到人員清單</span>}>
                <SubmitButton
                  label="新增店長"
                  pendingLabel="建立中..."
                  className="bg-primary-600 text-white hover:bg-primary-700"
                />
              </StickyFormActions>
            </form>
          </FormShell>
        )}

        {/* 員工清單 */}
        <section className="rounded-xl border border-earth-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-earth-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-earth-900">員工列表</h2>
            <span className="text-xs text-earth-500">{totalCount} 位</span>
          </header>

          {staffList.length === 0 ? (
            <div className="p-8">
              <EmptyState icon="empty" title="暫無員工" description="使用上方表單新增第一位員工" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-earth-100 text-sm">
                <thead className="bg-earth-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-earth-600">姓名</th>
                    <th className="px-4 py-3 text-left font-medium text-earth-600">角色</th>
                    <th className="px-4 py-3 text-left font-medium text-earth-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-earth-600">狀態</th>
                    <th className="px-4 py-3 text-left font-medium text-earth-600">顧客數</th>
                    <th className="px-4 py-3 text-left font-medium text-earth-600">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100">
                  {staffList.map((staff) => (
                    <tr key={staff.id} className="hover:bg-earth-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-earth-900">{staff.displayName}</div>
                        <div className="text-xs text-earth-500">{staff.user.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            staff.isOwner
                              ? "bg-yellow-100 text-yellow-700"
                              : staff.user.role === "OWNER"
                                ? "bg-primary-100 text-primary-700"
                                : staff.user.role === "PARTNER"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-earth-100 text-earth-700"
                          }`}
                        >
                          {staff.isOwner
                            ? "系統管理者"
                            : (ROLE_LABELS[staff.user.role as UserRole] ?? staff.user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-earth-600">{staff.user.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLOR[staff.status] || "bg-earth-100 text-earth-700"
                          }`}
                        >
                          {staff.status === "ACTIVE" ? "啟用" : "停用"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-earth-600">{staff._count.assignedCustomers}</td>
                      <td className="px-4 py-3">
                        {canManageStaff && !staff.isOwner && (
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
        </section>
      </PageShell>
    </FeatureGate>
  );
}
