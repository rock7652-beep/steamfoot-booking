"use server";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { formatTWTime } from "@/lib/date-utils";
import { assertAiPreview } from "../../../../../../scripts/ai-digital-butler-preview-scope.mjs";
import { aiHandoffViewKey } from "@/server/ai/handoff-repository";
import { aiAvailabilityRegistry } from "@/server/ai/availability";
import { aiAvailabilityReadSchema, aiAvailabilityDataSchema, type AiAvailabilityResult } from "@/server/ai/availability-contract";
import type { TrustedAiScope } from "@/server/ai/service";

export async function readAiButlerSteamAvailability(input: { viewKey: string; date: string }) {
  try {
    const data = aiAvailabilityReadSchema.parse(input);
    const context = async (): Promise<TrustedAiScope> => {
      assertAiPreview();
      const user = await requirePermission("plans.edit");
      const storeId = await getActiveStoreForRead(user);
      if (storeId !== "ai-preview-steamfoot" || await getStoreIndustryModule(storeId) !== "steamfoot") throw new Error("AI_AVAILABILITY_SCOPE");
      await requireStoreFeature(storeId, FEATURES.AI_DIGITAL_BUTLER);
      return { storeId, actorId: user.id, channel: "TEST", channelAccountId: "ai-availability-test", module: "STEAMFOOT" };
    };
    const scope = await context(), secret = process.env.AI_IDENTITY_SECRET ?? "";
    const check = async (expected: TrustedAiScope) => {
      const current = await context();
      if (current.storeId !== expected.storeId || current.actorId !== expected.actorId ||
        aiHandoffViewKey(current.storeId, current.actorId, secret) !== data.viewKey) throw new Error("AI_AVAILABILITY_SCOPE");
    };
    if (aiHandoffViewKey(scope.storeId, scope.actorId, secret) !== data.viewKey) throw new Error("AI_AVAILABILITY_SCOPE");
    const result = aiAvailabilityDataSchema.parse(await aiAvailabilityRegistry(check).invoke(scope,
      { name: "steam_available_slots", arguments: { date: data.date } }, "READ_ONLY"));
    await check(scope);
    const now = new Date();
    const snapshot: AiAvailabilityResult = { ...result, viewKey: data.viewKey, checkedAt: now.toISOString(), checkedAtLabel: formatTWTime(now) };
    return { success: true as const, snapshot };
  } catch (error) {
    return { success: false as const, error: error instanceof Error && error.message === "AI_AVAILABILITY_DATE_PAST"
      ? "請選擇今天或之後的日期。" : "時段尚未查詢成功，請核對日期、店家與查詢權限後重試。" };
  }
}
