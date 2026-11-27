import "server-only";
import { z } from "zod";
import { verifyLineSignatureWithSecret } from "@/lib/line";
import { AiButlerRouting } from "./routing";
import { AiRoutingRepository } from "./routing-repository";
import { aiIdentity, type TrustedAiScope } from "./service";
import type { AiButlerRepository } from "./repository";
import { AiLineReceiptRepository, aiLineFingerprint } from "./line-receipt-repository";

export const AI_LINE_WEBHOOK_MAX_BYTES = 64 * 1024;
const uid = z.string().regex(/^U[a-f0-9]{32}$/);
const eventSchema = z.object({
  type: z.literal("message"), mode: z.literal("active"),
  webhookEventId: z.string().min(1).max(200), timestamp: z.number().int().nonnegative(),
  source: z.object({ type: z.literal("user"), userId: uid }),
  message: z.object({ type: z.literal("text"), id: z.string().min(1).max(200), text: z.string().trim().min(1).max(500) }),
  deliveryContext: z.object({ isRedelivery: z.boolean() }).optional(),
});
export type AiLineEvent = z.infer<typeof eventSchema>;
export type AiLineBinding = { storeId: string; destination: string; secret: string };
export type AiLineSubject = { kind: "GUEST" | "MEMBER"; customerId?: string; userId?: string };
type RoutingPorts = Parameters<AiButlerRouting["respond"]>[4];
export type AiLineWebhookPorts = {
  authorize(event: AiLineEvent): Promise<{ scope: TrustedAiScope; subject: AiLineSubject }>;
  routing(event: AiLineEvent, scope: TrustedAiScope): RoutingPorts;
};

/** Read exact bytes first. Untrusted destination is only a binding lookup hint. */
export function readAiLineEnvelope(body: string): { destination: string; events: unknown[] } {
  if (Buffer.byteLength(body) > AI_LINE_WEBHOOK_MAX_BYTES) throw new Error("AI_LINE_BODY_LIMIT");
  return z.object({ destination: uid, events: z.array(z.unknown()).max(10) }).parse(JSON.parse(body));
}
export function verifyAiLineEvents(body: string, signature: string | null, binding: AiLineBinding, now = new Date()) {
  if (!signature || !binding.secret || !verifyLineSignatureWithSecret(body, signature, binding.secret)) throw new Error("AI_LINE_SIGNATURE_REQUIRED");
  const envelope = readAiLineEnvelope(body);
  if (envelope.destination !== binding.destination) throw new Error("AI_LINE_DESTINATION_REQUIRED");
  // Unsupported group/standby/follow/media events never enter the AI or legacy writes.
  return envelope.events.map(event => eventSchema.safeParse(event)).filter(result => result.success)
    .map(result => result.data).filter(event => event.timestamp <= now.getTime() + 30_000 && event.timestamp >= now.getTime() - 300_000);
}

/** Shared core + private dispatch receipts. Deliberately has NO transport sender. */
export class AiLineWebhook {
  constructor(private readonly receipts: AiRoutingRepository, private readonly conversations: AiButlerRepository,
    private readonly secret: string, private readonly clock = () => new Date()) {}
  async handle(body: string, signature: string | null, binding: AiLineBinding, ports: AiLineWebhookPorts) {
    const events = verifyAiLineEvents(body, signature, binding, this.clock());
    const results = [];
    for (const event of events) {
      const { scope, subject } = await ports.authorize(event);
      if (scope.storeId !== binding.storeId || scope.channelAccountId !== binding.destination) throw new Error("AI_LINE_SCOPE_REQUIRED");
      const admission = { ...scope, channelAccountId: `line-admission:${scope.channelAccountId}` };
      const eventAlias = aiIdentity(admission, aiLineFingerprint(this.secret, ["event", event.webhookEventId]), this.secret);
      const messageAlias = aiIdentity(admission, aiLineFingerprint(this.secret, ["message", event.message.id]), this.secret);
      const inbound = new AiLineReceiptRepository(this.conversations.db);
      const admitted = await inbound.claim(eventAlias, messageAlias, aiLineFingerprint(this.secret, [event.message.id, event.message.text]), this.clock());
      if (admitted !== "CLAIMED") {
        results.push({ route: "DUPLICATE", outcome: admitted, providerCalls: 0, identity: subject.kind, delivery: "NO_REPLY" });
        continue;
      }
      let routing: RoutingPorts | undefined;
      try {
        routing = ports.routing(event, scope);
        const router = new AiButlerRouting(this.receipts, this.conversations, this.secret, this.clock, ["TEST", "LINE"]);
        // Bind both LINE IDs: a redelivery must not change body while reusing an event ID.
        const result = await router.respond(scope, event.webhookEventId, `line-http:${event.message.id}`, event.message.text, routing);
        let delivery = "NO_REPLY";
        if (result.text) {
          // Recheck tenant/identity/entitlement after the provider await and before recording delivery.
          const current = await ports.authorize(event);
          if (JSON.stringify(current) !== JSON.stringify({ scope, subject })) throw new Error("AI_LINE_SCOPE_CHANGED");
          const id = aiIdentity(scope, aiLineFingerprint(this.secret, ["delivery", event.message.id]), this.secret);
          const { createHmac } = await import("node:crypto");
          const fingerprint = createHmac("sha256", this.secret).update(JSON.stringify([event.message.id, result.route, result.text])).digest("hex");
          const claim = await this.receipts.claim(id, fingerprint, false, this.clock());
          if (claim.state === "CLAIMED") {
            const recorded = await this.receipts.finish(id, claim.revision, "SILENT", "OUTBOUND_BLOCKED", claim.handoff, this.clock());
            delivery = recorded ? "OUTBOUND_BLOCKED" : "SUPPRESSED";
          } else delivery = claim.state;
        }
        // Member identifiers and raw text are never returned to the caller/logs.
        await inbound.finish(eventAlias, messageAlias, result.outcome === "ROUTING_UNKNOWN", this.clock());
        results.push({ route: result.route, outcome: result.outcome, providerCalls: result.providerCalls, identity: subject.kind, delivery });
      } catch {
        await inbound.finish(eventAlias, messageAlias, true, this.clock()).catch(() => undefined);
        const identity = aiIdentity(scope, event.webhookEventId, this.secret);
        await this.conversations.handoff(identity, true, this.clock()).catch(() => undefined);
        results.push({ route: "BLOCKED", outcome: "LINE_RESULT_UNKNOWN", providerCalls: routing?.providerCalls() ?? 0, identity: subject.kind, delivery: "NO_REPLY" });
      }
    }
    return { received: true, results };
  }
}
