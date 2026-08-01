import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { DigitalButlerDefinitionError, parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";
import { isLeadCollectionTrigger } from "@/lib/digital-butler-lead-collection-upgrade";
import { hasZhubeiMessengerCompletionSelector, repairZhubeiMessengerCompletionSelector } from "@/lib/zhubei-messenger-completion-selector-upgrade";
import { prisma } from "@/lib/db";
import {
  DigitalButlerPublishStageError,
  DigitalButlerRepository,
  DigitalButlerScopeError,
  type DigitalButlerPublishStageCode,
} from "@/server/repositories/digital-butler";

export const ZHUBEI_V13_UPGRADE_ID = "messenger-flow-selector-v13";
export const ZHUBEI_V13_CONFIRMATION = "PUBLISH_ZHUBEI_MESSENGER_V13";
const CREATE_LEAD_STEP_KEY = "inquiry-create-lead";

type Candidate = {
  id: string; name: string; storeId: string; currentPublishedVersionId: string | null;
  publishedVersion: { id: string; version: number; definition: Prisma.JsonValue; steps: Array<{ stepKey: string; type: string; config: Prisma.JsonValue }> } | null;
};

export type V13Preview = {
  storeSlug: "zhubei"; upgradeIdentifier: typeof ZHUBEI_V13_UPGRADE_ID; activeVersion: number;
  targetVersion: number | null; createLeadStepKey: string | null; currentSelector: "MISSING" | "menu" | "OTHER";
  plannedSelector: "menu"; willCreateNewVersion: boolean; willSwitchActiveVersion: boolean;
  modifiesV12: false; modifiesConversations: false; modifiesLeads: false; modifiesSubmittedAnswers: false;
  v12Checksum: string; status: "READY" | "ALREADY_UPGRADED" | "REJECTED";
};

export class ZhubeiV13PublishError extends Error {}

/** Safe diagnostic categories: no database details or flow content are exposed. */
export type ZhubeiV13PublishFailureCode =
  | "PRECONDITION_CHANGED"
  | "DEFINITION_INVALID"
  | "DATABASE_CONSTRAINT"
  | "TRANSACTION_FAILED"
  | DigitalButlerPublishStageCode;

export function classifyZhubeiV13PublishFailure(error: unknown): ZhubeiV13PublishFailureCode {
  if (error instanceof DigitalButlerPublishStageError) return error.code;
  if (error instanceof ZhubeiV13PublishError || error instanceof DigitalButlerScopeError) {
    return "PRECONDITION_CHANGED";
  }
  if (error instanceof DigitalButlerDefinitionError) return "DEFINITION_INVALID";
  if (error instanceof Error && error.message.startsWith("ZHUBEI_INQUIRY_CREATE_LEAD_STEP_")) {
    return "DEFINITION_INVALID";
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2028" || error.code === "P2034"
      ? "TRANSACTION_FAILED"
      : "DATABASE_CONSTRAINT";
  }
  return "TRANSACTION_FAILED";
}

function object(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function selector(step: { config: Prisma.JsonValue }): "MISSING" | "menu" | "OTHER" {
  const value = object(step.config).requestTypeFromStepKey;
  if (value === undefined || value === null || value === "") return "MISSING";
  return value === "menu" ? "menu" : "OTHER";
}

function checksum(definition: Prisma.JsonValue) { return createHash("sha256").update(JSON.stringify(definition)).digest("hex"); }

type FlowClient = typeof prisma | Prisma.TransactionClient;

async function candidate(storeId: string, client: FlowClient = prisma): Promise<Candidate> {
  const flows = await client.storeDigitalButlerFlow.findMany({
    where: { storeId, status: "PUBLISHED", enabled: true, currentPublishedVersionId: { not: null } },
    select: { id: true, name: true, storeId: true, currentPublishedVersionId: true, publishedVersion: { select: { id: true, version: true, definition: true, steps: { select: { stepKey: true, type: true, config: true } } } } },
  });
  const matches = flows.filter((flow) => flow.publishedVersion && isLeadCollectionTrigger(flow.publishedVersion.definition));
  if (matches.length !== 1 || !matches[0]?.publishedVersion) throw new ZhubeiV13PublishError("ZHUBEI_V13_FLOW_NOT_FOUND");
  return matches[0];
}

async function inspect(storeId: string, client: FlowClient = prisma): Promise<{ candidate: Candidate; preview: V13Preview }> {
  const flow = await candidate(storeId, client);
  const current = flow.publishedVersion!;
  const createLead = current.steps.find((step) => step.stepKey === CREATE_LEAD_STEP_KEY && step.type === "CREATE_LEAD") ?? null;
  const currentSelector = createLead ? selector(createLead) : "MISSING";
  const max = await client.digitalButlerFlowVersion.aggregate({ where: { storeId, flowId: flow.id }, _max: { version: true } });
  const already = hasZhubeiMessengerCompletionSelector(current.definition);
  const ready = current.version === 12 && createLead !== null && currentSelector === "MISSING" && (max._max.version ?? 0) === 12;
  return { candidate: flow, preview: {
    storeSlug: "zhubei", upgradeIdentifier: ZHUBEI_V13_UPGRADE_ID, activeVersion: current.version,
    targetVersion: already ? null : (max._max.version ?? 0) + 1, createLeadStepKey: createLead?.stepKey ?? null,
    currentSelector, plannedSelector: "menu", willCreateNewVersion: !already && ready,
    willSwitchActiveVersion: !already && ready, modifiesV12: false, modifiesConversations: false,
    modifiesLeads: false, modifiesSubmittedAnswers: false, v12Checksum: checksum(current.definition),
    status: already ? "ALREADY_UPGRADED" : ready ? "READY" : "REJECTED",
  } };
}

export async function previewZhubeiMessengerV13Publish(storeId: string) { return inspect(storeId); }

export async function applyZhubeiMessengerV13Publish(input: { storeId: string; actorUserId: string }) {
  const before = await inspect(input.storeId);
  if (before.preview.status === "ALREADY_UPGRADED") return { result: "ALREADY_UPGRADED" as const, preview: before.preview, version: before.candidate.publishedVersion! };
  if (before.preview.status !== "READY") throw new ZhubeiV13PublishError("ZHUBEI_V13_PRECONDITION_FAILED");
  const upgraded = repairZhubeiMessengerCompletionSelector(before.candidate.publishedVersion!.definition);
  const parsed = parseDigitalButlerDraftDefinition(upgraded as Prisma.JsonValue);
  try {
    const version = await new DigitalButlerRepository().publishFlow({
      storeId: input.storeId, flowId: before.candidate.id, definition: parsed as Prisma.InputJsonValue,
      diagnosticStages: true,
      draftUpdate: { name: before.candidate.name, definition: parsed as Prisma.InputJsonValue },
      steps: parsed.steps.map((step, position) => ({ stepKey: step.stepKey, position, type: step.type, config: step.config as Prisma.InputJsonValue, required: step.required ?? false })),
      beforePublish: async (tx) => {
        const locked = await inspect(input.storeId, tx);
        if (locked.preview.status === "ALREADY_UPGRADED") throw new ZhubeiV13PublishError("ZHUBEI_V13_ALREADY_UPGRADED");
        if (locked.preview.status !== "READY") throw new ZhubeiV13PublishError("ZHUBEI_V13_PRECONDITION_CHANGED");
      },
      audit: { actorUserId: input.actorUserId, action: "ZHUBEI_MESSENGER_V13_PUBLISHED", after: { upgradeIdentifier: ZHUBEI_V13_UPGRADE_ID, storeSlug: "zhubei", beforeVersion: 12, result: "PUBLISHED" } },
    });
    return { result: "PUBLISHED" as const, preview: before.preview, version };
  } catch (error) {
    if (error instanceof ZhubeiV13PublishError && error.message === "ZHUBEI_V13_ALREADY_UPGRADED") {
      const after = await inspect(input.storeId);
      return { result: "ALREADY_UPGRADED" as const, preview: after.preview, version: after.candidate.publishedVersion! };
    }
    throw error;
  }
}
