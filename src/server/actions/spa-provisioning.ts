"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { handleActionError } from "@/lib/errors";
import { requirePermission } from "@/lib/permissions";
import { requireAdminSession } from "@/lib/session";
import { spaPrisma } from "@/lib/spa-db";
import type { ActionResult } from "@/types";

const STARTER_SKILLS = ["身體芳療", "臉部護理", "頭部舒壓", "足部放鬆"] as const;
const STARTER_TREATMENTS = [
  { name: "全身芳療", variantLabel: "60 分鐘", price: 1800, serviceMinutes: 60, skill: "身體芳療" },
  { name: "臉部保濕護理", variantLabel: "60 分鐘", price: 2000, serviceMinutes: 60, skill: "臉部護理" },
  { name: "足部舒壓", variantLabel: "30 分鐘", price: 800, serviceMinutes: 30, skill: "足部放鬆" },
] as const;

/** HQ-only, retry-safe SPA setup. It only writes Spa* tables and marks ACTIVE last. */
export async function provisionSpaStoreAction(storeId: string): Promise<ActionResult<void>> {
  await requireAdminSession();
  await requirePermission("staff.manage");
  try {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: { moduleInstallation: true, staff: { where: { status: "ACTIVE" }, select: { id: true } } },
    });
    if (!store || store.industryModule !== "SPA" || !store.moduleInstallation) {
      return { success: false, error: "此店不是可佈建的 SPA 店" };
    }

    const skills = await Promise.all(STARTER_SKILLS.map((name, sortOrder) => spaPrisma.spaSkill.upsert({
      where: { storeId_name: { storeId, name } },
      create: { storeId, name, sortOrder }, update: { isActive: true, sortOrder },
    })));
    const skillByName = new Map(skills.map((skill) => [skill.name, skill]));
    const serviceLocation = await spaPrisma.spaServiceLocation.upsert({
      where: { storeId_name: { storeId, name: "服務位置 1" } },
      create: { storeId, name: "服務位置 1", isActive: true, sortOrder: 0 },
      update: { isActive: true, sortOrder: 0 },
    });
    for (const [sortOrder, treatment] of STARTER_TREATMENTS.entries()) {
      const { skill: skillName, ...treatmentData } = treatment;
      const saved = await spaPrisma.spaTreatment.upsert({
        where: { storeId_name_variantLabel: { storeId, name: treatment.name, variantLabel: treatment.variantLabel } },
        create: { storeId, ...treatmentData, bufferMinutes: 0, sortOrder, publicVisible: true },
        update: { price: treatment.price, serviceMinutes: treatment.serviceMinutes, isActive: true, sortOrder },
      });
      const skill = skillByName.get(skillName)!;
      await spaPrisma.spaTreatmentSkill.upsert({
        where: { treatmentId_skillId: { treatmentId: saved.id, skillId: skill.id } },
        create: { storeId, treatmentId: saved.id, skillId: skill.id }, update: {},
      });
      await spaPrisma.spaTreatmentServiceLocation.upsert({
        where: { treatmentId_serviceLocationId: { treatmentId: saved.id, serviceLocationId: serviceLocation.id } },
        create: { storeId, treatmentId: saved.id, serviceLocationId: serviceLocation.id },
        update: {},
      });
    }
    if (store.staff.length === 0) throw new Error("SPA 佈建需要至少一位啟用中的服務人員");
    for (const staff of store.staff) {
      await spaPrisma.spaStaffSkill.createMany({ data: skills.map((skill) => ({ storeId, staffId: staff.id, skillId: skill.id })), skipDuplicates: true });
      await Promise.all(Array.from({ length: 7 }, (_, dayOfWeek) => spaPrisma.spaStaffAvailability.upsert({
        where: { storeId_staffId_dayOfWeek: { storeId, staffId: staff.id, dayOfWeek } },
        create: { storeId, staffId: staff.id, dayOfWeek, startTime: "10:00", endTime: "21:00" }, update: { isActive: true },
      })));
    }
    await prisma.storeModuleInstallation.update({
      where: { storeId }, data: { status: "ACTIVE", provisionedAt: new Date(), failureCode: null, failureDetail: null },
    });
    revalidatePath(`/hq/dashboard/stores/${storeId}`);
    revalidatePath("/dashboard/spa-schedule");
    return { success: true, data: undefined };
  } catch (error) {
    await prisma.storeModuleInstallation.update({ where: { storeId }, data: { status: "FAILED", failureCode: "SPA_PROVISION_FAILED", failureDetail: error instanceof Error ? error.message : String(error) } }).catch(() => undefined);
    return handleActionError(error);
  }
}
