import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import "server-only";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { validateStoreAccess } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { AppError } from "@/lib/errors";

export type FrontendPreviewSelection = { storeId: string; personId: string; role: "member" | "work" };

/** Every render/read rechecks manager authority. Never creates a customer session. */
export async function authorizeFrontendPreview(input: FrontendPreviewSelection) {
  const user = await requirePermission("customer.read");
  await requirePermission("booking.read");
  await validateStoreAccess(user, input.storeId, "read");
  await requireStoreFeature(input.storeId, FEATURES.FRONTEND_PREVIEW);
  const moduleId = await getStoreIndustryModule(input.storeId);
  if (input.role === "work") {
    await requirePermission("staff.view");
    // Work frontends contain customer notes. Preserve owner-only personnel access.
    if (user.role !== "OWNER" && user.role !== "ADMIN") throw new AppError("FORBIDDEN", "需店長權限");
    if (moduleId === "steamfoot") throw new AppError("FORBIDDEN", "此模組沒有工作前台");
    const staff = await prisma.staff.findFirst({
      where: { id: input.personId, storeId: input.storeId, status: "ACTIVE", ...(moduleId === "course" ? { courseCoachEnabled: true } : {}) },
      select: { id: true, displayName: true, userId: true },
    });
    if (!staff) throw new AppError("NOT_FOUND", "沒有符合條件的人員");
    return { user, moduleId, storeId: input.storeId, personId: staff.id, name: staff.displayName, personUserId: staff.userId, role: input.role };
  }
  await requirePermission("wallet.read");
  const customer = await prisma.customer.findFirst({
    where: { ...getManagerCustomerWhere(user.role, user.staffId, input.storeId), id: input.personId, storeId: input.storeId, mergedIntoCustomerId: null },
    select: { id: true, name: true, userId: true },
  });
  if (!customer) throw new AppError("NOT_FOUND", "沒有符合條件的顧客");
  return { user, moduleId, storeId: input.storeId, personId: customer.id, name: customer.name, personUserId: customer.userId, role: input.role };
}
