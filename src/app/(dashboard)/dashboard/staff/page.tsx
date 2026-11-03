import {BeautyNativeAccountWorkspace} from '@/components/beauty/native-account-source';
import {nativeBeautyAccount} from '@/lib/beauty/native-staff';
import {savedStaffPerson} from '@/lib/staff-settings-save';
import {beautyPrisma} from '@/lib/beauty-db';
import {getStoreLimitsByStoreId} from '@/lib/feature-gate';
import type {CourseOrderSnapshot} from '@/lib/course-display-order';
import {BEAUTY_PERMISSIONS} from '@/lib/beauty/permissions';
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { CourseStaffPage } from "../courses/staff-page";
import { hasCurrentStoreFeature } from "@/lib/feature-gate";
import { listStaff } from "@/server/queries/staff";
import { createStaff } from "@/server/actions/staff";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, ROLE_LABELS, ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_LABELS, getDefaultPermissionsForRole, getStaffPermissions } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { getActiveStoreForRead } from "@/lib/store";
import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/desktop";
import { toLocalDateStr } from "@/lib/date-utils";
import { StaffWorkspace, type StaffWorkspacePerson } from "./staff-workspace";
import type { UserRole } from "@prisma/client";

import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { canManageStaffRole } from "@/lib/staff-role-policy";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ createError?: string }>;
}) {
  const { createError } = await searchParams;
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "staff.view"))) {
    return <PageShell><PageHeader title="人員管理" /><EmptyState icon="lock" title="沒有查看人員管理的權限" description="請聯絡店長調整帳號權限。" action={{ label: "返回首頁", href: "/dashboard" }} /></PageShell>;
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const industryModule = activeStoreId ? await getStoreIndustryModule(activeStoreId) : null;
  if (industryModule === "course") return <CourseStaffPage />;
  const adminMissingStore = user.role === "ADMIN"
    && !activeStoreId;
  const [canManagePermission, staffList, plan] = await Promise.all([
    checkPermission(user.role, user.staffId, "staff.manage"),
    listStaff(activeStoreId),
    getCurrentStorePlan(),
  ]);
  const canManage = canManagePermission && !adminMissingStore;
  const actorPermissions = user.role === "MANAGER" && user.staffId ? await getStaffPermissions(user.staffId, activeStoreId!) : new Set(ALL_PERMISSIONS);
  const isSpaStore = industryModule === "spa";
  const spaSchemaReady = false;


  const storedAvailability: Array<{ staffId: string; dayOfWeek: number; startTime: string; endTime: string }> = [];
  const storedExceptions: Array<{ staffId: string; date: Date; type: "UNAVAILABLE" | "AVAILABLE"; startTime: string | null; endTime: string | null; reason: string | null }> = [];
  const storedCompensation: Array<{ staffId: string; mode: string; value: { toString(): string } }> = [];


  const people: StaffWorkspacePerson[] = staffList.map((staff) => {
    const persistedSkillKeys: string[] = [];
    const persistedAvailability = storedAvailability.filter((row) => row.staffId === staff.id).map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
    const persistedExceptions = storedExceptions.filter((row) => row.staffId === staff.id).map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      label: row.type === "UNAVAILABLE"
        ? row.startTime && row.endTime
          ? `請假 ${row.startTime}–${row.endTime}${row.reason ? `・${row.reason}` : ""}`
          : row.reason || "個人休假"
        : `臨時加班 ${row.startTime}–${row.endTime}${row.reason ? `・${row.reason}` : ""}`,
      tone: row.type === "UNAVAILABLE" ? "leave" as const : "extra" as const,
      startTime: row.startTime,
      endTime: row.endTime,
      reason: row.reason,
    }));
    const compensation = storedCompensation.find((row) => row.staffId === staff.id);
    return {
      id: staff.id,
      updatedAt:staff.updatedAt.toISOString(),
      userId: staff.user.id,
      role: staff.user.role,
      permissions: staff.user.role === "OWNER" || staff.user.role === "ADMIN" ? [...ALL_PERMISSIONS] : staff.permissions.map(p => p.permission),
      displayName: staff.displayName,
      legalName: staff.user.name,
      roleLabel: ROLE_LABELS[staff.user.role as UserRole] ?? "服務人員",
      email: staff.user.email ?? "尚未設定",
      phone: staff.phone || staff.user.phone,
      colorCode: staff.colorCode,
      status: staff.status,
      customerCount: staff._count.assignedCustomers,
      specialties: staff.isOwner ? "門店營運管理" : "尚未設定專業項目",
      specialtyKeys: persistedSkillKeys,
      emergencyContact: null,
      weeklyAvailability: persistedAvailability,
      scheduleExceptions: persistedExceptions,
      canEdit: canManage && staff.user.id !== user.id && canManageStaffRole(getEffectiveActorRole(user), staff.user.role),
      canResetPassword: canManage && staff.user.id !== user.id && staff.user.role !== "ADMIN" && canManageStaffRole(getEffectiveActorRole(user), staff.user.role),
      compensationMode: compensation?.mode === "PERCENTAGE" || compensation?.mode === "FIXED" ? compensation.mode : null,
      compensationValue: compensation ? Number(compensation.value) : null,
    };
  });

  async function handleCreateStaff(formData: FormData) {
    "use server";
    const roleValue = (formData.get("role") as string) || "STAFF";
    const result = await createStaff({
      name: formData.get("name") as string,
      displayName: formData.get("displayName") as string,
      email: String(formData.get("email") ?? "").trim() || undefined,
      phone: String(formData.get("phone") ?? "").trim(),
      password: formData.get("password") as string,
      colorCode: formData.get("colorCode") as string,
      monthlySpaceFee: formData.get("monthlySpaceFee")
        ? Number(formData.get("monthlySpaceFee"))
        : 0,
      role: roleValue as "OWNER" | "MANAGER" | "STAFF" | "PARTNER",
      spaCompensation: undefined,
      spaSkillKeys: undefined,
      spaWeeklyAvailability: undefined,
    });
    if (!result.success) {
      redirect(`/dashboard/staff?createError=${encodeURIComponent(result.error || "新增人員失敗")}`);
    }
    redirect("/dashboard/staff");
  }

  if(industryModule==='beauty'&&activeStoreId){
    const [limits,orders]=await Promise.all([getStoreLimitsByStoreId(activeStoreId),beautyPrisma.$queryRaw<CourseOrderSnapshot[]>`SELECT ids,revision FROM "CourseDisplayOrder" WHERE "storeId"=${activeStoreId} AND kind='staff'`]);
    return <FeatureGate plan={plan} feature={FEATURES.STAFF_MANAGEMENT} enabled={await hasCurrentStoreFeature(FEATURES.STAFF_MANAGEMENT)}><PageShell><PageHeader title="人員管理"/><BeautyNativeAccountWorkspace storeId={activeStoreId} staff={people.map(person=>{const row=staffList.find(row=>row.id===person.id);return nativeBeautyAccount(savedStaffPerson.parse({...person,birthday:row?.courseBirthday?.toISOString().slice(0,10)??'',emergencyContactName:row?.emergencyContactName??'',emergencyContactPhone:row?.emergencyContactPhone??'',emergencyContactRelation:row?.emergencyContactRelation??''}));})} canManage={canManage&&['OWNER','MANAGER','ADMIN'].includes(user.role)} canAssignRoles={user.role==='OWNER'||user.role==='ADMIN'} maxStaff={limits.maxStaff} displayOrder={orders[0]} editablePermissions={Array.from(actorPermissions).filter(p=>BEAUTY_PERMISSIONS.includes(p))} rolePresets={Object.fromEntries((['OWNER','MANAGER','STAFF'] as const).map(role=>[role,getDefaultPermissionsForRole(role).filter(p=>BEAUTY_PERMISSIONS.includes(p))]))} permissionGroups={Object.values(PERMISSION_GROUPS).map(group=>({label:group.label.replaceAll('教師','技師'),codes:group.codes.filter(code=>BEAUTY_PERMISSIONS.includes(code)).map(code=>({code,label:PERMISSION_LABELS[code].replaceAll('教師','技師')}))})).filter(group=>group.codes.length)}/></PageShell></FeatureGate>;
  }

  return (
    <FeatureGate plan={plan} feature={FEATURES.STAFF_MANAGEMENT} enabled={await hasCurrentStoreFeature(FEATURES.STAFF_MANAGEMENT)}>
      <PageShell>
        <PageHeader
          title="人員管理"
          subtitle={"管理人員帳號、角色與權限"}
        />
        {adminMissingStore ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            目前尚未選擇操作店家，請從 HQ 選擇店家後再管理人員。
          </div>
        ) : (
          <>
            {createError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                新增人員失敗：{createError}
              </div>
            ) : null}
            {null}
            <StaffWorkspace key={activeStoreId} storeId={activeStoreId!}
              accountPolicy={{
                canAssignRoles: user.role === "OWNER" || user.role === "ADMIN",
                editablePermissions: Array.from(actorPermissions).filter(p=>industryModule!=='beauty'||BEAUTY_PERMISSIONS.includes(p)),
                rolePresets: Object.fromEntries((["OWNER", "MANAGER", "STAFF", "PARTNER"] as const).map(role => [role, getDefaultPermissionsForRole(role).filter(p=>industryModule!=='beauty'||BEAUTY_PERMISSIONS.includes(p))])),
                permissionGroups: Object.values(PERMISSION_GROUPS).map(g => ({ label: industryModule === "beauty" ? g.label.replaceAll("教師", "技師") : g.label, codes: g.codes.filter(code => industryModule==='beauty'?BEAUTY_PERMISSIONS.includes(code):!code.startsWith("teacher.")).map(code => ({ code, label: industryModule === "beauty" ? PERMISSION_LABELS[code].replaceAll("教師", "技師") : PERMISSION_LABELS[code] })) })).filter(g => g.codes.length),
              }}
              beauty={industryModule==='beauty'}
              accountListOnly={!isSpaStore}
              showSteamfootRent={industryModule === "steamfoot"}
              people={people}
              today={toLocalDateStr()}
              canManage={canManage}
              canAssignRoles={user.role === "OWNER" || user.role === "ADMIN"}
              showSpaCompensation={false}
              createAction={handleCreateStaff}
            />
          </>
        )}
      </PageShell>
    </FeatureGate>
  );
}
