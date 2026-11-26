import "server-only";
import { assertAiPreview } from "../../../scripts/ai-digital-butler-preview-scope.mjs";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { readStoreLineConfigs } from "@/lib/store-line-config";
import { getLineSecretForStore } from "@/lib/line-config";
import { resolveCentralMemberCustomerForStore } from "@/server/services/central-member-resolver";
import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";
import { aiButlerDatabase } from "./database";
import { AiButlerRepository } from "./repository";
import { AiRoutingRepository } from "./routing-repository";
import { AiButlerService, type TrustedAiScope } from "./service";
import { MockAiProvider } from "./provider";
import { loadAiPublishedKnowledge, readAiAuthority } from "./knowledge-sources";
import { AiLineWebhook, AI_LINE_WEBHOOK_MAX_BYTES, readAiLineEnvelope, type AiLineBinding, type AiLineEvent, type AiLineSubject } from "./line-webhook";
import { resolveAiLineMember } from "./line-member";
import { createOriginalRoutingMock } from "./routing-mock";

const fixtureSecret = "steamfoot-signed-line-fixture-only-not-an-oa-secret";
const fixtures = ["steamfoot", "beauty", "fitness", "music"] as const;
const fixtureActor = `U${"a".repeat(32)}`;
async function boundedBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("AI_LINE_BODY_REQUIRED");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.byteLength;
    if (length > AI_LINE_WEBHOOK_MAX_BYTES) { await reader.cancel(); throw new Error("AI_LINE_BODY_LIMIT"); }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
/** This handler owns only the exact isolated AI Preview. Production never calls it. */
export async function handleAiLineWebhookRequest(req: Request): Promise<Response> {
  try {
    assertAiPreview();
    const fixtureMode = req.headers.get("x-steamfoot-ai-fixture") === "1";
    // Fixture HMAC is public. Authenticate staff BEFORE trusting it or touching ledgers.
    const operator = fixtureMode ? await requireWritablePermission("plans.edit") : null;
    const operatorStore = operator ? await resolveWriteStoreId(operator) : null;
    const body = await boundedBody(req), envelope = readAiLineEnvelope(body);
    let binding: AiLineBinding;
    if (fixtureMode) {
      const index = fixtures.findIndex((_, i) => envelope.destination === `U${String(i + 1).repeat(32)}`);
      if (index < 0 || operatorStore !== `ai-preview-${fixtures[index]}`) throw new Error("AI_LINE_FIXTURE_STORE_REQUIRED");
      binding = { storeId: operatorStore, destination: envelope.destination, secret: fixtureSecret };
    } else {
      // Explicit single OA/store only. A shared OA never guesses a membership store.
      const configs = readStoreLineConfigs().filter(row => row.destination === envelope.destination);
      if (configs.length !== 1 || !fixtures.some(name => configs[0].storeId === `ai-preview-${name}`)) throw new Error("AI_LINE_BINDING_REQUIRED");
      binding = { storeId: configs[0].storeId, destination: envelope.destination, secret: getLineSecretForStore(configs[0].storeId) ?? "" };
    }
    const sql = aiButlerDatabase(), repository = new AiButlerRepository(sql), receipts = new AiRoutingRepository(sql);
    const secret = process.env.AI_IDENTITY_SECRET ?? "";
    const authorize = async (event: AiLineEvent) => {
      assertAiPreview();
      const store = await prisma.store.findUnique({ where: { id: binding.storeId }, select: { id: true, isDemo: true } });
      if (!store?.isDemo) throw new Error("AI_LINE_SYNTHETIC_STORE_REQUIRED");
      await requireStoreFeature(binding.storeId, FEATURES.AI_DIGITAL_BUTLER);
      const industryModule = (await readAiAuthority(binding.storeId, { hours: false, services: false, prices: false }, new Date())).module;
      let subject: AiLineSubject = { kind: "GUEST" };
      if (fixtureMode) {
        const current = await requireWritablePermission("plans.edit");
        if (current.id !== operator?.id || await resolveWriteStoreId(current) !== binding.storeId || event.source.userId !== fixtureActor || !["合成流程入口", "合成流程等待", "營業時間？", "明天會下雨嗎？", "轉真人", "停止"].includes(event.message.text)) throw new Error("AI_LINE_FIXTURE_ACTOR_REQUIRED");
      } else {
        const config = readStoreLineConfigs().filter(row => row.destination === binding.destination);
        if (config.length !== 1 || config[0].identityMode === "CENTRAL" || config[0].storeId !== binding.storeId || getLineSecretForStore(binding.storeId) !== binding.secret) throw new Error("AI_LINE_BINDING_CHANGED");
        subject = await resolveAiLineMember(binding.storeId, `line-provider:${config[0].providerId}`, event.source.userId, {
          account: async (provider, providerAccountId) => (await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } }, select: { user: { select: { id: true, status: true, role: true } } } }))?.user ?? null,
          membership: resolveCentralMemberCustomerForStore,
        });
      }
      const scope: TrustedAiScope = { storeId: binding.storeId, channel: fixtureMode ? "TEST" : "LINE", channelAccountId: binding.destination,
        actorId: fixtureMode ? `fixture:${operator!.id}:${event.source.userId}` : event.source.userId, module: industryModule };
      return { scope, subject };
    };
    const output = await new AiLineWebhook(receipts, repository, secret).handle(body, req.headers.get("x-line-signature"), binding, {
      authorize,
      routing: (event, scope) => {
        // This release intentionally cannot spend OpenAI from an HTTP webhook.
        const selected = new MockAiProvider(); let calls = 0;
        const provider = { kind: selected.kind, respond: async (input: Parameters<typeof selected.respond>[0]) => { calls++; return selected.respond(input); } };
        const check = async (expected: TrustedAiScope) => {
          const current = await authorize(event);
          if (JSON.stringify(current.scope) !== JSON.stringify(expected)) throw new Error("AI_LINE_SCOPE_CHANGED");
        };
        const service = new AiButlerService(repository, provider, check, secret, () => null,
          () => process.env.AI_DIGITAL_BUTLER_ENABLED === "1", () => new Date(), ["TEST", "LINE"]);
        const scenario = event.message.text === "合成流程入口" ? "original" : event.message.text === "合成流程等待" ? "active" : "known";
        const mock = fixtureMode ? createOriginalRoutingMock(scope, event.webhookEventId, scenario, secret) : null;
        const original = new DigitalButlerRuntime();
        return { authorize: check, providerCalls: () => calls,
          original: mock ? mock.handle : text => original.handleText({ storeId: scope.storeId, provider: "LINE", channelAccountId: binding.destination,
            senderId: event.source.userId, messageId: event.message.id, webhookEventId: event.webhookEventId, occurredAt: new Date(event.timestamp), text }),
          originalReplyAllowed: mock ? mock.allowReply : async result => !result.replyGuard || original.deliverReplyIfActive(scope.storeId, result.replyGuard.conversationId, async () => undefined),
          ai: async (message, conversationRevision) => {
            const reload = () => loadAiPublishedKnowledge(sql, scope.storeId);
            const snapshot = await reload();
            if (snapshot.module !== scope.module) throw new Error("AI_LINE_MODULE_CHANGED");
            return service.respond(scope, event.webhookEventId, message, snapshot.records, { snapshot, reload, conversationRevision });
          },
        };
      },
    });
    // No text/identity IDs/replyToken/secrets in the response, even for signed requests.
    return Response.json(output, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ received: false, error: "AI_LINE_WEBHOOK_REJECTED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}
