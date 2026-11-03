import "server-only";
import { cache } from "react";
import { OperationTiming } from "@/lib/operation-timing";
import { resolveStorePresentation } from "@/lib/store-resolver";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getIndustryModule } from "@/lib/industry-modules";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

/** Request-local deduplication for layout and page; no cross-user/store TTL cache. */
export const readLiffPublicContext = cache(async (slug: string) => {
  const timing = new OperationTiming("liff.entry.public_context");
  try {
    const store = await timing.measure("store_presentation", () => resolveStorePresentation(slug));
    if (!store) return null;
    const industry = getIndustryModule(await timing.measure("module", () => getStoreIndustryModule(store.id)));
    const healthEnabled = industry.features.healthAssessment
      ? await timing.measure("health_feature", () => hasStoreFeature(store.id, FEATURES.AI_HEALTH_SUMMARY).catch(() => false))
      : false;
    return { store, industry, healthEnabled };
  } finally { timing.finish(); }
});
