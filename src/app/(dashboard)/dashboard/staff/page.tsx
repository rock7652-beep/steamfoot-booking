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
  FormSection,
  StickyFormActions,
  type KpiStripItem,
} from "@/components/desktop";
import { SubmitButton } from "@/components/submit-button";
import { StaffStatusToggle } from "./staff-status-toggle";
import { ResetPasswordButton } from "./reset-password-button";
import type { UserRole } from "@prisma/client";

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

type StatusFilter = "all" | "active" | "inactive";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "staff.view"))) notFound();

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const statusFilter: StatusFilter =
    sp.status === "active" || sp.status === "inactive" ? sp.status : "all";

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

  const visibleStaff = staffList.filter((s) => {
    if (statusFilter === "active" && s.status !== "ACTIVE") return false;
    if (statusFilter === "inactive" && s.status === "ACTIVE") return false;
    if (q) {
      const haystack = [
        s.displayName,
        s.user.name,
        s.user.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  function statusFilterHref(value: StatusFilter): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value !== "all") params.set("status", value);
    const search = params.toString();
    return search ? `/dashboard/staff?${search}` : "/dashboard/staff";
  }

  const filterTabClass = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition ${
      active
        ? "bg-primary-50 text-primary-700"
        : "text-earth-500 hover:bg-earth-50 hover:text-earth-700"
    }`;

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

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {canManageStaff && (
            <div className="xl:col-span-4 xl:sticky xl:top-4 xl:self-start">
              <FormSection
                title="新增員工"
                description="建立後可在編輯頁調整權限與顏色"
              >
                <form action={handleCreateStaff} className="space-y-4">
                  <div>
                    <label className={labelCls}>角色</label>
                    <select
                      name="role"
                      defaultValue="OWNER"
                      className={`mt-1 ${inputCls}`}
                    >
                      <option value="OWNER">店長（主要經營者）</option>
                      <option value="PARTNER">合作店長</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      placeholder="登入用 Email"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>
                        月度空間費 <span className="text-xs text-earth-400">（元）</span>
                      </label>
                      <input
                        type="number"
                        name="monthlySpaceFee"
                        min="0"
                        step="1"
                        defaultValue="0"
                        className={`mt-1 ${inputCls}`}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        顏色 <span className="text-xs text-earth-400">（卡片）</span>
                      </label>
                      <input
                        type="color"
                        name="colorCode"
                        defaultValue="#6366f1"
                        className="mt-1 block h-10 w-full rounded-lg border border-earth-300"
                      />
                    </div>
                  </div>

                  <StickyFormActions info={<span>建立後會回到列表</span>}>
                    <SubmitButton
                      label="新增"
                      pendingLabel="建立中..."
                      className="bg-primary-600 text-white hover:bg-primary-700"
                    />
                  </StickyFormActions>
                </form>
              </FormSection>
            </div>
          )}

          <div className={canManageStaff ? "xl:col-span-8" : "xl:col-span-12"}>
            <section className="rounded-xl border border-earth-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-earth-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-earth-900">
                    員工列表
                  </h2>
                  <span className="text-xs text-earth-500">
                    {visibleStaff.length}
                    {q || statusFilter !== "all"
                      ? ` / ${totalCount}`
                      : ` 位`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form
                    action="/dashboard/staff"
                    className="flex items-center gap-2"
                  >
                    {statusFilter !== "all" && (
                      <input type="hidden" name="status" value={statusFilter} />
                    )}
                    <input
                      type="search"
                      name="q"
                      defaultValue={q}
                      placeholder="搜尋姓名 / Email"
                      className="h-8 w-44 rounded-md border border-earth-200 bg-white px-2 text-xs text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-earth-200 px-2 py-1 text-xs text-earth-600 hover:bg-earth-50"
                    >
                      搜尋
                    </button>
                  </form>
                  <div className="flex items-center gap-1 rounded-md border border-earth-200 bg-earth-50/60 p-0.5">
                    <Link
                      href={statusFilterHref("all")}
                      className={filterTabClass(statusFilter === "all")}
                    >
                      全部
                    </Link>
                    <Link
                      href={statusFilterHref("active")}
                      className={filterTabClass(statusFilter === "active")}
                    >
                      啟用
                    </Link>
                    <Link
                      href={statusFilterHref("inactive")}
                      className={filterTabClass(statusFilter === "inactive")}
                    >
                      停用
                    </Link>
                  </div>
                </div>
              </header>

              {visibleStaff.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon="empty"
                    title={q || statusFilter !== "all" ? "沒有符合條件的員工" : "暫無員工"}
                    description={
                      q || statusFilter !== "all"
                        ? "試著清空搜尋或切換狀態篩選"
                        : "使用左側表單新增第一位員工"
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
                      <tr>
                        <th className="px-3 py-2 text-left">姓名</th>
                        <th className="px-3 py-2 text-left">角色</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">狀態</th>
                        <th className="px-3 py-2 text-right">顧客</th>
                        <th className="px-3 py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-earth-100">
                      {visibleStaff.map((staff) => (
                        <tr
                          key={staff.id}
                          className="h-11 transition hover:bg-primary-50/40"
                        >
                          <td className="px-3">
                            <div className="font-medium text-earth-900">
                              {staff.displayName}
                            </div>
                            <div className="text-[11px] text-earth-500">
                              {staff.user.name}
                            </div>
                          </td>
                          <td className="px-3">
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
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
                                : (ROLE_LABELS[staff.user.role as UserRole] ??
                                  staff.user.role)}
                            </span>
                          </td>
                          <td className="px-3 text-[13px] text-earth-600">
                            {staff.user.email}
                          </td>
                          <td className="px-3">
                            <span
                              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                                STATUS_COLOR[staff.status] ||
                                "bg-earth-100 text-earth-700"
                              }`}
                            >
                              {staff.status === "ACTIVE" ? "啟用" : "停用"}
                            </span>
                          </td>
                          <td className="px-3 text-right text-[13px] tabular-nums text-earth-600">
                            {staff._count.assignedCustomers}
                          </td>
                          <td className="px-3">
                            {canManageStaff && !staff.isOwner ? (
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/dashboard/staff/${staff.id}/edit`}
                                  className="text-xs text-primary-600 hover:underline"
                                >
                                  編輯
                                </Link>
                                <StaffStatusToggle
                                  staffId={staff.id}
                                  currentStatus={staff.status}
                                />
                                {staff.user.id !== user.id &&
                                  staff.user.role !== "ADMIN" &&
                                  !(
                                    user.role === "OWNER" &&
                                    staff.user.role === "OWNER"
                                  ) && (
                                    <ResetPasswordButton
                                      userId={staff.user.id}
                                      displayName={staff.displayName}
                                    />
                                  )}
                              </div>
                            ) : (
                              <span className="block text-right text-[11px] text-earth-300">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </PageShell>
    </FeatureGate>
  );
}
