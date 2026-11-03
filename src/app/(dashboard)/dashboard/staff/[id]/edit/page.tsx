import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { StaffAccountRoute } from "../../staff-account-route";
import { COURSE_PERMISSIONS, COURSE_PERMISSION_LABELS } from "@/lib/course-permissions";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getStaffDetail } from "@/server/queries/staff";

import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";

import { getStaffPermissions, getDefaultPermissionsForRole, checkPermission, PERMISSION_GROUPS, PERMISSION_LABELS, ALL_PERMISSIONS, ROLE_LABELS, type PermissionCode } from "@/lib/permissions";

import { notFound } from "next/navigation";

import { canManageStaffRole } from "@/lib/staff-role-policy";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}

export default async function EditStaffPage({ params, searchParams }: PageProps) {
  const { err } = await searchParams;
  const user = await getCurrentUser();
  if (!user) notFound();
  const activeStoreId = await getActiveStoreForRead(user);
  if (!activeStoreId || !(await checkPermission(user.role, user.staffId, "staff.view"))) notFound();

  const { id } = await params;

  const staff = await getStaffDetail(id, activeStoreId).catch(() => null);
  if (!staff) notFound();

  const industry = await getStoreIndustryModule(staff.storeId);


  // 取得該店長的現有權限
  const storedPerms = await getStaffPermissions(id, activeStoreId!);
  const currentPerms = staff.user.role === "OWNER"
    ? new Set<PermissionCode>(ALL_PERMISSIONS as unknown as PermissionCode[])
    : storedPerms;

  // Layer 1：是否可管理店員（ADMIN 由 checkPermission 自動 true；
  // 否則須具 staff.manage）。false → 頁面唯讀，不顯示變更用 UI。
  const canManageStaff = staff.userId !== user.id && canManageStaffRole(getEffectiveActorRole(user), staff.user.role) && await checkPermission(
    user.role,
    user.staffId,
    "staff.manage",
  );

  const actorPerms = user.role === "MANAGER" && user.staffId ? await getStaffPermissions(user.staffId, activeStoreId) : new Set<PermissionCode>(ALL_PERMISSIONS);

  {
    const visibleCodes = industry === "course" ? COURSE_PERMISSIONS : ALL_PERMISSIONS.filter(code => !code.startsWith("teacher."));
    return <StaffAccountRoute person={{
      id: staff.id, userId: staff.userId, displayName: staff.displayName, legalName: staff.user.name,
      role: staff.user.role, permissions: Array.from(currentPerms), roleLabel: ROLE_LABELS[staff.user.role],
      email: staff.user.email ?? "尚未設定", phone: staff.phone || staff.user.phone, colorCode: staff.colorCode, status: staff.status,
      canEdit: canManageStaff, canResetPassword: canManageStaff, customerCount: staff._count.assignedCustomers,
      specialties: "", specialtyKeys: [], emergencyContact: null, weeklyAvailability: [], scheduleExceptions: [], compensationMode: null, compensationValue: null,
    }} policy={{
      canAssignRoles: user.role === "OWNER" || user.role === "ADMIN",
      editablePermissions: Array.from(actorPerms),
      rolePresets: Object.fromEntries((["OWNER", "MANAGER", "STAFF", "PARTNER"] as const).map(role => [role, getDefaultPermissionsForRole(role)])),
      permissionGroups: Object.values(PERMISSION_GROUPS).map(g => ({ label: g.label, codes: g.codes.filter(c => visibleCodes.includes(c)).map(code => ({ code, label: industry === "course" ? COURSE_PERMISSION_LABELS[code] ?? PERMISSION_LABELS[code] : PERMISSION_LABELS[code] })) })).filter(g => g.codes.length),
    }}/>;
  }

}
