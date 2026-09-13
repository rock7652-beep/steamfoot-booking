"use server";

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { requireSpaStore } from "@/lib/industry-module-server";
import { checkPermission, isStaffRole } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { validSpaDate } from "@/lib/spa-scheduling";
import { getSpaScheduleForDay } from "@/server/queries/spa-schedule";

/** Authoritative, store-scoped read used by the SPA schedule's live refresh. */
export async function fetchSpaScheduleDaySnapshot(date: string) {
  try {
    if (!validSpaDate(date)) throw new AppError("VALIDATION", "日期不正確");
    const user = await getCurrentUser();
    if (!user || !isStaffRole(user.role)) throw new AppError("UNAUTHORIZED", "請先以店員帳號登入");
    if (!(await checkPermission(user.role, user.staffId, "booking.read"))) {
      throw new AppError("FORBIDDEN", "您沒有查看排程的權限");
    }
    const context = await getStoreContext();
    if (!context) throw new AppError("UNAUTHORIZED", "缺少目前店舖，請重新開啟 SPA 排程頁");
    if (user.role !== "ADMIN") {
      const staff = await prisma.staff.findFirst({
        where: { id: user.staffId ?? undefined, userId: user.id, storeId: context.storeId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!staff) throw new AppError("FORBIDDEN", "您無權查看目前店舖的 SPA 排程");
    }
    await requireSpaStore(context.storeId);
    return { bookings: await getSpaScheduleForDay(context.storeId, date) };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "無法更新排程");
  }
}
