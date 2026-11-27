import "server-only";
import { prisma } from "@/lib/db";
import { replySteamButlerMessage } from "@/lib/line";
import { selectBrandAiAnswer, type BrandAiEnv } from "./brand-ai-provider";

type Input = {
  webhookEventId?: string;
  userId?: string;
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
  }: { env?: BrandAiEnv; transport?: typeof fetch } = {},
) {
  // Default off. No DB read/write, provider call or reply for anyone else.
  if (env.BRAND_AI_ENABLED !== "1" || !input.userId || !input.replyToken)
    return;
  const allowed = (env.BRAND_AI_ALLOWED_LINE_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!allowed.includes(input.userId)) return;
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
    await prisma.brandAiReplyLog.create({
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
  try {
    const answer = await selectBrandAiAnswer(input.text, env, transport);
    const latencyMs = Math.min(2147483647, Math.max(0, Date.now() - started));
    // Keep ERROR until LINE confirms success. If persistence fails, do not send.
    await prisma.brandAiReplyLog.update({
      where: { webhookEventId },
      data: {
        faqId: answer.faqId,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        latencyMs,
      },
    });
    const reply = await replySteamButlerMessage(input.replyToken, [
      { type: "text", text: answer.text },
    ]);
    const outcome = reply.success ? answer.outcome : "ERROR";
    await prisma.brandAiReplyLog.update({
      where: { webhookEventId },
      data: { outcome },
    });
    log("brand_ai_result", { outcome, faqId: answer.faqId, latencyMs });
  } catch {
    // No exception payloads: SDK/DB/transport errors can contain private inputs.
    log("brand_ai_processing_failed", { outcome: "ERROR" });
  }
}
