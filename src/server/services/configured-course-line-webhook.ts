import { prisma } from "@/lib/db";
import { verifyLineSignature } from "@/lib/line";
import { readStoreLineConfigs } from "@/lib/store-line-config";
import { handleConfiguredCourseLineFollow } from "./course-line-follow";

/** OA events describe friendship, not a booking's store. Never choose the
 * first store or run legacy phone binding for a configured course account. */
export async function handleConfiguredCourseLineWebhook(input: {
  destination?: string;
  body: string;
  signature: string | null;
  events: Parameters<typeof handleConfiguredCourseLineFollow>[1][];
}): Promise<"unconfigured" | "invalid_signature" | "handled"> {
  const configs = readStoreLineConfigs().filter(c => c.destination === input.destination);
  if (!configs.length) return "unconfigured";
  // The config parser guarantees identical channel and secret ENV names for
  // explicit shared accounts. Verify the physical channel once, before reads.
  if (!input.signature || !verifyLineSignature(configs[0].storeId, input.body, input.signature)) {
    return "invalid_signature";
  }
  const stores = await Promise.all(configs.map(config => prisma.store.findFirst({
    where: { id: config.storeId, slug: config.slug, industryModule: "COURSE" },
    select: { id: true },
  })));
  if (stores.some(store => !store)) return "handled";
  for (const event of input.events) {
    for (const config of configs) {
      try {
        await handleConfiguredCourseLineFollow(config, event);
      } catch {
        console.error("[Course LINE] Friendship event failed", { storeId: config.storeId });
      }
    }
  }
  return "handled";
}
