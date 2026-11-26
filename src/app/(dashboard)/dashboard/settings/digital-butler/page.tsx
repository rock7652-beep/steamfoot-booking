import { aiIdentity } from "@/server/ai/service";
import { getStoreFeaturePresentation, hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { claimsAiPreview, assertAiPreview } from "../../../../../../scripts/ai-digital-butler-preview-scope.mjs";
import { aiButlerRepository } from "@/server/ai/database";
import { AiRoutingPanel } from "./ai-routing-panel";
import { AiRoutingRepository } from "@/server/ai/routing-repository";
import { AI_ROUTING_ACCOUNT } from "@/server/ai/routing-contract";
import { AiHandoffRepository, aiHandoffViewKey } from "@/server/ai/handoff-repository";
import { aiHandoffKeySchema, type AiHandoffPage } from "@/server/ai/handoff-contract";
import { AiHandoffPanel } from "./ai-handoff-panel";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { AiKnowledgePanel } from "./ai-knowledge-panel";
import { AiKnowledgeRepository } from "@/server/ai/knowledge-repository";
import { aiButlerDatabase } from "@/server/ai/database";
import type { AiKnowledgeDocument } from "@/server/ai/knowledge-document";
import { AiButlerPanel } from "./ai-panel";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import {
  hasCompleteDigitalButlerLeadCollection,
  isLeadCollectionTrigger,
} from "@/lib/digital-butler-lead-collection-upgrade";
import { prisma } from "@/lib/db";
import { DigitalButlerService } from "@/server/services/digital-butler";
import { SettingsReturnLink as Link } from "@/components/settings/settings-navigation";
import { PageHeader, PageShell } from "@/components/desktop";
import { DigitalButlerFlowEditor } from "./flow-editor";

export default async function DigitalButlerSettingsPage({ searchParams }: { searchParams?: Promise<{ aiQueueAfter?: string }> } = {}) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "plans.edit"))) notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) notFound();
  const [butlerAllowed, aiState] = await Promise.all([hasStoreFeature(storeId, FEATURES.DIGITAL_BUTLER), getStoreFeaturePresentation(storeId, FEATURES.AI_DIGITAL_BUTLER)]);
  if (!butlerAllowed && aiState !== "ENABLED") notFound();
  const flows = butlerAllowed ? await new DigitalButlerService().listFlows(storeId) : [];
  let handoffs: AiHandoffPage | null = null, handoffViewKey = "", handoffCursor: string | undefined;
  let ai: { setting: Awaited<ReturnType<ReturnType<typeof aiButlerRepository>["setting"]>>; usage: Awaited<ReturnType<ReturnType<typeof aiButlerRepository>["usage"]>>; handoff: boolean; handoffRevision: number; knowledge: AiKnowledgeDocument; routing: {handoff:boolean;revision:number;globalStopped:boolean} } | null = null;
  if (aiState === "ENABLED" && claimsAiPreview() && /^ai-preview-(steamfoot|beauty|fitness|music)$/.test(storeId)) {
    assertAiPreview();
    handoffViewKey = aiHandoffViewKey(storeId, user.id, process.env.AI_IDENTITY_SECRET ?? "");
    const readHandoffs = async () => {
      let cursor: string | undefined;
      try {
        const after = (await searchParams)?.aiQueueAfter;
        if (after !== undefined) cursor = aiHandoffKeySchema.parse(after);
        return { page: await new AiHandoffRepository(aiButlerDatabase()).list(storeId, cursor), cursor };
      } catch { return { page: null, cursor }; } // A failed list is never an empty queue.
    };
    const repository = aiButlerRepository();
    const identity = aiIdentity({ storeId, actorId: user.id, channel: "TEST", channelAccountId: "dashboard-synthetic-test", module: "STEAMFOOT" }, "read-state", process.env.AI_IDENTITY_SECRET ?? "");
    const [setting, usage, state, queue] = await Promise.all([repository.setting(storeId), repository.usage(storeId, new Date()), repository.conversationState(identity), readHandoffs()]);
    handoffs = queue.page; handoffCursor = queue.cursor;
    const routingIdentity = aiIdentity({ storeId, actorId: user.id, channel: "TEST", channelAccountId: AI_ROUTING_ACCOUNT, module: "STEAMFOOT" }, "read-state", process.env.AI_IDENTITY_SECRET ?? "");
    const routing = {...await repository.conversationState(routingIdentity), globalStopped: await new AiRoutingRepository(aiButlerDatabase()).globalStopped()};
    ai = { setting, usage, handoff: state.handoff, handoffRevision: state.revision, routing, knowledge: await new AiKnowledgeRepository(aiButlerDatabase()).read(storeId) };
  }
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, slug: true, industryModule: true } });
  if (!store) notFound();
  const canUpgradeLeadCollection = store.industryModule !== "COURSE" && (user.role === "OWNER" || user.role === "ADMIN")
    && flows.some((flow) => flow.enabled && flow.status === "PUBLISHED" && flow.publishedVersion
      && isLeadCollectionTrigger(flow.publishedVersion.definition)
      && !hasCompleteDigitalButlerLeadCollection(flow.publishedVersion.definition));

  return (
    <PageShell>
      <PageHeader
        title="數位管家"
        subtitle="建立 LINE 自動互動流程；草稿不會影響已發布版本"
        actions={
          <Link
            href={store.industryModule === "COURSE" ? "/dashboard/courses?view=settings&section=notifications" : "/dashboard/settings?section=notifications"}
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600"
          >
            ← 返回設定
          </Link>
        }
      />
      {!ai && aiState === "ENABLED" && <p className="text-sm text-earth-600">AI 數位店長尚未在此環境開放，正式客服尚未啟用。</p>}
      {ai && <AiButlerPanel key={storeId} setting={ai.setting.setting} revision={ai.setting.revision} liveTestAvailable={process.env.AI_OPENAI_TEST_ENABLED === "1"} requestCount={ai.usage.requests} reservedMicros={ai.usage.reservedMicros} budgetMicros={ai.usage.budgetMicros} alerts={ai.usage.alerts} initialHandoff={ai.handoff} initialHandoffRevision={ai.handoffRevision} />}
      {ai && <AiKnowledgePanel key={`knowledge-${storeId}`} initial={ai.knowledge} liveTestAvailable={process.env.AI_OPENAI_TEST_ENABLED === "1"} />}
      {ai && <AiRoutingPanel key={`routing-${storeId}`} initial={ai.routing} />}
      {ai && <AiHandoffPanel key={handoffViewKey} page={handoffs} viewKey={handoffViewKey} cursor={handoffCursor} readOnly={!!(await resolveStoreViewContextFromCookie(user))?.isViewMode} />}
      {butlerAllowed && <DigitalButlerFlowEditor
        flows={flows}
        courseMode={store.industryModule === "COURSE"}
        leadCollectionUpgrade={canUpgradeLeadCollection ? { storeName: store.name, storeSlug: store.slug } : null}
      />}
    </PageShell>
  );
}
