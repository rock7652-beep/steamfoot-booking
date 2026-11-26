import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { verifyLineSignatureWithSecret } from "@/lib/line";
import type { TrustedAiScope } from "./service";
import { AI_LINE_SYNTHETIC_ACCOUNT } from "./line-synthetic-contract";
import { aiRoutingMessages } from "./routing-mock";
import type { AiRoutingScenario } from "./routing-contract";

// Public fixtures, never an OA credential or a verified customer's LINE identity.
const secret = "steamfoot-signed-line-fixture-only-not-an-oa-secret";
const actor = `U${"a".repeat(32)}`;
const bindings = [
  ["ai-preview-steamfoot", "STEAMFOOT", `U${"1".repeat(32)}`],
  ["ai-preview-beauty", "BEAUTY", `U${"2".repeat(32)}`],
  ["ai-preview-fitness", "FITNESS", `U${"3".repeat(32)}`],
  ["ai-preview-music", "MUSIC", `U${"4".repeat(32)}`],
] as const;
const schema = z.object({ destination: z.string(), events: z.tuple([z.object({
  type: z.literal("message"), mode: z.literal("active"), webhookEventId: z.string().uuid(),
  timestamp: z.number().int().nonnegative(),
  source: z.object({ type: z.literal("user"), userId: z.literal(actor) }).strict(),
  message: z.object({ type: z.literal("text"), id: z.string().uuid(), text: z.string().min(1).max(500) }).strict(),
  deliveryContext: z.object({ isRedelivery: z.boolean() }).strict(),
}).strict()]) }).strict();
function binding(scope: TrustedAiScope) {
  const row = bindings.find(([store, module]) => store === scope.storeId && module === scope.module);
  if (!row || scope.channel !== "TEST" || scope.channelAccountId !== AI_LINE_SYNTHETIC_ACCOUNT || !scope.actorId) throw new Error("AI_LINE_FIXTURE_SCOPE_REQUIRED");
  return row;
}
export function createAiLineFixture(scope: TrustedAiScope, eventId: string, scenario: AiRoutingScenario) {
  const row = binding(scope);
  const rawBody = JSON.stringify({ destination: row[2], events: [{ type: "message", mode: "active", webhookEventId: eventId,
    timestamp: Date.now(), source: { type: "user", userId: actor },
    message: { type: "text", id: eventId, text: scenario === "known" ? "營業時間？" : aiRoutingMessages[scenario] }, deliveryContext: { isRedelivery: false } }] });
  return { rawBody, signature: createHmac("sha256", secret).update(rawBody).digest("base64") };
}
/** Internal fixture admission only. No HTTP webhook, arbitrary client body or channel sender. */
export function readAiLineFixture(scope: TrustedAiScope, rawBody: string, signature: string) {
  const row = binding(scope);
  if (Buffer.byteLength(rawBody) > 4096 || !verifyLineSignatureWithSecret(rawBody, signature, secret)) throw new Error("AI_LINE_FIXTURE_SIGNATURE_REQUIRED");
  const body = schema.parse(JSON.parse(rawBody)), event = body.events[0];
  if (body.destination !== row[2] || event.message.id !== event.webhookEventId) throw new Error("AI_LINE_FIXTURE_EVENT_REQUIRED");
  // Operator-owned TEST scope stays authoritative; fixture UID grants no membership.
  return { eventId: event.webhookEventId, message: event.message.text };
}
