/** Offline acceptance driver only. Never imported by a route, action, or sender. */
import { z } from "zod";
import { verifyLineSignature } from "@/lib/line";
import type { TrustedAiScope } from "@/server/ai/service";
import type { AiRoutingResult } from "@/server/ai/routing-contract";

export const SYNTHETIC_LINE_BINDINGS = [
  { storeId: "ai-preview-steamfoot", module: "STEAMFOOT", destination: `U${"1".repeat(32)}` },
  { storeId: "ai-preview-beauty", module: "BEAUTY", destination: `U${"2".repeat(32)}` },
  { storeId: "ai-preview-fitness", module: "FITNESS", destination: `U${"3".repeat(32)}` },
  { storeId: "ai-preview-music", module: "MUSIC", destination: `U${"4".repeat(32)}` },
] as const;
export const SYNTHETIC_LINE_ACTORS = [`U${"a".repeat(32)}`, `U${"b".repeat(32)}`] as const;
// Public fixture values, never a real Channel Secret or access token.
export const syntheticLineSecret = (storeId: string) => `offline-line-fixture-only:${storeId}`;
const envelopeSchema = z.object({ destination: z.string(), events: z.array(z.unknown()).max(20) }).strict();
const textEventSchema = z.object({
  type: z.literal("message"), mode: z.literal("active"),
  webhookEventId: z.string().min(1).max(200), timestamp: z.number().int().nonnegative(),
  source: z.object({ type: z.literal("user"), userId: z.enum(SYNTHETIC_LINE_ACTORS) }).strict(),
  message: z.object({ type: z.literal("text"), id: z.string().min(1).max(200), text: z.string().trim().min(1).max(500) }).strict(),
  replyToken: z.string().max(200).optional(),
  deliveryContext: z.object({ isRedelivery: z.boolean() }).strict().optional(),
}).strict();
export type SyntheticLineReport = {
  state: "COMPLETE" | "REJECTED"; reason?: "ENVELOPE" | "DESTINATION" | "SIGNATURE" | "EVENT";
  results: AiRoutingResult[]; ignored: number;
};

/** No default store, raw identity override, anonymous/group actor, or reply transport. */
export async function rehearseSyntheticLine(
  rawBody: string, signature: string,
  handle: (scope: TrustedAiScope, eventId: string, message: string) => Promise<AiRoutingResult>,
): Promise<SyntheticLineReport> {
  const reject = (reason: SyntheticLineReport["reason"]): SyntheticLineReport => ({ state: "REJECTED", reason, results: [], ignored: 0 });
  if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) return reject("ENVELOPE");
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return reject("ENVELOPE"); }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) return reject("ENVELOPE");
  const matches = SYNTHETIC_LINE_BINDINGS.filter(row => row.destination === envelope.data.destination);
  if (matches.length !== 1) return reject("DESTINATION");
  const binding = matches[0];
  // Calls the existing production signature algorithm; tests supply fixture secrets only.
  if (!verifyLineSignature(binding.storeId, rawBody, signature)) return reject("SIGNATURE");
  const texts: z.infer<typeof textEventSchema>[] = [];
  let ignored = 0;
  // Validate the whole batch before admitting any message to the coordinator.
  for (const event of envelope.data.events) {
    const kind = z.object({ type: z.string() }).safeParse(event);
    if (!kind.success) return reject("EVENT");
    if (kind.data.type !== "message") { ignored++; continue; }
    const messageKind = z.object({ message: z.object({ type: z.string() }) }).safeParse(event);
    if (!messageKind.success) return reject("EVENT");
    if (messageKind.data.message.type !== "text") { ignored++; continue; }
    const text = textEventSchema.safeParse(event);
    if (!text.success) return reject("EVENT");
    texts.push(text.data);
  }
  const results: AiRoutingResult[] = [];
  for (const event of texts) {
    results.push(await handle({
      storeId: binding.storeId, module: binding.module, channel: "TEST",
      channelAccountId: `offline-line:${binding.destination}`, actorId: event.source.userId,
    }, event.webhookEventId, event.message.text));
  }
  return { state: "COMPLETE", results, ignored };
}
