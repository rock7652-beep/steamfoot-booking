import "server-only";
import { createHmac } from "node:crypto";
import { aiChannelSchema, aiModuleSchema, type AiChannel, type AiModule } from "./contracts";

export type TrustedAiScope = { storeId: string; channel: AiChannel; channelAccountId: string; actorId: string; module: AiModule };
export function aiIdentity(scope: TrustedAiScope, eventId: string, secret: string) {
  if ("principal" in scope || "serviceId" in scope || "serviceMode" in scope) throw new Error("AI_SCOPE_REQUIRED");
  if (secret.length < 32 || !scope.storeId || scope.storeId === "__all__" || !scope.channelAccountId || !scope.actorId || !eventId || eventId.length > 200) throw new Error("AI_SCOPE_REQUIRED");
  aiChannelSchema.parse(scope.channel); aiModuleSchema.parse(scope.module);
  const hash = (parts: string[]) => createHmac("sha256", secret).update(JSON.stringify(parts)).digest("hex");
  const scopeKey = hash([scope.storeId, scope.channel, scope.channelAccountId, scope.actorId]);
  return { storeId: scope.storeId, scopeKey, eventKey: hash([scopeKey, eventId]) };
}
