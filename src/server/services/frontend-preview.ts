import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import "server-only";
import { prisma } from "@/lib/db";
import { checkPermission, requirePermission } from "@/lib/permissions";
import { validateStoreAccess } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { AppError } from "@/lib/errors";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";

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

/** Resolve only explicit, active same-store links, then authorize each visible role. */
export async function resolveCoursePreviewIdentity(access: Awaited<ReturnType<typeof authorizeFrontendPreview>>) {
  const result = { customerId: access.role === "member" ? access.personId : "", workStaffId: access.role === "work" ? access.personId : null as string | null, memberEnabled: access.role === "member" };
  if (access.moduleId !== "course") return result;
  let memberUserId = access.personUserId;
  if (access.role === "member") {
    if ((access.user.role !== "OWNER" && access.user.role !== "ADMIN") || !await checkPermission(access.user.role, access.user.staffId, "staff.view")) return result;
    const identities = await prisma.customerIdentityLink.findMany({
      where: { customerId: access.personId, storeId: access.storeId },
      select: { userId: true },
    });
    const userIds = [...new Set([memberUserId, ...identities.map(identity => identity.userId)].filter((id): id is string => !!id))];
    if (userIds.length !== 1) return result;
    memberUserId = userIds[0];
    const membership = await resolveCentralMemberCustomerForStore(memberUserId, access.storeId);
    if (membership?.customerId !== access.personId) return result;
  }
  const link = await prisma.staffMemberLink.findFirst({
    where: { storeId: access.storeId, revokedAt: null, ...(access.role === "member" ? { userId: memberUserId! } : { staffId: access.personId }), staff: { status: "ACTIVE", courseCoachEnabled: true } },
    select: { staffId: true, userId: true, courseMemberEnabled: true },
  });
  if (!link) return result;
  if (access.role === "member") {
    // The same checks as selecting work in HQ must pass before loading rosters.
    await authorizeFrontendPreview({ storeId: access.storeId, personId: link.staffId, role: "work" });
    return { ...result, workStaffId: link.staffId, memberEnabled: link.courseMemberEnabled };
  }
  if (!link.courseMemberEnabled || !await checkPermission(access.user.role, access.user.staffId, "wallet.read")) return result;
  const membership = await resolveCentralMemberCustomerForStore(link.userId, access.storeId);
  if (!membership) return result;
  await authorizeFrontendPreview({ storeId: access.storeId, personId: membership.customerId, role: "member" });
  return { ...result, customerId: membership.customerId, memberEnabled: true };
}
