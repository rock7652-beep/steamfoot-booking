import "server-only";
import { prisma } from "@/lib/db";
import { isHqStoreView } from "@/lib/hq-store-view";
import { getActiveStoreForRead } from "@/lib/store";
import { FEATURES } from "@/lib/feature-flags";
import { ACCESSIBLE_STORE_OPERATING_STATUSES } from "@/lib/store-operating-status";

type AuditUser = { id: string; role: string; storeId: string | null; staffId: string | null };
export type OperationAuditScope = { hq: true; storeId: string | null } | { hq: false; storeId: string };

/** Authoritative uncached read: revocation and expiry apply to every request. */
export async function isStoreOperationAuditEnabled(storeId: string, now = new Date()): Promise<boolean> {
  const grant = await prisma.storeFeatureEntitlement.findUnique({
    where: { uq_store_feature_entitlement: { storeId, featureKey: FEATURES.STORE_OPERATION_AUDIT } },
    select: { status: true, startsAt: true, expiresAt: true },
  });
  return grant?.status === "ENABLED"
    && (!grant.startsAt || grant.startsAt <= now)
    && (!grant.expiresAt || grant.expiresAt > now);
}

/** Fail closed for child-store views, inactive staff, and all non-owner roles. */
export async function resolveOperationAuditScope(user: AuditUser): Promise<OperationAuditScope | null> {
  const storeView = await isHqStoreView(user);
  if (user.role !== "ADMIN" && user.role !== "OWNER") return null;
  const storeId = await getActiveStoreForRead(user);
  if (user.role === "ADMIN" && !storeView) return { hq: true, storeId };
  if (!storeId || storeId === "__all__") return null;
  if (user.role === "OWNER") {
    if (storeId !== user.storeId || !user.staffId) return null;
    const staff = await prisma.staff.findFirst({
      where: { id: user.staffId, userId: user.id, storeId, status: "ACTIVE", isOwner: true },
      select: { id: true },
    });
    if (!staff) return null;
  }
  const store = await prisma.store.findFirst({
    where: { id: storeId, operatingStatus: { in: ACCESSIBLE_STORE_OPERATING_STATUSES } }, select: { id: true },
  });
  if (!store || !await isStoreOperationAuditEnabled(storeId)) return null;
  return { hq: false, storeId };
}
