import { Prisma, type DigitalButlerStepType } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  hashDigitalButlerSensitiveValue,
  encryptDigitalButlerValue,
} from "@/lib/digital-butler-crypto";
import { requireDigitalButlerConversationActivation } from "@/lib/digital-butler-entitlement";
import { classifyDigitalButlerGlobalCommand } from "@/lib/digital-butler-global-command";
import { normalizePhone } from "@/lib/normalize";
import type { LineMessage } from "@/lib/line";
import { assertDigitalButlerSubmittedAnswersSafe } from "@/lib/digital-butler-sensitive-json";

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

export type DigitalButlerWebhookEvent = {
  storeId: string;
  channelIdentity: string;
  lineUserId: string;
  text: string;
  webhookEventId?: string;
  timestamp?: number;
  messageId?: string;
};

export type DigitalButlerRuntimeResult = {
  handled: boolean;
  messages: LineMessage[];
  outcome: string;
};

type RuntimeRepository = {
  claimEvent(input: {
    storeId: string;
    eventKey: string;
    webhookEventId?: string;
    fallbackEventHash?: string;
  }): Promise<boolean>;
  setEventOutcome(storeId: string, eventKey: string, outcome: string, conversationId?: string): Promise<void>;
  findActiveConversation(storeId: string, channelIdentity: string, lineUserIdHash: string): Promise<RuntimeConversation | null>;
  expireConversation(storeId: string, conversationId: string): Promise<void>;
  cancelConversation(storeId: string, conversationId: string): Promise<void>;
  resetConversation(storeId: string, conversationId: string, currentStepKey: string | null): Promise<void>;
  findTriggeredFlow(storeId: string, text: string): Promise<{
    id: string;
    currentPublishedVersionId: string;
    publishedVersion: { definition: Prisma.JsonValue; steps: RuntimeStep[] };
  } | null>;
  createConversation(input: {
    storeId: string;
    flowId: string;
    flowVersionId: string;
    channelIdentity: string;
    lineUserIdHash: string;
    currentStepKey: string | null;
    expiresAt: Date;
  }): Promise<RuntimeConversation>;
  saveAnswer(input: {
    storeId: string;
    conversationId: string;
    step: RuntimeStep;
    value?: Prisma.InputJsonValue;
    phone?: string;
  }): Promise<void>;
  advanceConversation(input: {
    storeId: string;
    conversationId: string;
    currentStepKey: string | null;
    status: "IN_PROGRESS" | "WAITING_INPUT" | "COMPLETED";
  }): Promise<void>;
  createLead(input: {
    storeId: string;
    flowId: string;
    conversationId: string;
    completionActionKey: string;
    submittedAnswers: Prisma.InputJsonObject;
  }): Promise<void>;
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

function eventIdentity(input: DigitalButlerWebhookEvent): {
  eventKey: string;
  fallbackEventHash?: string;
} | null {
  if (input.webhookEventId) return { eventKey: `line:${input.webhookEventId}` };
  if (!input.timestamp || !input.messageId) return null;
  const fallbackEventHash = hashDigitalButlerSensitiveValue([
    input.storeId,
    input.channelIdentity,
    input.lineUserId,
    input.timestamp,
    input.messageId,
    "message.text",
  ].join(":"));
  return { eventKey: `fallback:${fallbackEventHash}`, fallbackEventHash };
}

function questionMessage(step: RuntimeStep, error?: string): LineMessage {
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
          quickReply: {
            items: options.slice(0, 13).flatMap((option) => {
              const label = typeof option.label === "string" ? option.label : null;
              const value = typeof option.value === "string" ? option.value : label;
              return label && value
                ? [{ type: "action" as const, action: { type: "message" as const, label, text: value } }]
                : [];
            }),
          },
        }
      : {}),
  };
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

