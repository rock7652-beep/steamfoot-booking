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
import { SPA_DEMO_PROVIDERS, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { StaffWorkspace, type StaffWorkspacePerson } from "./staff-workspace";
import type { UserRole } from "@prisma/client";
import { spaPrisma } from "@/lib/spa-db";
import { isSpaCompensationSchemaReady, isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ createError?: string }>;
}) {
  const { createError } = await searchParams;
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
  const isSpaDemo = Boolean(
    activeStoreId &&
    (await getStoreIndustryModule(activeStoreId)) === "spa" &&
    activeStoreId === SPA_DEMO_STORE.id,
  );
  const spaSchemaReady = isSpaDemo ? await isSpaOperationalSchemaReady() : false;
  const spaCompensationReady = isSpaDemo ? await isSpaCompensationSchemaReady() : false;
  const providerById = new Map(SPA_DEMO_PROVIDERS.map((provider) => [provider.id, provider]));
  let storedSkills: Array<{ staffId: string; skill: { id: string } }> = [];
  let storedAvailability: Array<{ staffId: string; dayOfWeek: number; startTime: string; endTime: string }> = [];
  let storedExceptions: Array<{ staffId: string; date: Date; type: "UNAVAILABLE" | "AVAILABLE"; startTime: string | null; endTime: string | null; reason: string | null }> = [];
  let storedCompensation: Array<{ staffId: string; mode: string; value: { toString(): string } }> = [];
  let spaStaffDataReady = spaSchemaReady;
  if (isSpaDemo && spaSchemaReady) {
    try {
      [storedSkills, storedAvailability, storedExceptions] = await Promise.all([
        spaPrisma.spaStaffSkill.findMany({ where: { storeId: activeStoreId! }, include: { skill: { select: { id: true } } } }),
        spaPrisma.spaStaffAvailability.findMany({ where: { storeId: activeStoreId!, isActive: true }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
        spaPrisma.spaStaffAvailabilityException.findMany({ where: { storeId: activeStoreId!, date: { gte: parseTaiwanDateToDbDate(toLocalDateStr()) } }, orderBy: { date: "asc" } }),
      ]);
    } catch (error) {
      spaStaffDataReady = false;
      console.error("[spa-staff] optional operational data unavailable", {
        storeId: activeStoreId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (isSpaDemo && spaCompensationReady) {
    storedCompensation = await spaPrisma.spaStaffCompensation.findMany({
      where: { storeId: activeStoreId!, isActive: true },
    });
  }

  const people: StaffWorkspacePerson[] = staffList.map((staff) => {
    const provider = providerById.get(staff.id);
    const persistedSkillKeys = storedSkills.filter((row) => row.staffId === staff.id).map((row) => row.skill.id.replace("spa-demo-skill-", "") as StaffWorkspacePerson["specialtyKeys"][number]);
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
      compensationMode: compensation?.mode === "PERCENTAGE" || compensation?.mode === "FIXED" ? compensation.mode : null,
      compensationValue: compensation ? Number(compensation.value) : null,
    };
  });

  async function handleCreateStaff(formData: FormData) {
    "use server";
    const roleValue = (formData.get("role") as string) || "PARTNER";
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
      role: roleValue as "OWNER" | "PARTNER",
      spaCompensation: isSpaDemo && formData.get("compensationValue") !== null
        ? {
            mode: String(formData.get("compensationMode")) as "PERCENTAGE" | "FIXED",
            value: Number(formData.get("compensationValue")),
          }
        : undefined,
      spaSkillKeys: isSpaDemo
        ? formData.getAll("spaSkillKeys").map(String) as Array<"body" | "head" | "foot" | "face">
        : undefined,
      spaWeeklyAvailability: isSpaDemo
        ? formData.getAll("spaAvailabilityDays").map((day) => ({
            dayOfWeek: Number(day),
            startTime: String(formData.get("spaStartTime")),
            endTime: String(formData.get("spaEndTime")),
          }))
        : undefined,
    });
    if (!result.success) {
      redirect(`/dashboard/staff?createError=${encodeURIComponent(result.error || "新增人員失敗")}`);
    }
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
          <>
            {createError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                新增人員失敗：{createError}
              </div>
            ) : null}
            {isSpaDemo && !spaStaffDataReady ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                人員排班資料功能更新中，目前可先查看 Demo 設定；待資料表就緒後即可儲存。
              </div>
            ) : null}
            <StaffWorkspace
              people={people}
              today={toLocalDateStr()}
              canManage={canManage}
              showSpaCompensation={isSpaDemo && spaCompensationReady}
              createAction={handleCreateStaff}
            />
          </>
        )}
      </PageShell>
    </FeatureGate>
  );
}
