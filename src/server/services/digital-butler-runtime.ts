import { Prisma, type DigitalButlerStepType } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  hashDigitalButlerSensitiveValue,
  encryptDigitalButlerValue,
  decryptDigitalButlerValue,
} from "@/lib/digital-butler-crypto";
import { requireDigitalButlerConversationActivation } from "@/lib/digital-butler-entitlement";
import {
  classifyDigitalButlerGlobalCommand,
  type DigitalButlerGlobalCommand,
} from "@/lib/digital-butler-global-command";
import { normalizePhone } from "@/lib/normalize";
import { assertDigitalButlerSubmittedAnswersSafe } from "@/lib/digital-butler-sensitive-json";
import type {
  DigitalButlerInboundTextMessage,
  DigitalButlerOutboundMessageIntent,
} from "@/server/services/digital-butler-channel";
import { notifyStoreManagerOnLine } from "@/server/services/store-manager-line-notifications";

const ACTIVE_STATUSES = ["IN_PROGRESS", "WAITING_INPUT"] as const;
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

type RuntimeStep = {
  id: string;
  stepKey: string;
  position: number;
  type: DigitalButlerStepType;
  config: Prisma.JsonValue;
  required: boolean;
};

type RuntimeConversation = {
  id: string;
  storeId: string;
  flowId: string;
  flowVersionId: string;
  currentStepKey: string | null;
  expiresAt: Date;
  flowVersion: { steps: RuntimeStep[] };
  answers: Array<{
    step: { stepKey: string };
    value: Prisma.JsonValue | null;
    phoneCiphertext?: Uint8Array | null;
    phoneIv?: Uint8Array | null;
    phoneAuthTag?: Uint8Array | null;
    phoneHash?: string | null;
  }>;
};

export type DigitalButlerRuntimeResult = {
  handled: boolean;
  messages: DigitalButlerOutboundMessageIntent[];
  outcome: string;
  replyGuard?: {
    conversationId: string;
    requiresActiveConversation: true;
  };
};

type RuntimeRepository = {
  claimEvent(input: {
    storeId: string;
    provider: DigitalButlerInboundTextMessage["provider"];
    eventKey: string;
    webhookEventId?: string;
    fallbackEventHash?: string;
  }): Promise<boolean>;
  setEventOutcome(storeId: string, eventKey: string, outcome: string, conversationId?: string): Promise<void>;
  findActiveConversation(
    storeId: string,
    provider: DigitalButlerInboundTextMessage["provider"],
    channelAccountId: string,
    senderIdHash: string,
  ): Promise<RuntimeConversation | null>;
  expireConversation(storeId: string, conversationId: string): Promise<void>;
  cancelConversation(storeId: string, conversationId: string): Promise<boolean>;
  findTriggeredFlow(storeId: string, text: string): Promise<{
    id: string;
    currentPublishedVersionId: string;
    publishedVersion: { definition: Prisma.JsonValue; steps: RuntimeStep[] };
    startStepKey: string | null;
  } | null>;
  createConversation(input: {
    storeId: string;
    flowId: string;
    flowVersionId: string;
    provider: DigitalButlerInboundTextMessage["provider"];
    channelAccountId: string;
    senderIdHash: string;
    senderIdCiphertext: Uint8Array<ArrayBuffer>;
    senderIdIv: Uint8Array<ArrayBuffer>;
    senderIdAuthTag: Uint8Array<ArrayBuffer>;
    senderIdKeyVersion: string;
    currentStepKey: string | null;
    expiresAt: Date;
  }): Promise<RuntimeConversation>;
  saveAnswer(input: {
    storeId: string;
    conversationId: string;
    step: RuntimeStep;
    value?: Prisma.InputJsonValue;
    phone?: string;
  }): Promise<boolean>;
  advanceConversation(input: {
    storeId: string;
    conversationId: string;
    currentStepKey: string | null;
    status: "IN_PROGRESS" | "WAITING_INPUT" | "COMPLETED";
  }): Promise<boolean>;
  createLead(input: {
    storeId: string;
    flowId: string;
    conversationId: string;
    completionActionKey: string;
    submittedAnswers: Prisma.InputJsonObject;
  }): Promise<boolean>;
  deliverReplyIfActive(
    storeId: string,
    conversationId: string,
    deliver: () => Promise<void>,
  ): Promise<boolean>;
};

