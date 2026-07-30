import { Prisma } from "@prisma/client";
import { parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";

const CREATE_LEAD_STEP_KEY = "inquiry-create-lead";
const SELECTOR_STEP_KEY = "menu";

type JsonObject = Record<string, Prisma.JsonValue>;
type FlowStep = { stepKey: string; type: string; required?: boolean; config: JsonObject };
type FlowDefinition = { trigger: { keywords: string[] }; steps: FlowStep[] };

function object(value: Prisma.JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function cloneDefinition(value: Prisma.JsonValue): FlowDefinition {
  const definition = structuredClone(value);
  const root = object(definition);
  if (!Array.isArray(root.steps)) return { trigger: { keywords: [] }, steps: [] };
  return definition as FlowDefinition;
}

/** True only for the exact persisted Zhubei v12 completion selector contract. */
export function hasZhubeiMessengerCompletionSelector(value: Prisma.JsonValue): boolean {
  const definition = cloneDefinition(value);
  const matching = definition.steps.filter((step) => step.stepKey === CREATE_LEAD_STEP_KEY && step.type === "CREATE_LEAD");
  return matching.length === 1 && matching[0]?.config.requestTypeFromStepKey === SELECTOR_STEP_KEY;
}

/**
 * Creates a new definition from the active version without altering that
 * version. It intentionally changes one config key on the known v12 step.
 */
export function repairZhubeiMessengerCompletionSelector(value: Prisma.JsonValue): FlowDefinition {
  const definition = cloneDefinition(value);
  const matching = definition.steps.filter((step) => step.stepKey === CREATE_LEAD_STEP_KEY && step.type === "CREATE_LEAD");
  if (matching.length !== 1) throw new Error("ZHUBEI_INQUIRY_CREATE_LEAD_STEP_NOT_FOUND");

  const target = matching[0];
  if (target?.config.requireCompleteContact !== true) {
    throw new Error("ZHUBEI_INQUIRY_CREATE_LEAD_STEP_NOT_COMPLETE_CONTACT");
  }
  target.config = { ...target.config, requestTypeFromStepKey: SELECTOR_STEP_KEY };
  parseDigitalButlerDraftDefinition(definition as Prisma.JsonValue);
  return definition;
}
