import "server-only";
import { prisma } from "@/lib/db";
import { replySteamButlerMessage } from "@/lib/line";
import { selectBrandAiAnswer, type BrandAiEnv } from "./brand-ai-provider";
import { reserveBrandAiCall, releaseBrandAiCall } from "./brand-ai-quota";
import { isSystemLineDeliveryPaused } from "@/lib/line-delivery-pause";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { getSteamButlerLineAccessToken } from "@/lib/line-config";

type Input = {
  webhookEventId?: string;
  userId?: string;
  sourceType?: string;
  replyToken?: string;
  text: string;
};
type Log = (
  event: string,
  fields?: Record<string, string | number | null>,
) => void;

export async function handleBrandAiText(
  input: Input,
  log: Log,
  {
    env = process.env,
    transport = fetch,
    database = prisma,
  }: {
    env?: BrandAiEnv;
    transport?: typeof fetch;
    database?: typeof prisma;
  } = {},
) {
  // Default off. No DB read/write, provider call or reply for anyone else.
  const safe = () =>
    env.BRAND_AI_ENABLED === "1" &&
    input.sourceType === "user" &&
    Boolean(input.userId && input.replyToken) &&
    (env.BRAND_AI_ALLOWED_LINE_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .includes(input.userId!) &&
    !isSystemLineDeliveryPaused() &&
    !isPreviewExternalIntegrationBlocked() &&
    Boolean(getSteamButlerLineAccessToken());
  if (!safe()) return;
  if (input.text === "找到適合方案" || input.text === "我想了解適合我的方案")
    return;
  const webhookEventId = input.webhookEventId;
  if (!webhookEventId || webhookEventId.length > 200) {
    log("brand_ai_event_invalid", { outcome: "ERROR" });
    return;
  }
  const started = Date.now();
  try {
    // Unique key is the claim. A crash/error never releases it or retries a reply.
    await database.brandAiReplyLog.create({
      data: { webhookEventId, outcome: "ERROR" },
    });
  } catch (error) {
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";
    log(duplicate ? "brand_ai_duplicate" : "brand_ai_claim_failed", {
      outcome: "ERROR",
    });
    return;
  }
  let reserved = false;
  try {
    const answer = await selectBrandAiAnswer(
      input.text,
      env,
      transport,
      async () => {
        if (!safe()) return false;
        const status = await reserveBrandAiCall(webhookEventId, database);
        reserved = status === "allowed";
        if (!reserved) log("brand_ai_capacity_rejected", { reason: status });
        return reserved && safe();
      },
    );
    if (reserved) {
      await releaseBrandAiCall(webhookEventId, database);
      reserved = false;
    }
    const latencyMs = Math.min(2147483647, Math.max(0, Date.now() - started));
    // Keep ERROR until LINE confirms success. If persistence fails, do not send.
    await database.brandAiReplyLog.update({
      where: { webhookEventId },
      data: {
        faqId: answer.faqId,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        latencyMs,
      },
    });
    if (!safe()) {
      log("brand_ai_suppressed", { outcome: "ERROR" });
      return;
    }
    const reply = await replySteamButlerMessage(input.replyToken!, [
      { type: "text", text: answer.text },
    ]);
    const outcome = reply.success ? answer.outcome : "ERROR";
    await database.brandAiReplyLog.update({
      where: { webhookEventId },
      data: { outcome },
    });
    log("brand_ai_result", { outcome, faqId: answer.faqId, latencyMs });
  } catch {
    // No exception payloads: SDK/DB/transport errors can contain private inputs.
    log("brand_ai_processing_failed", { outcome: "ERROR" });
  } finally {
    if (reserved) {
      try {
        await releaseBrandAiCall(webhookEventId, database);
      } catch {
        log("brand_ai_lease_cleanup_failed", { outcome: "ERROR" });
      }
    }
  }
}
