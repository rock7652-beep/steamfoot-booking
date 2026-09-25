"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { requireSteamfootStore } from "@/lib/industry-module-server";
import { resolveWriteStoreId } from "@/lib/store";
import { AppError, handleActionError } from "@/lib/errors";
import { toLocalMonthStr } from "@/lib/date-utils";
import { rentInput, shiftMonth, validateRentChange } from "@/lib/steamfoot-rent";
import { readRentTerms } from "@/server/services/steamfoot-rent";

export async function saveSteamfootRent(input: unknown) {
  try {
    const user = await requirePermission("staff.manage");
    if (user.role !== "OWNER" && user.role !== "ADMIN") throw new AppError("FORBIDDEN", "僅店長可設定租金");
    const storeId = await resolveWriteStoreId(user);
    await requireSteamfootStore(storeId);
    const data = rentInput.parse(input);
    await prisma.$transaction(async tx => {
      // Lock the parent even for first setup: concurrent requests cannot create overlapping terms.
      await tx.$queryRaw`SELECT id FROM "Staff" WHERE id=${data.staffId} AND "storeId"=${storeId} FOR UPDATE`;
      const staff = await tx.staff.findFirst({ where: { id: data.staffId, storeId }, include: { user: { select: { role: true } } } });
      if (!staff) throw new AppError("NOT_FOUND", "找不到本店人員");
      if (user.role !== "ADMIN" && (staff.isOwner || staff.user.role === "ADMIN")) throw new AppError("FORBIDDEN", "無權管理此人員的租金");
      const previous = (await readRentTerms(storeId, staff.id, tx))[0];
      const error = validateRentChange(previous, data, toLocalMonthStr());
      if (error) throw new AppError("VALIDATION", error);
      if (previous) await tx.$executeRaw`UPDATE "StaffRentTerm" SET "endMonth"=${shiftMonth(data.startMonth, -1)} WHERE id=${previous.id} AND "storeId"=${storeId}`;
      await tx.$executeRaw`INSERT INTO "StaffRentTerm" (id,"storeId","staffId","startMonth","cycleMonths","monthlyAmount",enabled,"createdBy")
        VALUES (${randomUUID()},${storeId},${staff.id},${data.startMonth},${data.cycleMonths},${data.enabled ? data.monthlyAmount : 0},${data.enabled},${user.id})`;
      // Legacy monthlySpaceFee/SpaceFeeRecord are intentionally not mutated: older reports deduct them.
    });
    revalidatePath("/dashboard/service-fee-calculator");
    revalidatePath(`/dashboard/staff/${data.staffId}/rent`);
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}
