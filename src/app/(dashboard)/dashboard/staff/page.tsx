import { listStaff } from "@/server/queries/staff";
import { createStaff } from "@/server/actions/staff";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, ROLE_LABELS } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { getActiveStoreForRead } from "@/lib/store";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PageHeader, PageShell } from "@/components/desktop";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { isSpaDemoStoreId, SPA_DEMO_PROVIDERS } from "@/lib/spa-demo-store";
import { StaffWorkspace, type StaffWorkspacePerson } from "./staff-workspace";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export default async function StaffPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "staff.view"))) notFound();

  const activeStoreId = await getActiveStoreForRead(user);
  const adminActiveStoreCookie = user.role === "ADMIN"
    ? (await cookies()).get("active-store-id")?.value ?? null
    : null;
  const adminMissingStore = user.role === "ADMIN"
    && (!adminActiveStoreCookie || adminActiveStoreCookie === "__all__");
  const [canManagePermission, staffList, plan] = await Promise.all([
    checkPermission(user.role, user.staffId, "staff.manage"),
    listStaff(activeStoreId),
    getCurrentStorePlan(),
  ]);
  const canManage = canManagePermission && !adminMissingStore;
  const isSpaDemo = isSpaDemoStoreId(activeStoreId);
  const providerById = new Map(SPA_DEMO_PROVIDERS.map((provider) => [provider.id, provider]));
  const [storedSkills, storedAvailability, storedExceptions] = isSpaDemo ? await Promise.all([
    prisma.staffSkill.findMany({ where: { storeId: activeStoreId! }, include: { skill: { select: { id: true } } } }),
    prisma.staffWeeklyAvailability.findMany({ where: { storeId: activeStoreId!, isActive: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.staffAvailabilityException.findMany({ where: { storeId: activeStoreId!, date: { gte: parseTaiwanDateToDbDate(toLocalDateStr()) } }, orderBy: { date: "asc" } }),
  ]) : [[], [], []];

  const people: StaffWorkspacePerson[] = staffList.map((staff) => {
    const provider = providerById.get(staff.id);
    const persistedSkillKeys = storedSkills.filter((row) => row.staffId === staff.id).map((row) => row.skill.id.replace("spa-demo-skill-", "") as StaffWorkspacePerson["specialtyKeys"][number]);
    const persistedAvailability = storedAvailability.filter((row) => row.staffId === staff.id).map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }));
    const persistedExceptions = storedExceptions.filter((row) => row.staffId === staff.id).map((row) => ({ date: row.date.toISOString().slice(0, 10), label: row.type === "UNAVAILABLE" ? (row.reason || "個人休假") : `臨時加班 ${row.startTime}–${row.endTime}`, tone: row.type === "UNAVAILABLE" ? "leave" as const : "extra" as const }));
    return {
      id: staff.id,
      userId: staff.user.id,
      displayName: staff.displayName,
      legalName: staff.user.name,
      roleLabel: staff.isOwner
        ? "店長"
        : isSpaDemo
          ? "芳療師"
          : ROLE_LABELS[staff.user.role as UserRole] ?? "服務人員",
      email: staff.user.email ?? "尚未設定",
      phone: staff.user.phone,
      colorCode: staff.colorCode,
      status: staff.status,
      customerCount: staff._count.assignedCustomers,
      specialties: provider?.specialties
        ?? (staff.isOwner ? "門店營運管理" : "尚未設定專業項目"),
      specialtyKeys: persistedSkillKeys.length ? persistedSkillKeys : provider?.specialtyKeys ?? [],
      emergencyContact: provider?.emergencyContact ?? null,
      weeklyAvailability: persistedAvailability.length ? persistedAvailability : provider?.weeklyAvailability ?? [],
      scheduleExceptions: persistedExceptions.length ? persistedExceptions : provider?.scheduleExceptions ?? [],
      canEdit: canManage && !staff.isOwner,
      canResetPassword:
        canManage
        && !staff.isOwner
        && staff.user.id !== user.id
        && staff.user.role !== "ADMIN"
        && !(user.role === "OWNER" && staff.user.role === "OWNER"),
    };
  });

  async function handleCreateStaff(formData: FormData) {
    "use server";
    const roleValue = (formData.get("role") as string) || "PARTNER";
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
    if (!result.success) throw new Error(result.error || "新增人員失敗");
    redirect("/dashboard/staff");
  }

  return (
    <FeatureGate plan={plan} feature={FEATURES.STAFF_MANAGEMENT}>
      <PageShell>
        <PageHeader
          title="人員管理"
          subtitle="管理人員、專業項目、接客時段與休假例外"
        />
        {adminMissingStore ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            目前尚未選擇操作店家，請從 HQ 選擇店家後再管理人員。
          </div>
        ) : (
          <StaffWorkspace
            people={people}
            today={toLocalDateStr()}
            canManage={canManage}
            createAction={handleCreateStaff}
          />
        )}
      </PageShell>
    </FeatureGate>
  );
}
