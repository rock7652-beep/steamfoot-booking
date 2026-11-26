import "server-only";
import { z } from "zod";
import { AI_HANDOFF_TEXT, AI_LIMITS, aiAnswerSchema, aiModelSchema, redactAiText, type AiChannel, type AiModel } from "./contracts";
import { aiTopicBlocked, aiProtectedRequest } from "./knowledge-document";
import { renderAiAnswer } from "./knowledge";
import { aiCostMicros, assertAiInputBound, type AiProvider, type AiProviderKnowledge, type AiRate } from "./provider";
import type { AiOwnerRepository, AiOwnerReservation } from "./owner-repository";
export interface AiServiceRepository<I> {
  setting(ownerId: string): ReturnType<AiOwnerRepository["setting"]>;
  reserve(input: I & Omit<AiOwnerReservation, "ownerId" | "scopeKey" | "eventKey">, channel: string): ReturnType<AiOwnerRepository["reserve"]>;
  settle(input: I, result: Parameters<AiOwnerRepository["settle"]>[1], now: Date): Promise<boolean>;
  unknown(input: I, now: Date): Promise<void>;
}
export interface AiServiceAdapter<S, I, K, P> {
  handoffText?: string;
  stoppedText?: string;
  capture(scope: S): S;
  identity(scope: S, eventId: string, secret: string): I;
  ownerId(scope: S): string;
  select(scope: S, records: unknown[], now: Date): K[];
  matches(scope: S, snapshot: P): boolean;
  selected?(scope: S, details: { model: AiModel; action: string; suppliedSources: number; selectedSources: number; selectedSourceAllowed: boolean; handoff: boolean }): void;
}
export type AiServiceResult = { outcome: "ANSWER" | "HANDOFF" | "STOPPED" | "DUPLICATE"; text: string; sourceIds: string[] };
export class AiServiceCore<S extends { channel: AiChannel }, I extends { scopeKey: string; eventKey: string }, K extends AiProviderKnowledge, P extends { records: K[]; fingerprint: string; prohibitedTerms: string[] }> {
  constructor(private readonly repository: AiServiceRepository<I>, private readonly provider: AiProvider,
    private readonly authorize: (scope: S) => Promise<void>, private readonly identitySecret: string,
    private readonly rateForModel: (model: AiModel) => AiRate | null, private readonly enabled: () => boolean, private readonly clock = () => new Date(), private readonly channels: readonly AiChannel[], private readonly adapter: AiServiceAdapter<S, I, K, P>) {}
  async respond(scope: S, eventId: string, message: string, records: unknown[], published?: { snapshot: P; reload: () => Promise<P>; conversationRevision?: number }): Promise<AiServiceResult> {
    const stopped: AiServiceResult = { outcome: "STOPPED", text: this.adapter.stoppedText ?? "AI 目前暫停服務，既有預約及數位管家不受影響。", sourceIds: [] };
    let identity: I | undefined;
    let reserved = false;
    const started = this.clock();
    try {
      scope = this.adapter.capture(scope);
      if (!this.enabled()) return stopped;
      await this.authorize(scope);
      identity = this.adapter.identity(scope, eventId, this.identitySecret);
      // Channel capability is opt-in by the isolated, verified Webhook adapter.
      if (!this.channels.includes(scope.channel)) return stopped;
      const safeMessage = redactAiText(z.string().min(1).max(AI_LIMITS.maxMessageChars).parse(message));
      const knowledge = this.adapter.select(scope, records, started);
      const { setting } = await this.repository.setting(this.adapter.ownerId(scope));
      const model = aiModelSchema.parse(setting.model);
      const rate = this.rateForModel(model);
      if (this.provider.kind === "openai" && !rate) return stopped;
      const ceiling = rate ? aiCostMicros(rate, AI_LIMITS.maxInputTokens, AI_LIMITS.maxOutputTokens) : 0;
      assertAiInputBound({ model, message: safeMessage, knowledge, summary: Array(4).fill("SOURCE:" + "x".repeat(100)) });
      const claim = await this.repository.reserve({ ...identity, model, heldMicros: ceiling, provider: this.provider.kind, now: started, expectedConversationRevision: published?.conversationRevision }, scope.channel);
      if (claim.duplicate) return { outcome: "DUPLICATE", text: "", sourceIds: [] };
      reserved = true;
      const providerInput = { model, message: safeMessage, knowledge, summary: claim.summary };
      assertAiInputBound(providerInput);
      const blocked = aiProtectedRequest(message) || (published && (!this.adapter.matches(scope, published.snapshot) || !knowledge.length || aiTopicBlocked(message, published.snapshot.prohibitedTerms)));
      const result = blocked ? { answer: { action: "handoff" as const, sourceIds: [] }, inputTokens: 0, outputTokens: 0 } : await this.provider.respond(providerInput);
      const answer = aiAnswerSchema.parse(result.answer);
      if (![result.inputTokens, result.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("AI_USAGE_INVALID");
      const cost = rate ? aiCostMicros(rate, result.inputTokens, result.outputTokens) : 0;
      let currentKnowledge = knowledge;
      if (published) {
        try {
          const current = await published.reload();
          currentKnowledge = current.fingerprint === published.snapshot.fingerprint && this.adapter.matches(scope, current) && !aiTopicBlocked(message, current.prohibitedTerms) ? current.records : [];
        } catch { currentKnowledge = []; }
      }
      const rendered = renderAiAnswer(answer, this.adapter.select(scope, currentKnowledge, this.clock()));
      this.adapter.selected?.(scope, { model, action: answer.action, suppliedSources: knowledge.length,
        selectedSources: answer.sourceIds.length, selectedSourceAllowed: answer.sourceIds.length === 1 && knowledge.some(row => row.id === answer.sourceIds[0]), handoff: rendered.handoff });
      // Identity/HQ/global/tenant state is checked again after the network await.
      await this.authorize(scope);
      const allowed = await this.repository.settle(identity, { cost, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        latencyMs: Math.max(0, this.clock().getTime() - started.getTime()), handoff: rendered.handoff,
        summary: rendered.handoff ? "HANDOFF" : `SOURCE:${answer.sourceIds[0]}`,
        conversationRevision: claim.conversationRevision, channel: scope.channel,
        overrun: result.inputTokens > AI_LIMITS.maxInputTokens || result.outputTokens > AI_LIMITS.maxOutputTokens || cost > ceiling }, this.clock());
      reserved = false;
      if (!allowed || !this.enabled()) return stopped;
      return { outcome: rendered.handoff ? "HANDOFF" : "ANSWER", text: rendered.handoff ? (this.adapter.handoffText ?? rendered.text) : rendered.text, sourceIds: rendered.handoff ? [] : answer.sourceIds };
    } catch {
      if (reserved && identity) await this.repository.unknown(identity, this.clock()).catch(() => undefined);
      return reserved ? { outcome: "HANDOFF", text: this.adapter.handoffText ?? AI_HANDOFF_TEXT, sourceIds: [] } : stopped;
    }
  }
}
