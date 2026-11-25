import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { AI_HANDOFF_TEXT, AI_LIMITS, aiAnswerSchema, aiChannelSchema, aiModuleSchema, aiModelSchema, redactAiText, type AiChannel, type AiModule } from "./contracts";
import { selectAiKnowledge, renderAiAnswer } from "./knowledge";
import { aiCostMicros, assertAiInputBound, type AiProvider, type AiRate } from "./provider";
import type { AiButlerRepository } from "./repository";

export type TrustedAiScope = { storeId: string; channel: AiChannel; channelAccountId: string; actorId: string; module: AiModule };
export function aiIdentity(scope: TrustedAiScope, eventId: string, secret: string) {
  if (secret.length < 32 || !scope.storeId || scope.storeId === "__all__" || !scope.channelAccountId || !scope.actorId || !eventId || eventId.length > 200) throw new Error("AI_SCOPE_REQUIRED");
  aiChannelSchema.parse(scope.channel); aiModuleSchema.parse(scope.module);
  const hash = (parts: string[]) => createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
  const scopeKey = hash([scope.storeId, scope.channel, scope.channelAccountId, scope.actorId]);
  return { storeId: scope.storeId, scopeKey, eventKey: hash([scopeKey, eventId]) };
}
export type AiServiceResult = { outcome: "ANSWER" | "HANDOFF" | "STOPPED" | "DUPLICATE"; text: string; sourceIds: string[] };
export class AiButlerService {
  constructor(private readonly repository: AiButlerRepository, private readonly provider: AiProvider,
    private readonly authorize: (scope: TrustedAiScope) => Promise<void>, private readonly identitySecret: string,
    private readonly rateForModel: (model: import("./contracts").AiModel) => AiRate | null, private readonly enabled: () => boolean, private readonly clock = () => new Date()) {}
  async respond(scope: TrustedAiScope, eventId: string, message: string, records: unknown[]): Promise<AiServiceResult> {
    const stopped: AiServiceResult = { outcome: "STOPPED", text: "AI 目前暫停服務，既有預約及數位管家不受影響。", sourceIds: [] };
    let identity: ReturnType<typeof aiIdentity> | undefined;
    let reserved = false;
    const started = this.clock();
    try {
      if (!this.enabled()) return stopped;
      await this.authorize(scope);
      identity = aiIdentity(scope, eventId, this.identitySecret);
      // Phase 1 runtime intentionally has no customer-channel entry point.
      if (scope.channel !== "TEST") return stopped;
      const safeMessage = redactAiText(z.string().min(1).max(AI_LIMITS.maxMessageChars).parse(message));
      const knowledge = selectAiKnowledge(scope.storeId, scope.module, records, started);
      const { setting } = await this.repository.setting(scope.storeId);
      const model = aiModelSchema.parse(setting.model);
      const rate = this.rateForModel(model);
      if (this.provider.kind === "openai" && !rate) return stopped;
      const ceiling = rate ? aiCostMicros(rate, AI_LIMITS.maxInputTokens, AI_LIMITS.maxOutputTokens) : 0;
      const claim = await this.repository.reserve({ ...identity, model, heldMicros: ceiling, provider: this.provider.kind, now: started }, scope.channel);
      if (claim.duplicate) return { outcome: "DUPLICATE", text: "", sourceIds: [] };
      reserved = true;
      const providerInput = { model, message: safeMessage, knowledge, summary: claim.summary };
      assertAiInputBound(providerInput);
      const result = await this.provider.respond(providerInput);
      const answer = aiAnswerSchema.parse(result.answer);
      if (![result.inputTokens, result.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("AI_USAGE_INVALID");
      const cost = rate ? aiCostMicros(rate, result.inputTokens, result.outputTokens) : 0;
      const rendered = renderAiAnswer(answer, selectAiKnowledge(scope.storeId, scope.module, knowledge, this.clock()));
      if (this.provider.kind === "openai" && /^ai-preview-(steamfoot|beauty|fitness|music)$/.test(scope.storeId)) {
        // Synthetic Preview diagnostics only; no text, IDs, credentials or actor data.
        console.info("[ai-preview] source_selection", { model, action: answer.action,
          suppliedSources: knowledge.length, selectedSources: answer.sourceIds.length,
          selectedSourceAllowed: answer.sourceIds.length === 1 && knowledge.some(row => row.id === answer.sourceIds[0]),
          handoff: rendered.handoff });
      }
      // Identity/HQ/global/tenant state is checked again after the network await.
      await this.authorize(scope);
      const allowed = await this.repository.settle(identity, { cost, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        latencyMs: Math.max(0, this.clock().getTime() - started.getTime()), handoff: rendered.handoff,
        summary: rendered.handoff ? "HANDOFF" : `SOURCE:${answer.sourceIds[0]}`,
        overrun: result.inputTokens > AI_LIMITS.maxInputTokens || result.outputTokens > AI_LIMITS.maxOutputTokens || cost > ceiling }, this.clock());
      reserved = false;
      if (!allowed || !this.enabled()) return stopped;
      return { outcome: rendered.handoff ? "HANDOFF" : "ANSWER", text: rendered.text, sourceIds: rendered.handoff ? [] : answer.sourceIds };
    } catch {
      if (reserved && identity) await this.repository.unknown(identity, this.clock()).catch(() => undefined);
      return reserved ? { outcome: "HANDOFF", text: AI_HANDOFF_TEXT, sourceIds: [] } : stopped;
    }
  }
}
