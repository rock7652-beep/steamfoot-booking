import { prisma } from "@/lib/db";
import { verifyLineSignature, replyMessage } from "@/lib/line";
import { readStoreLineConfigs } from "@/lib/store-line-config";
import { handleConfiguredCourseLineFollow } from "./course-line-follow";
import { handleMemberConnectionWebhook } from "./store-member-connection-webhook";
import { captureStoreMemberConnection, connectionReplyText } from "./store-member-connection";
import { normalizePhone } from "@/lib/normalize";

/** OA events describe friendship, not a booking's store. Never choose the
 * first store or run legacy phone binding for a configured course account. */
export async function handleConfiguredCourseLineWebhook(input: {
  destination?: string;
  body: string;
  signature: string | null;
  events: Array<Parameters<typeof handleConfiguredCourseLineFollow>[1] & { message?: { type?: string; text?: string }; replyToken?: string }>;
}): Promise<"unconfigured" | "invalid_signature" | "handled"> {
  const configs = readStoreLineConfigs().filter(c => c.destination === input.destination);
  if (!configs.length) return "unconfigured";
  // The config parser guarantees identical channel and secret ENV names for
  // explicit shared accounts. Verify the physical channel once, before reads.
  if (!input.signature || !verifyLineSignature(configs[0].storeId, input.body, input.signature)) {
    return "invalid_signature";
  }
  const stores = await Promise.all(configs.map(config => prisma.store.findFirst({
    where: { id: config.storeId, slug: config.slug },
    select: { id: true },
  })));
  if (stores.some(store => !store)) return "handled";
  for (const event of input.events) {
    if (await handleMemberConnectionWebhook({ destination: input.destination!, storeIds: configs.map(c => c.storeId), event })) continue;
    const phone = normalizePhone(event.message?.text ?? "");
    if (event.type === "message" && event.message?.type === "text" && /^09\d{8}$/.test(phone) && event.source?.userId) {
      const text = configs.length === 1
        ? await connectionReplyText(await captureStoreMemberConnection({ storeId: configs[0].storeId, destination: input.destination!, lineUserId: event.source.userId, phone, timestamp: event.timestamp ?? 0 }), configs[0].storeId, event.source.userId)
        : "此官方 LINE 有多家門市，請掃您交件門市的 QR 完成連結。電話尚未綁定。";
      if (event.replyToken) await replyMessage(configs[0].storeId, event.replyToken, [{ type: "text", text }]);
      continue;
    }
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
