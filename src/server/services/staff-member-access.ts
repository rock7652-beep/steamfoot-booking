import { prisma } from "@/lib/db";
import { resolveCentralMemberCustomerForStore } from "./central-member-resolver";

export type ActiveStaffMemberAccess = {
  userId: string;
  storeId: string;
  customerId: string;
  staffId: string;
  staffName: string;
};

/**
 * Resolves work access from fixed identity links only.  A matching phone,
 * display name, cookie staffId, or global role can never grant access.
 */
export async function resolveActiveStaffMemberForStore(
  userId: string,
  storeId: string,
): Promise<ActiveStaffMemberAccess | null> {
  const membership = await resolveCentralMemberCustomerForStore(userId, storeId);
  if (!membership) return null;

  const link = await prisma.staffMemberLink.findUnique({
    where: { uq_staff_member_link_user_store: { userId, storeId } },
    select: {
      revokedAt: true,
      staff: { select: { id: true, displayName: true, status: true, storeId: true } },
    },
  });
  if (
    !link ||
    link.revokedAt ||
    link.staff.status !== "ACTIVE" ||
    link.staff.storeId !== storeId
  ) return null;

  return {
    userId,
    storeId,
    customerId: membership.customerId,
    staffId: link.staff.id,
    staffName: link.staff.displayName,
  };
}
