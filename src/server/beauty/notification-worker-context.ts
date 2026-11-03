import "server-only";
import type { Prisma } from "@prisma/client";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { FEATURES, hasFeature } from "@/lib/feature-flags";
import { resolveEffectiveEntitlement } from "@/lib/effective-entitlement";
/** Recheck entitlement on the caller's connection: production pool size is one. */
export async function beautyWorkerLineAllowed(tx: Prisma.TransactionClient, storeId: string, now = new Date()) {
    const [store, grant] = await Promise.all([
        getStoreForPlanByStoreId(storeId, tx),
        tx.storeFeatureEntitlement.findUnique({ where: { uq_store_feature_entitlement: { storeId, featureKey: FEATURES.LINE_REMINDER } } }),
    ]);
    const current = grant && (!grant.startsAt || grant.startsAt <= now) && (!grant.expiresAt || grant.expiresAt >= now) ? grant : null;
    if (current?.status === 'HIDDEN' || current?.status === 'LOCKED')
        return false;
    if (current?.status === 'ENABLED' || store.plan === 'EXPERIENCE')
        return true;
    return resolveEffectiveEntitlement(hasFeature(store.plan, FEATURES.LINE_REMINDER), current, now).enabled;
}
