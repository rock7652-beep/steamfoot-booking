import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("@/lib/digital-butler-entitlement", () => ({ requireDigitalButlerEntitlement: vi.fn() }));
import {
  DIGITAL_BUTLER_LEAD_COLLECTION_STEP_KEYS,
  hasCompleteDigitalButlerLeadCollection,
  upgradeDigitalButlerLeadCollectionDefinition,
} from "@/lib/digital-butler-lead-collection-upgrade";
import { DigitalButlerService } from "@/server/services/digital-butler";

const legacyDefinition = {
  trigger: { keywords: ["我想了解蒸足"] },
  steps: [
    { stepKey: "opening", type: "TEXT", config: { text: "您好", nextStepKey: "menu" } },
    { stepKey: "menu", type: "SINGLE_CHOICE", required: true, config: { text: "請選擇", options: [
      { label: "我想預約體驗", value: "BOOKING", nextStepKey: "booking-info" },
      { label: "請店家聯絡我", value: "CONTACT_STORE", nextStepKey: "contact-info" },
      { label: "轉接真人客服", value: "HUMAN_SUPPORT", nextStepKey: "support-info" },
      { label: "療程介紹", value: "INFO", nextStepKey: "info" },
    ] } },
    { stepKey: "booking-intro", type: "TEXT", config: { text: "預約說明", nextStepKey: "booking-path" } },
    { stepKey: "booking-path", type: "TEXT", config: { text: "https://booking.example", nextStepKey: "complete" } },
    { stepKey: "contact-info", type: "TEXT", config: { text: "聯絡說明", nextStepKey: "complete" } },
    { stepKey: "support-info", type: "TEXT", config: { text: "客服說明", nextStepKey: "complete" } },
    { stepKey: "info", type: "TEXT", config: { text: "介紹", nextStepKey: "complete" } },
    { stepKey: "complete", type: "COMPLETE_FLOW", config: {} },
  ],
};

function candidate(alreadyUpgraded = false) {
  const definition = alreadyUpgraded ? upgradeDigitalButlerLeadCollectionDefinition(legacyDefinition) : legacyDefinition;
  return {
    id: "flow-1", storeId: "store-zhubei", name: "蒸足介紹", currentPublishedVersionId: "version-1",
    publishedVersion: { id: "version-1", version: 1, definition, steps: definition.steps.map((step) => ({ stepKey: step.stepKey })) },
    alreadyUpgraded, activeConversationCount: 3,
  };
}

describe("digital butler full lead collection upgrade", () => {
  it("redirects booking and contact to name while preserving informational and handoff branches", () => {
    const upgraded = upgradeDigitalButlerLeadCollectionDefinition(legacyDefinition);
    expect(hasCompleteDigitalButlerLeadCollection(upgraded)).toBe(true);
    expect(upgraded.steps.find((step) => step.stepKey === "info")).toBeTruthy();
    const menu = upgraded.steps.find((step) => step.stepKey === "menu");
    const options = menu?.config.options as Array<{ value: string; nextStepKey: string }>;
    expect(options.find((option) => option.value === "BOOKING")?.nextStepKey).toBe("name");
    expect(options.find((option) => option.value === "CONTACT_STORE")?.nextStepKey).toBe("name");
    expect(options.find((option) => option.value === "HUMAN_SUPPORT")?.nextStepKey).toBe("support-info");
    expect(options.find((option) => option.value === "INFO")?.nextStepKey).toBe("info");
    expect(upgraded.steps.find((step) => step.stepKey === "booking-path")).toBeTruthy();
    expect(upgraded.steps.find((step) => step.stepKey === "create-lead")?.config.requestTypeFromStepKey).toBe("menu");
    expect(DIGITAL_BUTLER_LEAD_COLLECTION_STEP_KEYS.every((key) => upgraded.steps.some((step) => step.stepKey === key))).toBe(true);
  });

  it("preview stays read-only and publishes only through the repository transaction", async () => {
    const repository = {
      getLeadCollectionUpgradeCandidate: vi.fn().mockResolvedValue(candidate()),
      publishFlow: vi.fn().mockResolvedValue({ id: "version-2", version: 2, publishedAt: new Date(), steps: [] }),
    };
    const gate = { requireEntitledStore: vi.fn().mockResolvedValue(undefined) };
    const service = new DigitalButlerService(repository as never, gate);
    const actor = { userId: "owner-1", role: "OWNER" as const };

    await expect(service.previewLeadCollectionUpgrade("store-zhubei", actor)).resolves.toMatchObject({
      flowId: "flow-1", activeConversationCount: 3, alreadyUpgraded: false,
    });
    expect(repository.publishFlow).not.toHaveBeenCalled();

    await expect(service.publishLeadCollectionUpgrade("store-zhubei", actor)).resolves.toMatchObject({
      alreadyUpgraded: false, publishedVersion: { id: "version-2", version: 2 },
    });
    expect(repository.publishFlow).toHaveBeenCalledWith(expect.objectContaining({
      storeId: "store-zhubei", flowId: "flow-1", draftUpdate: expect.any(Object), audit: expect.objectContaining({ actorUserId: "owner-1" }),
    }));
  });

  it("does not create a second version after the active version is upgraded", async () => {
    const repository = { getLeadCollectionUpgradeCandidate: vi.fn().mockResolvedValue(candidate(true)), publishFlow: vi.fn() };
    const service = new DigitalButlerService(repository as never, { requireEntitledStore: vi.fn().mockResolvedValue(undefined) });
    const result = await service.publishLeadCollectionUpgrade("store-zhubei", { userId: "admin-1", role: "ADMIN" });
    expect(result).toMatchObject({ alreadyUpgraded: true, publishedVersion: { id: "version-1" } });
    expect(repository.publishFlow).not.toHaveBeenCalled();
  });

  it("keeps the server action scoped to the authenticated OWNER or ADMIN store", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/dashboard/settings/digital-butler/actions.ts"), "utf8");
    expect(source).toContain('user.role !== "OWNER" && user.role !== "ADMIN"');
    expect(source).toContain("resolveWriteStoreId(user)");
    expect(source).toContain("confirmationSlug.trim() !== store.slug");
    expect(source).not.toContain("flowVersion JSON");
  });
});
