import "server-only";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerForSession } from "@/lib/customer-identity";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { assertAiPreview } from "../../../scripts/ai-digital-butler-preview-scope.mjs";
import { aiHandoffViewKey } from "./handoff-repository";
import type { TrustedAiScope } from "./service";

export type AiConfirmedMember = { userId: string; customerId: string; storeId: string; userVersion: string };
export function aiMemberViewKey(member: AiConfirmedMember) {
  return aiHandoffViewKey(member.storeId, JSON.stringify(["confirmed-member", member.userId, member.customerId, member.userVersion]), process.env.AI_IDENTITY_SECRET ?? "");
}
export async function aiMemberContext() {
  assertAiPreview();
  const user = await requireSession();
  if (user.role !== "CUSTOMER" || user.storeId !== "ai-preview-steamfoot" ||
    !["ai-preview-member-user-a", "ai-preview-member-user-b"].includes(user.id)) throw new Error("AI_MEMBER_IDENTITY_REQUIRED");
  if (await getStoreIndustryModule(user.storeId) !== "steamfoot") throw new Error("AI_MEMBER_MODULE_REQUIRED");
  await requireStoreFeature(user.storeId, FEATURES.AI_DIGITAL_BUTLER);
  const customer = await getCanonicalCustomerForSession(user, { confirmedOnly: true });
  if (!customer?.verifiedUserVersion || customer.storeId !== user.storeId) throw new Error("AI_MEMBER_IDENTITY_REQUIRED");
  const member: AiConfirmedMember = { userId: user.id, customerId: customer.id, storeId: customer.storeId, userVersion: customer.verifiedUserVersion };
  const scope: TrustedAiScope = { storeId: member.storeId, actorId: user.id, channel: "TEST", channelAccountId: "ai-member-bookings-test", module: "STEAMFOOT" };
  return { member, scope, viewKey: aiMemberViewKey(member) };
}
