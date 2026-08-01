import { Prisma } from "@prisma/client";
import { parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";

const CREATE_LEAD_STEP_KEY = "inquiry-create-lead";
const SELECTOR_STEP_KEY = "menu";
const LEGACY_NAME_STEP_KEY = "inquiry-name";
const LEGACY_PHONE_STEP_KEY = "inquiry-phone";

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

function matchingStep(definition: FlowDefinition, stepKey: string, type: string): FlowStep {
  const matches = definition.steps.filter((step) => step.stepKey === stepKey && step.type === type);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error("ZHUBEI_V12_LEGACY_CONTACT_CONTRACT_NOT_FOUND");
  }
  return matches[0];
}

/**
 * The published v12 predates the complete-contact validator. Its fixed
 * inquiry-name and inquiry-phone steps omit the required flag, although its
 * CREATE_LEAD step already requires both fields. Clone and normalize only
 * that exact legacy contract; every other definition still goes through the
 * standard parser unchanged.
 */
function normalizeZhubeiV12LegacyContactContract(definition: FlowDefinition): void {
  const createLead = matchingStep(definition, CREATE_LEAD_STEP_KEY, "CREATE_LEAD");
  const config = object(createLead.config);
  if (
    config.requireCompleteContact !== true
    || config.nameStepKey !== LEGACY_NAME_STEP_KEY
    || config.phoneStepKey !== LEGACY_PHONE_STEP_KEY
  ) {
    throw new Error("ZHUBEI_V12_LEGACY_CONTACT_CONTRACT_NOT_FOUND");
  }

  const name = matchingStep(definition, LEGACY_NAME_STEP_KEY, "FREE_TEXT");
  const phone = matchingStep(definition, LEGACY_PHONE_STEP_KEY, "TAIWAN_MOBILE");
  name.required = true;
  phone.required = true;
}

/** True only for the exact persisted Zhubei v12 completion selector contract. */
export function hasZhubeiMessengerCompletionSelector(value: Prisma.JsonValue): boolean {
  const definition = cloneDefinition(value);
  const matching = definition.steps.filter((step) => step.stepKey === CREATE_LEAD_STEP_KEY && step.type === "CREATE_LEAD");
  return matching.length === 1 && matching[0]?.config.requestTypeFromStepKey === SELECTOR_STEP_KEY;
}

/**
 * Creates a new definition from the active version without altering that
 * version. It normalizes only the known v12 legacy contact contract, then
 * adds the selector on its fixed CREATE_LEAD step.
 */
export function repairZhubeiMessengerCompletionSelector(value: Prisma.JsonValue): FlowDefinition {
  const definition = cloneDefinition(value);
  normalizeZhubeiV12LegacyContactContract(definition);
  const target = matchingStep(definition, CREATE_LEAD_STEP_KEY, "CREATE_LEAD");
  target.config = { ...target.config, requestTypeFromStepKey: SELECTOR_STEP_KEY };
  parseDigitalButlerDraftDefinition(definition as Prisma.JsonValue);
  return definition;
}
