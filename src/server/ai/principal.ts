import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { aiChannelSchema } from "./contracts";

const id = z.string().trim().min(1).max(200).refine(value => value !== "__all__");
export const aiPrincipalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("STORE"), storeId: id }).strict(),
  z.object({ kind: z.literal("BRAND"), serviceId: id }).strict(),
]);
export type AiPrincipal = z.infer<typeof aiPrincipalSchema>;
export const brandScopeSchema = z.object({
  principal: z.object({ kind: z.literal("BRAND"), serviceId: id }).strict(),
  channel: aiChannelSchema, channelAccountId: id, actorId: id,
}).strict();
export type TrustedBrandScope = z.infer<typeof brandScopeSchema>;
export function brandIdentity(input: TrustedBrandScope, eventId: string, secret: string) {
  const scope = brandScopeSchema.parse(input);
  if (secret.length < 32 || !eventId || eventId.length > 200) throw new Error("AI_SCOPE_REQUIRED");
  const hash = (parts: string[]) => createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
  const ownerId = scope.principal.serviceId;
  const scopeKey = hash(["ai-owner-v1", "BRAND", ownerId, scope.channel, scope.channelAccountId, scope.actorId]);
  return { ownerId, scopeKey, eventKey: hash([scopeKey, eventId]) };
}
