import { Prisma } from "@prisma/client";
import { parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";

export const DIGITAL_BUTLER_LEAD_COLLECTION_TRIGGER = "我想了解蒸足";
export const DIGITAL_BUTLER_LEAD_COLLECTION_STEP_KEYS = [
  "name",
  "phone",
  "confirm",
  "create-lead",
] as const;

type JsonObject = Record<string, Prisma.JsonValue>;
type FlowStep = { stepKey: string; type: string; required?: boolean; config: JsonObject };
export type LeadCollectionFlowDefinition = { trigger: { keywords: string[] }; steps: FlowStep[] };

function object(value: Prisma.JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function contactEntryOption(option: Prisma.JsonValue): boolean {
  const value = object(option);
  const label = typeof value.label === "string" ? value.label : "";
  const key = typeof value.value === "string" ? value.value : "";
  return ["我想預約體驗", "請店家聯絡我"].includes(label)
    || ["BOOKING", "CONTACT_STORE"].includes(key);
}

function isTopLevelContactMenu(step: FlowStep): boolean {
  if (step.type !== "SINGLE_CHOICE" || !Array.isArray(step.config.options)) return false;
  const options = step.config.options as Prisma.JsonValue[];
  const labels = new Set(options.map((option) => object(option).label));
  return labels.has("我想預約體驗") && labels.has("請店家聯絡我");
}

function cloneDefinition(value: Prisma.JsonValue): LeadCollectionFlowDefinition {
  const root = object(value);
  const trigger = object(root.trigger);
  const keywords = Array.isArray(trigger.keywords)
    ? trigger.keywords.filter((item): item is string => typeof item === "string")
    : [];
  const steps = Array.isArray(root.steps)
    ? root.steps.map((item) => {
        const step = object(item);
        return {
          stepKey: String(step.stepKey ?? ""),
          type: String(step.type ?? ""),
          required: step.required === true,
          config: object(step.config),
        };
      })
    : [];
  return { trigger: { keywords }, steps };
}

function contactSteps(): FlowStep[] {
  return [
    {
      stepKey: "requestType", type: "SINGLE_CHOICE", required: true,
      config: {
        text: "請確認您需要的協助：",
        options: [
          { label: "預約體驗", value: "BOOKING", nextStepKey: "name" },
          { label: "請店家聯絡", value: "CONTACT_STORE", nextStepKey: "name" },
        ],
      },
    },
    { stepKey: "name", type: "FREE_TEXT", required: true, config: { text: "請問怎麼稱呼您？", field: "name", nextStepKey: "phone" } },
    { stepKey: "phone", type: "TAIWAN_MOBILE", required: true, config: { text: "請輸入手機號碼（例如 0912-345-678）", nextStepKey: "confirm" } },
    {
      stepKey: "confirm", type: "SINGLE_CHOICE", required: true,
      config: {
        text: "請確認資料正確後送出；如需修改，請選擇重新填寫。",
        contactConfirmation: true,
        nameStepKey: "name",
        phoneStepKey: "phone",
        requestStepKey: "menu",
        options: [
          { label: "確認送出", value: "CONFIRM", nextStepKey: "create-lead" },
          { label: "重新填寫", value: "RESTART", nextStepKey: "name" },
        ],
      },
    },
    { stepKey: "create-lead", type: "CREATE_LEAD", config: { requireCompleteContact: true, nameStepKey: "name", phoneStepKey: "phone", requestTypeFromStepKey: "menu", nextStepKey: "completion" } },
    { stepKey: "completion", type: "TEXT", config: { text: "已收到您的資料，店家將儘快與您聯絡。需要時可回到主選單繼續了解。", nextStepKey: "complete" } },
  ];
}

/**
 * Builds a new definition only. Callers must publish it through the regular
 * store-scoped repository transaction; published versions are never edited.
 */
export function upgradeDigitalButlerLeadCollectionDefinition(value: Prisma.JsonValue): LeadCollectionFlowDefinition {
  const definition = cloneDefinition(value);
  const menu = definition.steps.find(isTopLevelContactMenu);
  if (!menu) throw new Error("DIGITAL_BUTLER_LEAD_ENTRY_MENU_NOT_FOUND");

  menu.config = {
    ...menu.config,
    options: (menu.config.options as Prisma.JsonValue[]).map((option) => {
      const parsed = object(option);
      return contactEntryOption(option) ? { ...parsed, nextStepKey: "name" } : parsed;
    }),
  };
  const replacement = new Map(contactSteps().map((step) => [step.stepKey, step]));
  const withoutContact = definition.steps.filter((step) => !replacement.has(step.stepKey));
  const completeIndex = withoutContact.findIndex((step) => step.type === "COMPLETE_FLOW");
  if (completeIndex < 0) throw new Error("DIGITAL_BUTLER_COMPLETE_STEP_NOT_FOUND");
  withoutContact.splice(completeIndex, 0, ...contactSteps());
  const upgraded = { ...definition, steps: withoutContact };
  parseDigitalButlerDraftDefinition(upgraded as Prisma.JsonValue);
  return upgraded;
}

export function hasCompleteDigitalButlerLeadCollection(value: Prisma.JsonValue): boolean {
  try {
    const definition = cloneDefinition(value);
    const keys = new Set(definition.steps.map((step) => step.stepKey));
    const menu = definition.steps.find(isTopLevelContactMenu);
    const menuPointsToCollection = menu && (menu.config.options as Prisma.JsonValue[])
      .filter(contactEntryOption)
      .every((option) => object(option).nextStepKey === "name");
    const create = definition.steps.find((step) => step.stepKey === "create-lead");
    return Boolean(menuPointsToCollection)
      && ["requestType", ...DIGITAL_BUTLER_LEAD_COLLECTION_STEP_KEYS, "completion"].every((key) => keys.has(key))
      && create?.config.requireCompleteContact === true
      && create.config.nameStepKey === "name"
      && create.config.phoneStepKey === "phone"
      && create.config.requestTypeFromStepKey === "menu";
  } catch {
    return false;
  }
}

export function isLeadCollectionTrigger(value: Prisma.JsonValue): boolean {
  return cloneDefinition(value).trigger.keywords.includes(DIGITAL_BUTLER_LEAD_COLLECTION_TRIGGER);
}

export function digitalButlerStepKeys(value: Prisma.JsonValue): string[] {
  return cloneDefinition(value).steps.map((step) => step.stepKey);
}
