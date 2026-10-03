import { prisma } from "@/lib/db";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError } from "@/lib/errors";
import { isSpaDemoStoreId } from "@/lib/spa-demo-store";

/**
 * Requires the shared feature entitlement. Full single-store trials include it;
 * paid plans require an explicit HQ grant. Conversation activation stays separate.
 */
export async function requireDigitalButlerEntitlement(storeId: string): Promise<void> {
  await requireStoreFeature(storeId, FEATURES.DIGITAL_BUTLER);
}

/**
 * Runtime-only activation check. PR-1 intentionally exposes no mutation for
 * this flag, leaving every store disabled after this additive migration.
 */
export async function requireDigitalButlerConversationActivation(
  storeId: string,
): Promise<void> {
  await requireDigitalButlerEntitlement(storeId);
  if (isSpaDemoStoreId(storeId)) return;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { digitalButlerEnabled: true },
  });
  if (!store?.digitalButlerEnabled) {
    throw new AppError("FORBIDDEN", "數位管家目前未啟用");
  }
}
