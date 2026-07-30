/** One-time, auditable upgrade for the enabled Zhubei Digital Butler flow. */
import { Prisma, PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import {
  DIGITAL_BUTLER_LEAD_COLLECTION_TRIGGER,
  isLeadCollectionTrigger,
} from "@/lib/digital-butler-lead-collection-upgrade";
import {
  hasZhubeiMessengerCompletionSelector,
  repairZhubeiMessengerCompletionSelector,
} from "@/lib/zhubei-messenger-completion-selector-upgrade";
import { parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";
import { DigitalButlerRepository } from "@/server/repositories/digital-butler";

export {
  hasZhubeiMessengerCompletionSelector as hasCompleteZhubeiLeadCollection,
  repairZhubeiMessengerCompletionSelector as upgradeZhubeiLeadCollectionDefinition,
} from "@/lib/zhubei-messenger-completion-selector-upgrade";

const STORE_SLUG = "zhubei";
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes(`--confirm-store=${STORE_SLUG}`);
const prisma = new PrismaClient();

export async function runZhubeiMessengerFlowUpgrade(): Promise<void> {
  if (APPLY && !CONFIRMED) throw new Error("APPLY_REQUIRES_--confirm-store=zhubei");
  const store = await prisma.store.findUnique({ where: { slug: STORE_SLUG }, select: { id: true, slug: true } });
  if (!store) throw new Error("ZHUBEI_STORE_NOT_FOUND");
  const candidates = await prisma.storeDigitalButlerFlow.findMany({
    where: { storeId: store.id, status: "PUBLISHED", enabled: true, currentPublishedVersionId: { not: null } },
    include: { publishedVersion: { select: { id: true, version: true, definition: true } } },
  });
  const matching = candidates.filter((flow) => flow.publishedVersion && isLeadCollectionTrigger(flow.publishedVersion.definition));
  if (matching.length !== 1 || !matching[0]?.publishedVersion) {
    throw new Error(`ZHUBEI_EXPECTED_ONE_ACTIVE_${DIGITAL_BUTLER_LEAD_COLLECTION_TRIGGER}_FLOW_FOUND_${matching.length}`);
  }
  const flow = matching[0];
  const current = flow.publishedVersion;
  if (!current) throw new Error("ZHUBEI_ACTIVE_FLOW_VERSION_NOT_FOUND");
  const upgraded = repairZhubeiMessengerCompletionSelector(current.definition);
  console.log(JSON.stringify({
    mode: APPLY ? "APPLY" : "DRY_RUN", storeSlug: STORE_SLUG, flowId: flow.id,
    activeVersion: current.version, activeVersionId: current.id,
    alreadyUpgraded: hasZhubeiMessengerCompletionSelector(current.definition),
    activeConversationCount: await prisma.digitalButlerConversation.count({ where: { storeId: store.id, flowId: flow.id, status: { in: ["IN_PROGRESS", "WAITING_INPUT"] } } }),
  }, null, 2));
  if (hasZhubeiMessengerCompletionSelector(current.definition) || !APPLY) return;

  const repository = new DigitalButlerRepository();
  await repository.updateDraft(store.id, flow.id, { name: flow.name, draftDefinition: upgraded as Prisma.InputJsonValue });
  const published = await repository.publishFlow({
    storeId: store.id, flowId: flow.id, definition: upgraded as Prisma.InputJsonValue,
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
