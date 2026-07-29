/**
 * One-time, auditable upgrade for the currently enabled Zhubei Digital Butler
 * flow that starts with 「我想了解蒸足」.
 *
 * The command is dry-run by default. It resolves the store by its immutable
 * slug, creates a new published version through the normal repository publish
 * transaction, and never edits an already-published version in place.
 *
 * Usage:
 *   npx tsx scripts/upgrade-zhubei-messenger-digital-butler-flow.ts
 *   npx tsx scripts/upgrade-zhubei-messenger-digital-butler-flow.ts --apply --confirm-store=zhubei
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";
import { DigitalButlerRepository } from "@/server/repositories/digital-butler";

const STORE_SLUG = "zhubei";
const TRIGGER = "我想了解蒸足";
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes(`--confirm-store=${STORE_SLUG}`);
const prisma = new PrismaClient();

type JsonObject = Record<string, Prisma.JsonValue>;
type FlowStep = { stepKey: string; type: string; required?: boolean; config: JsonObject };
type FlowDefinition = { trigger: { keywords: string[] }; steps: FlowStep[] };

function object(value: Prisma.JsonValue | undefined): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function leadEntryOption(option: Prisma.JsonValue): boolean {
  const value = object(option);
  const label = typeof value.label === "string" ? value.label : "";
  const key = typeof value.value === "string" ? value.value : "";
  return ["我想預約體驗", "請店家聯絡我", "轉接真人客服"].includes(label)
    || ["BOOKING", "CONTACT_STORE", "HUMAN_SUPPORT"].includes(key);
}

function cloneDefinition(value: Prisma.JsonValue): FlowDefinition {
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
          { label: "真人客服", value: "HUMAN_SUPPORT", nextStepKey: "name" },
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
        requestStepKey: "requestType",
        options: [
          { label: "確認送出", value: "CONFIRM", nextStepKey: "create-lead" },
          { label: "重新填寫", value: "RESTART", nextStepKey: "name" },
        ],
      },
    },
    { stepKey: "create-lead", type: "CREATE_LEAD", config: { requireCompleteContact: true, nameStepKey: "name", phoneStepKey: "phone", nextStepKey: "completion" } },
    { stepKey: "completion", type: "TEXT", config: { text: "已收到您的資料，店家將儘快與您聯絡。需要時可回到主選單繼續了解。", nextStepKey: "complete" } },
  ];
}

export function upgradeZhubeiLeadCollectionDefinition(value: Prisma.JsonValue): FlowDefinition {
  const definition = cloneDefinition(value);
  const menu = definition.steps.find((step) => step.type === "SINGLE_CHOICE" && Array.isArray(step.config.options)
    && (step.config.options as Prisma.JsonValue[]).some(leadEntryOption));
  if (!menu) throw new Error("ZHUBEI_DIGITAL_BUTLER_LEAD_ENTRY_MENU_NOT_FOUND");

  menu.config = {
    ...menu.config,
    options: (menu.config.options as Prisma.JsonValue[]).map((option) => {
      const parsed = object(option);
      return leadEntryOption(option) ? { ...parsed, nextStepKey: "requestType" } : parsed;
    }),
  };
  const replacement = new Map(contactSteps().map((step) => [step.stepKey, step]));
  const withoutContact = definition.steps.filter((step) => !replacement.has(step.stepKey));
  const completeIndex = withoutContact.findIndex((step) => step.type === "COMPLETE_FLOW");
  if (completeIndex < 0) throw new Error("ZHUBEI_DIGITAL_BUTLER_COMPLETE_STEP_NOT_FOUND");
  withoutContact.splice(completeIndex, 0, ...contactSteps());
  return { ...definition, steps: withoutContact };
}

export function hasCompleteZhubeiLeadCollection(value: Prisma.JsonValue): boolean {
  try {
    const definition = cloneDefinition(value);
    const keys = new Set(definition.steps.map((step) => step.stepKey));
    const menu = definition.steps.find((step) => step.type === "SINGLE_CHOICE" && Array.isArray(step.config.options)
      && (step.config.options as Prisma.JsonValue[]).some(leadEntryOption));
    const menuPointsToCollection = menu && (menu.config.options as Prisma.JsonValue[])
      .filter(leadEntryOption)
      .every((option) => object(option).nextStepKey === "requestType");
    const create = definition.steps.find((step) => step.stepKey === "create-lead");
    return Boolean(menuPointsToCollection)
      && ["requestType", "name", "phone", "confirm", "create-lead", "completion"].every((key) => keys.has(key))
      && create?.config.requireCompleteContact === true
      && create.config.nameStepKey === "name"
      && create.config.phoneStepKey === "phone";
  } catch {
    return false;
  }
}

export async function runZhubeiMessengerFlowUpgrade(): Promise<void> {
  if (APPLY && !CONFIRMED) throw new Error("APPLY_REQUIRES_--confirm-store=zhubei");
  const store = await prisma.store.findUnique({ where: { slug: STORE_SLUG }, select: { id: true, slug: true } });
  if (!store) throw new Error("ZHUBEI_STORE_NOT_FOUND");
  const candidates = await prisma.storeDigitalButlerFlow.findMany({
    where: { storeId: store.id, status: "PUBLISHED", enabled: true, currentPublishedVersionId: { not: null } },
    include: { publishedVersion: { select: { id: true, version: true, definition: true } } },
  });
  const matching = candidates.filter((flow) => {
    const definition = flow.publishedVersion?.definition;
    return definition && cloneDefinition(definition).trigger.keywords.includes(TRIGGER);
  });
  if (matching.length !== 1 || !matching[0]?.publishedVersion) {
    throw new Error(`ZHUBEI_EXPECTED_ONE_ACTIVE_${TRIGGER}_FLOW_FOUND_${matching.length}`);
  }
  const flow = matching[0];
  const current = flow.publishedVersion;
  if (!current) throw new Error("ZHUBEI_ACTIVE_FLOW_VERSION_NOT_FOUND");
  const upgraded = upgradeZhubeiLeadCollectionDefinition(current.definition);
  parseDigitalButlerDraftDefinition(upgraded as Prisma.JsonValue);
  console.log(JSON.stringify({
    mode: APPLY ? "APPLY" : "DRY_RUN",
    storeSlug: STORE_SLUG,
    flowId: flow.id,
    activeVersion: current.version,
    activeVersionId: current.id,
    alreadyUpgraded: hasCompleteZhubeiLeadCollection(current.definition),
    activeConversationCount: await prisma.digitalButlerConversation.count({
      where: { storeId: store.id, flowId: flow.id, status: { in: ["IN_PROGRESS", "WAITING_INPUT"] } },
    }),
  }, null, 2));
  if (hasCompleteZhubeiLeadCollection(current.definition)) return;
  if (!APPLY) return;

  const repository = new DigitalButlerRepository();
  await repository.updateDraft(store.id, flow.id, { name: flow.name, draftDefinition: upgraded as Prisma.InputJsonValue });
  const published = await repository.publishFlow({
    storeId: store.id,
    flowId: flow.id,
    definition: upgraded as Prisma.InputJsonValue,
    steps: parseDigitalButlerDraftDefinition(upgraded as Prisma.JsonValue).steps.map((step, position) => ({
      stepKey: step.stepKey, position, type: step.type, config: step.config as Prisma.InputJsonValue, required: step.required ?? false,
    })),
  });
  console.log(JSON.stringify({ applied: true, storeSlug: STORE_SLUG, flowId: flow.id, previousVersion: current.version, newVersion: published.version, newVersionId: published.id }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runZhubeiMessengerFlowUpgrade()
    .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
