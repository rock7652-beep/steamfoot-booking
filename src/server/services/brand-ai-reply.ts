import "server-only";
import {
  loadBrandMemory,
  saveBrandMemory,
  brandMemoryCurrent,
  type BrandMemory,
} from "./brand-ai-memory";
import type { BrandAiStage, BrandAiDiagnostics } from "./brand-ai-diagnostics";
import { prisma } from "@/lib/db";
import { replySteamButlerMessage } from "@/lib/line";
import { selectBrandAiAnswer, type BrandAiEnv } from "./brand-ai-provider";
import {
  reserveBrandAiCall,
  releaseBrandAiCall,
  claimLimitedBrandAiReply,
} from "./brand-ai-quota";
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
    log("brand_ai_event_invalid", {
      outcome: "ERROR",
      code: "EVENT_INVALID",
      stage: "configuration",
    });
    return;
  }
  const rawCallLimit =
    env.BRAND_AI_MODEL_CALL_LIMIT ?? env.BRAND_AI_REPLY_LOG_LIMIT;
  if (
    rawCallLimit !== undefined &&
    (!/^(0|[1-9]\d*)$/.test(rawCallLimit) ||
      !Number.isSafeInteger(Number(rawCallLimit)))
  ) {
    log("brand_ai_limit_invalid", {
      code: "CALL_LIMIT_INVALID",
      stage: "configuration",
    });
    return;
  }
  const callLimit =
    rawCallLimit === undefined ? undefined : Number(rawCallLimit);
  const started = Date.now();
  try {
    // Unique key is the claim. A crash/error never releases it or retries a reply.
    const ceiling = env.BRAND_AI_REPLY_LOG_LIMIT;
    if (ceiling !== undefined) {
      if (
        !/^(0|[1-9]\d*)$/.test(ceiling) ||
        !Number.isSafeInteger(Number(ceiling))
      ) {
        log("brand_ai_limit_invalid", {
          outcome: "ERROR",
          code: "REPLY_LIMIT_INVALID",
          stage: "configuration",
        });
        return;
      }
      if (
        !(await claimLimitedBrandAiReply(
          webhookEventId,
          Number(ceiling),
          database,
        ))
      ) {
        log("brand_ai_limit_reached", {
          outcome: "ERROR",
          code: "REPLY_LIMIT_REACHED",
          stage: "budget",
        });
        return;
      }
    } else {
      await database.brandAiReplyLog.create({
        data: { webhookEventId, outcome: "ERROR" },
      });
    }
  } catch (error) {
    const duplicate =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002";
    log(duplicate ? "brand_ai_duplicate" : "brand_ai_claim_failed", {
      outcome: "ERROR",
      code: duplicate ? "DUPLICATE" : "CLAIM_WRITE_FAILED",
      stage: "storage",
    });
    return;
  }
  let reserved = false;
  let memory: BrandMemory | undefined;
  let stage: BrandAiStage = "memory";
  let diagnostic: BrandAiDiagnostics | undefined;
  try {
    if (env.BRAND_AI_VERSION === "2") {
      if (!safe()) return;
      memory = await loadBrandMemory(input.userId!, database);
    }
    stage = "provider";
    const answer = await selectBrandAiAnswer(
      input.text,
      env,
      transport,
      async (attempt = 1) => {
        if (!safe()) return false;
        const status = memory
          ? await reserveBrandAiCall(
              webhookEventId,
              database,
              60_000,
              attempt,
              callLimit,
            )
          : await reserveBrandAiCall(
              webhookEventId,
              database,
              30_000,
              attempt,
              callLimit,
            );
        reserved = reserved || status === "allowed";
        if (status !== "allowed")
          log("brand_ai_capacity_rejected", { reason: status });
        return status === "allowed" && safe();
      },
      memory?.profile,
    );
    diagnostic = answer.diagnostics;
    stage = "storage";
    if (reserved && !memory) {
      await releaseBrandAiCall(webhookEventId, database);
      reserved = false;
    }
    const latencyMs = Math.min(2147483647, Math.max(0, Date.now() - started));
    // Keep ERROR until LINE confirms success. If persistence fails, do not send.
    await database.brandAiReplyLog.update({
      where: { webhookEventId },
      data: {
        ...(diagnostic ? { diagnostics: diagnostic } : {}),
        faqId: answer.faqId,
        ...(answer.knowledgeVersion
          ? {
              knowledgeVersion: answer.knowledgeVersion,
              knowledgeIds: answer.knowledgeIds,
            }
          : {}),
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        latencyMs,
      },
    });
    if (!safe() || (memory && !(await brandMemoryCurrent(memory, database)))) {
      log("brand_ai_suppressed", {
        outcome: "ERROR",
        code: "SAFETY_OR_SESSION_STALE",
        stage: "memory",
      });
      return;
    }
    stage = "delivery";
    const reply = await replySteamButlerMessage(
      input.replyToken!,
      [{ type: "text", text: answer.text }],
      { format: "native-text", ...(memory ? { timeoutMs: 8000 } : {}) },
    );
    const outcome = reply.success ? answer.outcome : "ERROR";
    if (!reply.success && diagnostic)
      diagnostic.failures.push({
        attempt: diagnostic.attempts,
        stage: "delivery",
        code: "LINE_SEND_FAILED",
        sourceIds: answer.knowledgeIds ?? [],
      });
    stage = "storage";
    await database.brandAiReplyLog.update({
      where: { webhookEventId },
      data: { outcome, ...(diagnostic ? { diagnostics: diagnostic } : {}) },
    });
    if (memory && reply.success && answer.profile && safe()) {
      stage = "memory";
      const saved = await saveBrandMemory(memory, answer.profile, database);
      if (!saved)
        log("brand_ai_memory_stale", {
          outcome: "ERROR",
          code: "MEMORY_STALE",
          stage: "memory",
        });
    }
    const lastFailure = diagnostic?.failures.at(-1);
    log("brand_ai_result", {
      outcome,
      faqId: answer.faqId,
      latencyMs,
      ...(diagnostic
        ? {
            attempts: diagnostic.attempts,
            route: diagnostic.route,
            code: lastFailure?.code ?? "OK",
            stage: lastFailure?.stage ?? "validation",
            sourceIds: (answer.knowledgeIds ?? []).join(","),
          }
        : {}),
    });
  } catch {
    // No exception payloads: SDK/DB/transport errors can contain private inputs.
    log("brand_ai_processing_failed", {
      outcome: "ERROR",
      code: "RUNTIME_ERROR",
      stage,
      attempts: diagnostic?.attempts ?? 0,
    });
  } finally {
    if (reserved) {
      try {
        await releaseBrandAiCall(webhookEventId, database);
      } catch {
        log("brand_ai_lease_cleanup_failed", {
          outcome: "ERROR",
          code: "LEASE_RELEASE_FAILED",
          stage: "storage",
        });
      }
    }
  }
}