class PrismaDigitalButlerRuntimeRepository implements RuntimeRepository {
  async claimEvent(input: { storeId: string; eventKey: string; webhookEventId?: string; fallbackEventHash?: string }) {
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

  async findActiveConversation(storeId: string, channelIdentity: string, lineUserIdHash: string) {
    return prisma.digitalButlerConversation.findFirst({
      where: { storeId, channelIdentity, lineUserIdHash, status: { in: [...ACTIVE_STATUSES] } },
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
    await prisma.digitalButlerConversation.updateMany({
      where: { id: conversationId, storeId, status: { in: [...ACTIVE_STATUSES] } },
      data: { status: "CANCELLED", currentStepKey: null, cancelledAt: new Date() },
    });
  }

  async resetConversation(storeId: string, conversationId: string, currentStepKey: string | null) {
    await prisma.$transaction(async (tx) => {
      await tx.digitalButlerAnswer.deleteMany({ where: { storeId, conversationId } });
      await tx.digitalButlerConversation.updateMany({
        where: { id: conversationId, storeId, status: { in: [...ACTIVE_STATUSES] } },
        data: {
          status: "IN_PROGRESS",
          currentStepKey,
          expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS),
          cancelledAt: null,
          completedAt: null,
        },
      });
    });
  }

  async findTriggeredFlow(storeId: string, text: string) {
    const flows = await prisma.storeDigitalButlerFlow.findMany({
      where: { storeId, status: "PUBLISHED", enabled: true, currentPublishedVersionId: { not: null } },
      include: { publishedVersion: { include: { steps: { orderBy: { position: "asc" } } } } },
    });
    return flows.find((flow) => flow.publishedVersion &&
      triggerKeywords(flow.publishedVersion.definition).includes(text)) as Awaited<ReturnType<RuntimeRepository["findTriggeredFlow"]>>;
  }

  async createConversation(input: {
    storeId: string; flowId: string; flowVersionId: string; channelIdentity: string;
    lineUserIdHash: string; currentStepKey: string | null; expiresAt: Date;
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
    await prisma.digitalButlerAnswer.upsert({
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
  }

  async advanceConversation(input: {
    storeId: string; conversationId: string; currentStepKey: string | null;
    status: "IN_PROGRESS" | "WAITING_INPUT" | "COMPLETED";
  }) {
    await prisma.digitalButlerConversation.updateMany({
      where: { id: input.conversationId, storeId: input.storeId },
      data: {
        currentStepKey: input.currentStepKey,
        status: input.status,
        completedAt: input.status === "COMPLETED" ? new Date() : undefined,
      },
    });
  }

  async createLead(input: {
    storeId: string; flowId: string; conversationId: string;
    completionActionKey: string; submittedAnswers: Prisma.InputJsonObject;
  }) {
    assertDigitalButlerSubmittedAnswersSafe(input.submittedAnswers);
    await prisma.$transaction(async (tx) => {
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
}

export class DigitalButlerRuntime {
  constructor(
    private readonly repository: RuntimeRepository = new PrismaDigitalButlerRuntimeRepository(),
    private readonly requireActivation: (storeId: string) => Promise<void> = requireDigitalButlerConversationActivation,
  ) {}

  async handleText(input: DigitalButlerWebhookEvent): Promise<DigitalButlerRuntimeResult> {
    const identity = eventIdentity(input);
    if (!identity) return { handled: false, messages: [], outcome: "IDENTITY_INCOMPLETE" };
    const claimed = await this.repository.claimEvent({
      storeId: input.storeId,
      eventKey: identity.eventKey,
      webhookEventId: input.webhookEventId,
      fallbackEventHash: identity.fallbackEventHash,
    });
    if (!claimed) return { handled: true, messages: [], outcome: "DUPLICATE" };

    const finish = async (result: DigitalButlerRuntimeResult, conversationId?: string) => {
      await this.repository.setEventOutcome(input.storeId, identity.eventKey, result.outcome, conversationId);
      return result;
    };

    try {
      await this.requireActivation(input.storeId);
    } catch {
      return finish({ handled: false, messages: [], outcome: "INACTIVE" });
    }

    const lineUserIdHash = hashDigitalButlerSensitiveValue(input.lineUserId);
    let conversation = await this.repository.findActiveConversation(
      input.storeId, input.channelIdentity, lineUserIdHash,
    );
    if (conversation && conversation.expiresAt.getTime() <= Date.now()) {
      await this.repository.expireConversation(input.storeId, conversation.id);
      conversation = null;
    }

    if (!conversation) {
      const flow = await this.repository.findTriggeredFlow(input.storeId, input.text);
      if (!flow?.publishedVersion) return finish({ handled: false, messages: [], outcome: "NO_MATCH" });
      const first = flow.publishedVersion.steps[0] ?? null;
      conversation = await this.repository.createConversation({
        storeId: input.storeId,
        flowId: flow.id,
        flowVersionId: flow.currentPublishedVersionId,
        channelIdentity: input.channelIdentity,
        lineUserIdHash,
        currentStepKey: first?.stepKey ?? null,
        expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS),
      });
      return finish(await this.runAutomaticSteps(conversation, 0), conversation.id);
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
    const answer = validateAnswer(step, input.text);
    if (answer.error) {
      return finish({ handled: true, messages: [questionMessage(step, answer.error)], outcome: "VALIDATION_FAILED" }, conversation.id);
    }
    await this.repository.saveAnswer({
      storeId: input.storeId, conversationId: conversation.id, step,
      value: answer.value, phone: answer.phone,
    });
    if (answer.value !== undefined) {
      conversation.answers = conversation.answers.filter((item) => item.step.stepKey !== step.stepKey);
      conversation.answers.push({ step: { stepKey: step.stepKey }, value: answer.value as Prisma.JsonValue });
    }
    return finish(
      await this.runAutomaticSteps(conversation, nextStepIndex(steps, index, answer.value)),
      conversation.id,
    );
  }

  private async handleGlobalCommand(
    conversation: RuntimeConversation,
    command: ReturnType<typeof classifyDigitalButlerGlobalCommand> & {},
  ): Promise<DigitalButlerRuntimeResult> {
    if (command === "CANCEL") {
      await this.repository.cancelConversation(conversation.storeId, conversation.id);
      return {
        handled: true,
        messages: [{ type: "text", text: "好的，已停止目前流程。需要時再傳訊息給我就可以了。" }],
        outcome: "CANCELLED_BY_USER",
      };
    }
    if (command === "HANDOFF") {
      await this.repository.cancelConversation(conversation.storeId, conversation.id);
      return {
        handled: true,
        messages: [{ type: "text", text: "好的，已停止自動流程，將由門市夥伴接手協助您。" }],
        outcome: "HANDOFF_REQUESTED",
      };
    }

    const steps = conversation.flowVersion.steps;
    const targetIndex = command === "MAIN_MENU"
      ? Math.max(0, steps.findIndex((step) => step.stepKey === "menu"))
      : 0;
    const target = steps[targetIndex] ?? null;
    await this.repository.resetConversation(conversation.storeId, conversation.id, target?.stepKey ?? null);
    conversation.currentStepKey = target?.stepKey ?? null;
    conversation.answers = [];
    conversation.expiresAt = new Date(Date.now() + CONVERSATION_TTL_MS);

    const result = await this.runAutomaticSteps(conversation, targetIndex);
    return {
      ...result,
      outcome: command === "MAIN_MENU" ? "MAIN_MENU_RESTARTED" : "FLOW_RESTARTED",
    };
  }

  private async runAutomaticSteps(conversation: RuntimeConversation, startIndex: number): Promise<DigitalButlerRuntimeResult> {
    const messages: LineMessage[] = [];
    const steps = conversation.flowVersion.steps;
    let index = startIndex;
    let transitions = 0;
    while (index >= 0 && index < steps.length && transitions < 100) {
      transitions += 1;
      const step = steps[index];
      if (["FREE_TEXT", "SINGLE_CHOICE", "TAIWAN_MOBILE"].includes(step.type)) {
        await this.repository.advanceConversation({
          storeId: conversation.storeId, conversationId: conversation.id,
          currentStepKey: step.stepKey, status: "WAITING_INPUT",
        });
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
            type: "flex",
            altText: typeof config.altText === "string" ? config.altText : "數位管家訊息",
            contents: config.contents as Record<string, unknown>,
          });
        }
      } else if (step.type === "CREATE_LEAD") {
        const submittedAnswers = Object.fromEntries(
          conversation.answers
            .filter((answer) => answer.value !== null)
            .map((answer) => [answer.step.stepKey, answer.value]),
        ) as Prisma.InputJsonObject;
        assertDigitalButlerSubmittedAnswersSafe(submittedAnswers);
        await this.repository.createLead({
          storeId: conversation.storeId, flowId: conversation.flowId,
          conversationId: conversation.id, completionActionKey: step.stepKey,
          submittedAnswers,
        });
      } else if (step.type === "COMPLETE_FLOW") {
        await this.repository.advanceConversation({
          storeId: conversation.storeId, conversationId: conversation.id,
          currentStepKey: null, status: "COMPLETED",
        });
        return { handled: true, messages: messages.slice(0, 5), outcome: "COMPLETED" };
      }
      index = nextStepIndex(steps, index);
    }
    if (transitions >= 100) {
      return { handled: true, messages: messages.slice(0, 5), outcome: "INVALID_STATE" };
    }
    await this.repository.advanceConversation({
      storeId: conversation.storeId, conversationId: conversation.id,
      currentStepKey: null, status: "COMPLETED",
    });
    return { handled: true, messages: messages.slice(0, 5), outcome: "COMPLETED" };
  }
}