function objectConfig(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textFromConfig(step: RuntimeStep): string {
  const config = objectConfig(step.config);
  for (const key of ["text", "prompt", "message"]) {
    if (typeof config[key] === "string" && config[key].trim()) return config[key].trim();
  }
  return "";
}

function triggerKeywords(definition: Prisma.JsonValue): string[] {
  const config = objectConfig(definition);
  const trigger = objectConfig((config.trigger ?? {}) as Prisma.JsonValue);
  const candidates = trigger.keywords ?? config.triggerKeywords ?? config.keywords;
  return Array.isArray(candidates)
    ? candidates.filter((value): value is string => typeof value === "string").map((value) => value.trim())
    : typeof candidates === "string" ? [candidates.trim()] : [];
}

function eventIdentity(input: DigitalButlerInboundTextMessage): {
  eventKey: string;
  fallbackEventHash?: string;
} | null {
  const providerKey = input.provider.toLowerCase();
  if (input.webhookEventId) return { eventKey: `${providerKey}:${input.webhookEventId}` };
  if (!input.occurredAt || !input.messageId) return null;
  const fallbackEventHash = hashDigitalButlerSensitiveValue([
    input.provider,
    input.storeId,
    input.channelAccountId,
    input.senderId,
    input.occurredAt.getTime(),
    input.messageId,
    "message.text",
  ].join(":"));
  return { eventKey: `${providerKey}:fallback:${fallbackEventHash}`, fallbackEventHash };
}

function questionMessage(
  step: RuntimeStep,
  error?: string,
): DigitalButlerOutboundMessageIntent {
  const config = objectConfig(step.config);
  const prompt = error ?? textFromConfig(step) ?? "請輸入回答";
  const options = Array.isArray(config.options)
    ? config.options.filter((option): option is Record<string, unknown> =>
        Boolean(option) && typeof option === "object" && !Array.isArray(option))
    : [];
  return {
    type: "text",
    text: prompt,
    ...(step.type === "SINGLE_CHOICE" && options.length
      ? {
          choices: options.slice(0, 13).flatMap((option) => {
              const label = typeof option.label === "string" ? option.label : null;
              const value = typeof option.value === "string" ? option.value : label;
              return label && value
                ? [{ label, value }]
                : [];
            }),
        }
      : {}),
  };
}

type InformationIntent = "PRICE" | "LOCATION";

const INFORMATION_INTENTS: ReadonlyArray<{
  intent: InformationIntent;
  matches: (text: string) => boolean;
  stepKeyPattern: RegExp;
}> = [
  {
    intent: "PRICE",
    matches: (text) => /(?:多少錢|費用|價格|價錢)/.test(text),
    stepKeyPattern: /(?:price|fee|cost|費用|價格|價錢)/i,
  },
  {
    intent: "LOCATION",
    matches: (text) => /(?:地址|在哪裡|營業時間)/.test(text),
    stepKeyPattern: /(?:address|location|hours|地址|地點|營業時間)/i,
  },
];

/**
 * Answers a configured informational TEXT step without changing the active
 * conversation. Step keys are deliberately used only as stable flow metadata:
 * the customer-facing reply continues to come from the published step config.
 */
function informationReply(
  steps: RuntimeStep[],
  input: string,
): DigitalButlerOutboundMessageIntent | null {
  const intent = INFORMATION_INTENTS.find((candidate) => candidate.matches(input));
  if (!intent) return null;

  const step = steps.find((candidate) =>
    candidate.type === "TEXT" && intent.stepKeyPattern.test(candidate.stepKey));
  const text = step ? textFromConfig(step) : "";
  return text ? { type: "text", text } : null;
}

function validateAnswer(step: RuntimeStep, text: string): { value?: Prisma.InputJsonValue; phone?: string; error?: string } {
  if (step.type === "TAIWAN_MOBILE") {
    const phone = normalizePhone(text);
    return /^09\d{8}$/.test(phone)
      ? { phone }
      : { error: "手機格式不正確，請輸入 09 開頭的 10 碼手機號碼。" };
  }
  if (step.type === "SINGLE_CHOICE") {
    const options = objectConfig(step.config).options;
    const matched = Array.isArray(options)
      ? options.find((option) => {
          const value = objectConfig(option as Prisma.JsonValue);
          return value.value === text || value.label === text;
        })
      : undefined;
    if (!matched) return { error: "請點選下方提供的選項。" };
    const option = objectConfig(matched as Prisma.JsonValue);
    return { value: { value: String(option.value ?? option.label), label: String(option.label ?? option.value) } };
  }
  if (step.required && !text.trim()) return { error: "此題為必填，請輸入回答。" };
  const maxLength = Number(objectConfig(step.config).maxLength ?? 500);
  if (text.length > maxLength) return { error: `回答請勿超過 ${maxLength} 個字。` };
  try {
    assertDigitalButlerSubmittedAnswersSafe(text);
  } catch {
    return { error: "為保護個資，這一題請勿輸入手機、Email 或 LINE ID。" };
  }
  return { value: text };
}

function configuredNextStepKey(step: RuntimeStep, answer?: Prisma.InputJsonValue): string | null {
  const config = objectConfig(step.config);
  if (step.type === "SINGLE_CHOICE" && answer && typeof answer === "object" && !Array.isArray(answer)) {
    const selectedValue = objectConfig(answer as Prisma.JsonValue).value;
    const options = Array.isArray(config.options) ? config.options : [];
    const selected = options.find((option) => {
      const parsed = objectConfig(option as Prisma.JsonValue);
      return parsed.value === selectedValue || (parsed.value === undefined && parsed.label === selectedValue);
    });
    const optionTarget = selected ? objectConfig(selected as Prisma.JsonValue).nextStepKey : null;
    if (typeof optionTarget === "string" && optionTarget.trim()) return optionTarget.trim();
  }
  return typeof config.nextStepKey === "string" && config.nextStepKey.trim()
    ? config.nextStepKey.trim()
    : null;
}

function nextStepIndex(steps: RuntimeStep[], currentIndex: number, answer?: Prisma.InputJsonValue): number {
  const target = configuredNextStepKey(steps[currentIndex], answer);
  return target ? steps.findIndex((step) => step.stepKey === target) : currentIndex + 1;
}

export function topLevelChoiceEntryStepKey(steps: RuntimeStep[], text: string): string | null {
  const menuStep = steps.find((step) => step.type === "SINGLE_CHOICE");
  if (!menuStep) return null;
  const options = objectConfig(menuStep.config).options;
  const selected = Array.isArray(options)
    ? options.find((option) => {
        const parsed = objectConfig(option as Prisma.JsonValue);
        return parsed.label === text || parsed.value === text;
      })
    : null;
  const startStepKey = selected
    ? objectConfig(selected as Prisma.JsonValue).nextStepKey
    : null;
  return typeof startStepKey === "string" && startStepKey.trim()
    ? startStepKey.trim()
    : null;
}

class PrismaDigitalButlerRuntimeRepository implements RuntimeRepository {
  async claimEvent(input: {
    storeId: string;
    provider: DigitalButlerInboundTextMessage["provider"];
    eventKey: string;
    webhookEventId?: string;
    fallbackEventHash?: string;
  }) {
    try {
      await prisma.digitalButlerExecutionLog.create({
        data: { ...input, eventType: "message.text", outcome: "CLAIMED" },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async setEventOutcome(storeId: string, eventKey: string, outcome: string, conversationId?: string) {
    await prisma.digitalButlerExecutionLog.update({
      where: { storeId_eventKey: { storeId, eventKey } },
      data: { outcome, conversationId },
    });
  }

  async findActiveConversation(
    storeId: string,
    provider: DigitalButlerInboundTextMessage["provider"],
    channelAccountId: string,
    senderIdHash: string,
  ) {
    return prisma.digitalButlerConversation.findFirst({
      where: { storeId, provider, channelAccountId, senderIdHash, status: { in: [...ACTIVE_STATUSES] } },
      include: {
        flowVersion: { include: { steps: { orderBy: { position: "asc" } } } },
        answers: {
          select: {
            value: true, phoneCiphertext: true, phoneIv: true,
            phoneAuthTag: true, phoneHash: true,
            step: { select: { stepKey: true } },
          },
        },
      },
    }) as Promise<RuntimeConversation | null>;
  }

  async expireConversation(storeId: string, conversationId: string) {
    await prisma.digitalButlerConversation.updateMany({
      where: { id: conversationId, storeId, status: { in: [...ACTIVE_STATUSES] } },
      data: { status: "EXPIRED" },
    });
  }

  async cancelConversation(storeId: string, conversationId: string) {
    const cancelled = await prisma.digitalButlerConversation.updateMany({
      where: { id: conversationId, storeId, status: { in: [...ACTIVE_STATUSES] } },
      data: { status: "CANCELLED", currentStepKey: null, cancelledAt: new Date() },
    });
    return cancelled.count === 1;
  }

  async findTriggeredFlow(storeId: string, text: string) {
    const flows = await prisma.storeDigitalButlerFlow.findMany({
      where: { storeId, status: "PUBLISHED", enabled: true, currentPublishedVersionId: { not: null } },
      include: { publishedVersion: { include: { steps: { orderBy: { position: "asc" } } } } },
    });
    for (const flow of flows) {
      if (!flow.publishedVersion) continue;
      if (triggerKeywords(flow.publishedVersion.definition).includes(text)) {
        return { ...flow, startStepKey: null } as Awaited<ReturnType<RuntimeRepository["findTriggeredFlow"]>>;
      }

      // A top-level menu choice is also a safe entry point after a completed,
      // cancelled, or handed-off conversation. Only the first choice step is
      // considered so answers from deeper in a flow cannot unexpectedly start
      // a new conversation.
      const startStepKey = topLevelChoiceEntryStepKey(flow.publishedVersion.steps, text);
      if (startStepKey) {
        return {
          ...flow,
          startStepKey,
        } as Awaited<ReturnType<RuntimeRepository["findTriggeredFlow"]>>;
      }
    }
    return null;
  }

  async createConversation(input: {
    storeId: string; flowId: string; flowVersionId: string;
    provider: DigitalButlerInboundTextMessage["provider"]; channelAccountId: string;
    senderIdHash: string; senderIdCiphertext: Uint8Array<ArrayBuffer>;
    senderIdIv: Uint8Array<ArrayBuffer>; senderIdAuthTag: Uint8Array<ArrayBuffer>;
    senderIdKeyVersion: string;
    currentStepKey: string | null; expiresAt: Date;
  }) {
    return prisma.digitalButlerConversation.create({
      data: { ...input, status: "IN_PROGRESS" },
      include: {
        flowVersion: { include: { steps: { orderBy: { position: "asc" } } } },
        answers: {
          select: {
            value: true, phoneCiphertext: true, phoneIv: true,
            phoneAuthTag: true, phoneHash: true,
            step: { select: { stepKey: true } },
          },
        },
      },
    }) as Promise<RuntimeConversation>;
  }

  async saveAnswer(input: {
    storeId: string; conversationId: string; step: RuntimeStep;
    value?: Prisma.InputJsonValue; phone?: string;
  }) {
    const encrypted = input.phone ? encryptDigitalButlerValue(input.phone) : null;
    return this.withActiveConversation(input.storeId, input.conversationId, async (tx) => {
      await tx.digitalButlerAnswer.upsert({
        where: { conversationId_stepId: { conversationId: input.conversationId, stepId: input.step.id } },
        create: {
          storeId: input.storeId, conversationId: input.conversationId, stepId: input.step.id,
          value: input.value,
          phoneCiphertext: encrypted ? prismaBytes(encrypted.ciphertext) : undefined,
          phoneIv: encrypted ? prismaBytes(encrypted.iv) : undefined,
          phoneAuthTag: encrypted ? prismaBytes(encrypted.authTag) : undefined,
          phoneHash: input.phone ? hashDigitalButlerSensitiveValue(input.phone) : undefined,
        },
        update: {
          value: input.value,
          phoneCiphertext: encrypted ? prismaBytes(encrypted.ciphertext) : undefined,
          phoneIv: encrypted ? prismaBytes(encrypted.iv) : undefined,
          phoneAuthTag: encrypted ? prismaBytes(encrypted.authTag) : undefined,
          phoneHash: input.phone ? hashDigitalButlerSensitiveValue(input.phone) : undefined,
        },
      });
    });
  }

  async advanceConversation(input: {
    storeId: string; conversationId: string; currentStepKey: string | null;
    status: "IN_PROGRESS" | "WAITING_INPUT" | "COMPLETED";
  }) {
    return this.withActiveConversation(input.storeId, input.conversationId, async (tx) => {
      await tx.digitalButlerConversation.update({
        where: { id_storeId: { id: input.conversationId, storeId: input.storeId } },
        data: {
          currentStepKey: input.currentStepKey,
          status: input.status,
          completedAt: input.status === "COMPLETED" ? new Date() : undefined,
        },
      });
    });
  }

  async createLead(input: {
    storeId: string; flowId: string; conversationId: string;
    completionActionKey: string; submittedAnswers: Prisma.InputJsonObject;
  }) {
    assertDigitalButlerSubmittedAnswersSafe(input.submittedAnswers);
    return this.withActiveConversation(input.storeId, input.conversationId, async (tx) => {
      const phoneAnswer = await tx.digitalButlerAnswer.findFirst({
        where: { storeId: input.storeId, conversationId: input.conversationId, phoneHash: { not: null } },
        select: { phoneCiphertext: true, phoneIv: true, phoneAuthTag: true, phoneHash: true },
      });
      await tx.digitalButlerLead.upsert({
        where: { storeId_conversationId_completionActionKey: {
          storeId: input.storeId, conversationId: input.conversationId,
          completionActionKey: input.completionActionKey,
        } },
        create: {
          storeId: input.storeId,
          flowId: input.flowId,
          conversationId: input.conversationId,
          completionActionKey: input.completionActionKey,
          submittedAnswers: input.submittedAnswers,
          phoneCiphertext: phoneAnswer?.phoneCiphertext,
          phoneIv: phoneAnswer?.phoneIv,
          phoneAuthTag: phoneAnswer?.phoneAuthTag,
          phoneHash: phoneAnswer?.phoneHash,
        },
        update: {},
      });
    });
  }

  async deliverReplyIfActive(
    storeId: string,
    conversationId: string,
    deliver: () => Promise<void>,
  ) {
    return this.withActiveConversation(storeId, conversationId, async () => {
      await deliver();
    });
  }

  /**
   * Lock the scoped conversation while performing a state-changing action.
   * If a cancellation/handoff has committed first, the guarded action is a no-op;
   * if it is concurrent, PostgreSQL serializes it behind this row lock.
   */
  private async withActiveConversation(
    storeId: string,
    conversationId: string,
    action: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const active = await tx.digitalButlerConversation.updateMany({
        where: { id: conversationId, storeId, status: { in: [...ACTIVE_STATUSES] } },
        data: { updatedAt: new Date() },
      });
      if (active.count !== 1) return false;
      await action(tx);
      return true;
    });
  }
}

export class DigitalButlerRuntime {
  constructor(
    private readonly repository: RuntimeRepository = new PrismaDigitalButlerRuntimeRepository(),
    private readonly requireActivation: (storeId: string) => Promise<void> = requireDigitalButlerConversationActivation,
  ) {}

  async handleText(input: DigitalButlerInboundTextMessage): Promise<DigitalButlerRuntimeResult> {
    const identity = eventIdentity(input);
    if (!identity) return { handled: false, messages: [], outcome: "IDENTITY_INCOMPLETE" };
    const claimed = await this.repository.claimEvent({
      storeId: input.storeId,
      provider: input.provider,
      eventKey: identity.eventKey,
      webhookEventId: input.webhookEventId,
      fallbackEventHash: identity.fallbackEventHash,
    });
    if (!claimed) return { handled: true, messages: [], outcome: "DUPLICATE" };

    const finish = async (result: DigitalButlerRuntimeResult, conversationId?: string) => {
      await this.repository.setEventOutcome(input.storeId, identity.eventKey, result.outcome, conversationId);
      if (
        conversationId &&
        result.messages.length > 0 &&
        (result.outcome === "WAITING_INPUT"
          || result.outcome === "VALIDATION_FAILED"
          || result.outcome === "INFORMATION_ANSWERED")
      ) {
        return {
          ...result,
          replyGuard: { conversationId, requiresActiveConversation: true as const },
        };
      }
      return result;
    };

    try {
      await this.requireActivation(input.storeId);
    } catch {
      return finish({ handled: false, messages: [], outcome: "INACTIVE" });
    }

    const senderIdHash = hashDigitalButlerSensitiveValue(input.senderId);
    let conversation = await this.repository.findActiveConversation(
      input.storeId, input.provider, input.channelAccountId, senderIdHash,
    );
    if (conversation && conversation.expiresAt.getTime() <= Date.now()) {
      await this.repository.expireConversation(input.storeId, conversation.id);
      conversation = null;
    }

    if (!conversation) {
      const flow = await this.repository.findTriggeredFlow(input.storeId, input.text);
      if (!flow?.publishedVersion) return finish({ handled: false, messages: [], outcome: "NO_MATCH" });
      const first = flow.publishedVersion.steps[0] ?? null;
      const startStepIndex = flow.startStepKey
        ? flow.publishedVersion.steps.findIndex((step) => step.stepKey === flow.startStepKey)
        : 0;
      if (startStepIndex < 0) {
        return finish({ handled: true, messages: [], outcome: "INVALID_STATE" });
      }
      const encryptedSenderId = encryptDigitalButlerValue(input.senderId);
      conversation = await this.repository.createConversation({
        storeId: input.storeId,
        flowId: flow.id,
        flowVersionId: flow.currentPublishedVersionId,
        provider: input.provider,
        channelAccountId: input.channelAccountId,
        senderIdHash,
        senderIdCiphertext: prismaBytes(encryptedSenderId.ciphertext),
        senderIdIv: prismaBytes(encryptedSenderId.iv),
        senderIdAuthTag: prismaBytes(encryptedSenderId.authTag),
        senderIdKeyVersion: encryptedSenderId.keyVersion,
        currentStepKey: flow.startStepKey ?? first?.stepKey ?? null,
        expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS),
      });
      return finish(await this.runAutomaticSteps(conversation, startStepIndex), conversation.id);
    }

    // Global commands intentionally run before current-field validation. This
    // prevents commands such as「停」from being rejected as an invalid phone.
    const globalCommand = classifyDigitalButlerGlobalCommand(input.text);
    if (globalCommand) {
      return finish(await this.handleGlobalCommand(conversation, globalCommand), conversation.id);
    }

    const steps = conversation.flowVersion.steps;
    const index = steps.findIndex((step) => step.stepKey === conversation?.currentStepKey);
    const step = steps[index];
    if (!step || !["FREE_TEXT", "SINGLE_CHOICE", "TAIWAN_MOBILE"].includes(step.type)) {
      return finish({ handled: true, messages: [], outcome: "INVALID_STATE" }, conversation.id);
    }

    // Information questions intentionally run after terminal global commands
    // but before field validation. They use published flow content and leave
    // the current step untouched, so an interrupted phone/name answer can
    // continue normally afterwards.
    const information = informationReply(steps, input.text);
    if (information) {
      return finish({
        handled: true,
        messages: [information, questionMessage(step)],
        outcome: "INFORMATION_ANSWERED",
      }, conversation.id);
    }

    const answer = validateAnswer(step, input.text);
    if (answer.error) {
      return finish({ handled: true, messages: [questionMessage(step, answer.error)], outcome: "VALIDATION_FAILED" }, conversation.id);
    }
    const saved = await this.repository.saveAnswer({
      storeId: input.storeId, conversationId: conversation.id, step,
      value: answer.value, phone: answer.phone,
    });
    if (!saved) {
      return finish({ handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" }, conversation.id);
    }
    if (answer.value !== undefined) {
      conversation.answers = conversation.answers.filter((item) => item.step.stepKey !== step.stepKey);
      conversation.answers.push({ step: { stepKey: step.stepKey }, value: answer.value as Prisma.JsonValue });
    }
    return finish(
      await this.runAutomaticSteps(conversation, nextStepIndex(steps, index, answer.value)),
      conversation.id,
    );
  }

  /**
   * Serializes an active-flow LINE reply with cancellation. The callback runs
   * while the scoped conversation row lock is held: a cancellation that wins
   * first makes this a no-op; a reply that wins first is delivered before the
   * cancellation can commit and send its terminal acknowledgement.
   */
  async deliverReplyIfActive(
    storeId: string,
    conversationId: string,
    deliver: () => Promise<void>,
  ): Promise<boolean> {
    return this.repository.deliverReplyIfActive(storeId, conversationId, deliver);
  }

  private async handleGlobalCommand(
    conversation: RuntimeConversation,
    command: DigitalButlerGlobalCommand,
  ): Promise<DigitalButlerRuntimeResult> {
    if (command === "CANCEL") {
      const cancelled = await this.repository.cancelConversation(conversation.storeId, conversation.id);
      if (!cancelled) return { handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" };
      return {
        handled: true,
        messages: [{ type: "text", text: "好的，已停止目前流程。需要時再傳訊息給我就可以了。" }],
        outcome: "CANCELLED_BY_USER",
      };
    }
    if (command === "HANDOFF") {
      const cancelled = await this.repository.cancelConversation(conversation.storeId, conversation.id);
      if (!cancelled) return { handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" };
      return {
        handled: true,
        messages: [{ type: "text", text: "好的，已停止自動流程，將由門市夥伴接手協助您。" }],
        outcome: "HANDOFF_REQUESTED",
      };
    }

    return { handled: true, messages: [], outcome: "INVALID_GLOBAL_COMMAND" };
  }

  private async runAutomaticSteps(conversation: RuntimeConversation, startIndex: number): Promise<DigitalButlerRuntimeResult> {
    const messages: DigitalButlerOutboundMessageIntent[] = [];
    const steps = conversation.flowVersion.steps;
    let index = startIndex;
    let transitions = 0;
    while (index >= 0 && index < steps.length && transitions < 100) {
      transitions += 1;
      const step = steps[index];
      if (["FREE_TEXT", "SINGLE_CHOICE", "TAIWAN_MOBILE"].includes(step.type)) {
        const advanced = await this.repository.advanceConversation({
          storeId: conversation.storeId, conversationId: conversation.id,
          currentStepKey: step.stepKey, status: "WAITING_INPUT",
        });
        if (!advanced) return { handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" };
        messages.push(questionMessage(step));
        return { handled: true, messages: messages.slice(0, 5), outcome: "WAITING_INPUT" };
      }
      if (step.type === "TEXT") {
        const text = textFromConfig(step);
        if (text) messages.push({ type: "text", text });
      } else if (step.type === "FLEX_OPENING" || step.type === "FLEX_COMPLETION") {
        const config = objectConfig(step.config);
        if (config.contents && typeof config.contents === "object") {
          messages.push({
            type: "card",
            altText: typeof config.altText === "string" ? config.altText : "數位管家訊息",
            payload: config.contents as Record<string, unknown>,
          });
        }
      } else if (step.type === "CREATE_LEAD") {
        const submittedAnswers = Object.fromEntries(
          conversation.answers
            .filter((answer) => answer.value !== null)
            .map((answer) => [answer.step.stepKey, answer.value]),
        ) as Prisma.InputJsonObject;
        assertDigitalButlerSubmittedAnswersSafe(submittedAnswers);
        const leadCreated = await this.repository.createLead({
          storeId: conversation.storeId, flowId: conversation.flowId,
          conversationId: conversation.id, completionActionKey: step.stepKey,
          submittedAnswers,
        });
        if (!leadCreated) return { handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" };
        await this.notifyLeadCreated({
          storeId: conversation.storeId,
          conversationId: conversation.id,
          completionActionKey: step.stepKey,
          submittedAnswers,
        });
      } else if (step.type === "COMPLETE_FLOW") {
        const completed = await this.repository.advanceConversation({
          storeId: conversation.storeId, conversationId: conversation.id,
          currentStepKey: null, status: "COMPLETED",
        });
        if (!completed) return { handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" };
        return { handled: true, messages: messages.slice(0, 5), outcome: "COMPLETED" };
      }
      index = nextStepIndex(steps, index);
    }
    if (transitions >= 100) {
      return { handled: true, messages: messages.slice(0, 5), outcome: "INVALID_STATE" };
    }
    const completed = await this.repository.advanceConversation({
      storeId: conversation.storeId, conversationId: conversation.id,
      currentStepKey: null, status: "COMPLETED",
    });
    if (!completed) return { handled: true, messages: [], outcome: "INACTIVE_CONVERSATION" };
    return { handled: true, messages: messages.slice(0, 5), outcome: "COMPLETED" };
  }

  private async notifyLeadCreated(input: {
    storeId: string;
    conversationId: string;
    completionActionKey: string;
    submittedAnswers: Prisma.InputJsonObject;
  }) {
    try {
      const lead = await prisma.digitalButlerLead.findUnique({
        where: {
          storeId_conversationId_completionActionKey: {
            storeId: input.storeId,
            conversationId: input.conversationId,
            completionActionKey: input.completionActionKey,
          },
        },
        select: {
          id: true,
          phoneCiphertext: true,
          phoneIv: true,
          phoneAuthTag: true,
          store: { select: { slug: true } },
          conversation: { select: { provider: true } },
        },
      });
      if (!lead?.phoneCiphertext || !lead.phoneIv || !lead.phoneAuthTag) return;
      const phone = decryptDigitalButlerValue({
        ciphertext: Buffer.from(lead.phoneCiphertext),
        iv: Buffer.from(lead.phoneIv),
        authTag: Buffer.from(lead.phoneAuthTag),
        keyVersion: "v1",
      });
      const rawName = input.submittedAnswers.name;
      const customerName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "數位管家顧客";
      await notifyStoreManagerOnLine({
        type: "DIGITAL_BUTLER_LEAD_CREATED",
        eventKey: `digital-butler-lead:${lead.id}`,
        storeId: input.storeId,
        storeSlug: lead.store.slug,
        customerName,
        phone,
        leadId: lead.id,
        provider: lead.conversation.provider,
      });
    } catch (error) {
      console.error("[DigitalButler] manager notification failed", {
        storeId: input.storeId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
