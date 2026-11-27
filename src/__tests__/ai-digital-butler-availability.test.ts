import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ slots: vi.fn(), permission: vi.fn(), store: vi.fn(), module: vi.fn(), entitlement: vi.fn(), preview: vi.fn() }));
vi.mock("@/server/actions/slots", () => ({ fetchDaySlots: m.slots }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({ getActiveStoreForRead: m.store }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.module }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.entitlement }));
vi.mock("../../scripts/ai-digital-butler-preview-scope.mjs", () => ({ assertAiPreview: m.preview }));
import { aiAvailabilityRegistry } from "@/server/ai/availability";
import { aiHandoffViewKey } from "@/server/ai/handoff-repository";
import { readAiButlerSteamAvailability } from "../app/(dashboard)/dashboard/settings/digital-butler/ai-availability-actions";
const scope = { storeId: "ai-preview-steamfoot", actorId: "synthetic-owner", module: "STEAMFOOT" as const, channel: "TEST" as const, channelAccountId: "test" };
const input = () => ({ date: "2026-11-27", viewKey: aiHandoffViewKey(scope.storeId, scope.actorId, "s".repeat(40)) });
const slot = (startTime = "14:00", available = 3) => ({ startTime, available, isEnabled: true, isPast: false, capacity: 8, bookedCount: 5, secret: "PRIVATE" });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-26T04:00:00Z"));
  vi.stubEnv("AI_IDENTITY_SECRET", "s".repeat(40));
  m.permission.mockResolvedValue({ id: scope.actorId, role: "OWNER" }); m.store.mockResolvedValue(scope.storeId);
  m.module.mockResolvedValue("steamfoot"); m.entitlement.mockResolvedValue(undefined); m.preview.mockReturnValue(undefined);
  m.slots.mockResolvedValue({ slots: [slot(), slot("15:00", 0), { ...slot("10:00"), isPast: true }, { ...slot("16:00"), isEnabled: false }] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("uses the authoritative explicit-store customer view and projects only public availability", async () => {
  const authorize = vi.fn(async () => {});
  const result = await aiAvailabilityRegistry(authorize).invoke(scope, { name: "steam_available_slots", arguments: { date: input().date } }, "READ_ONLY");
  expect(result).toEqual({ date: "2026-11-27", slots: [{ startTime: "14:00", remaining: 3 }] });
  expect(m.slots).toHaveBeenCalledWith("2026-11-27", scope.storeId, { customerView: true });
  expect(authorize).toHaveBeenCalledWith(scope); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|bookedCount|capacity/);
});
it.each(["BEAUTY", "FITNESS", "MUSIC"] as const)("does not use steamfoot rules for %s", async module => {
  await expect(aiAvailabilityRegistry(async () => {}).invoke({ ...scope, module }, { name: "steam_available_slots", arguments: { date: input().date } }, "READ_ONLY")).rejects.toThrow("AI_TOOL_NOT_AUTHORIZED");
  expect(m.slots).not.toHaveBeenCalled();
});
it.each([{ date: "2026-02-30" }, { date: "2026-11-27", storeId: "foreign" }, { date: "2026-11-27", customerId: "foreign" }])("rejects invalid or identity-bearing model arguments before a read", async args => {
  await expect(aiAvailabilityRegistry(async () => {}).invoke(scope, { name: "steam_available_slots", arguments: args }, "READ_ONLY")).rejects.toThrow(); expect(m.slots).not.toHaveBeenCalled();
});
it("rejects historical dates and retains knowledge phase tools disabled", async () => {
  const registry = aiAvailabilityRegistry(async () => {});
  await expect(registry.invoke(scope, { name: "steam_available_slots", arguments: { date: "2026-11-25" } }, "READ_ONLY")).rejects.toThrow("AI_AVAILABILITY_DATE_PAST");
  await expect(registry.invoke(scope, { name: "steam_available_slots", arguments: { date: input().date } }, "KNOWLEDGE")).rejects.toThrow("AI_TOOLS_DISABLED"); expect(m.slots).not.toHaveBeenCalled();
});
it("failed or malformed authority reads never become a successful empty result", async () => {
  m.slots.mockResolvedValueOnce({ slots: [slot("14:00", -1)] });
  await expect(aiAvailabilityRegistry(async () => {}).invoke(scope, { name: "steam_available_slots", arguments: { date: input().date } }, "READ_ONLY")).rejects.toThrow();
  m.slots.mockRejectedValueOnce(new Error("PRIVATE DATABASE FAILURE"));
  const result = await readAiButlerSteamAvailability(input()); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toMatch(/PRIVATE|DATABASE/);
});
it("binds manual readonly testing to current actor and store before and after the query", async () => {
  const result = await readAiButlerSteamAvailability(input());
  expect(result).toMatchObject({ success: true, snapshot: { ...input(), slots: [{ startTime: "14:00", remaining: 3 }], checkedAt: "2026-11-26T04:00:00.000Z" } });
  expect(m.permission).toHaveBeenCalledTimes(3); expect(m.permission).toHaveBeenCalledWith("plans.edit");
});
it("withholds a completed result if actor changes while waiting", async () => {
  m.permission.mockResolvedValueOnce({ id: scope.actorId }).mockResolvedValueOnce({ id: scope.actorId }).mockResolvedValueOnce({ id: "other-actor" });
  const result = await readAiButlerSteamAvailability(input()); expect(m.slots).toHaveBeenCalledTimes(1); expect(result.success).toBe(false); expect(result).not.toHaveProperty("snapshot");
});
it.each(["ai-preview-beauty", "ai-preview-fitness", "ai-preview-music", "formal-store"])("rejects direct read for %s", async store => {
  m.store.mockResolvedValue(store); expect((await readAiButlerSteamAvailability(input())).success).toBe(false); expect(m.slots).not.toHaveBeenCalled();
});
it("checks the real store module and rejects forged scopes or extra top-level arguments", async () => {
  m.module.mockResolvedValueOnce("beauty"); expect((await readAiButlerSteamAvailability(input())).success).toBe(false);
  expect((await readAiButlerSteamAvailability({ ...input(), viewKey: "a".repeat(64) })).success).toBe(false);
  expect((await readAiButlerSteamAvailability({ ...input(), storeId: "foreign" } as ReturnType<typeof input>)).success).toBe(false); expect(m.slots).not.toHaveBeenCalled();
});
it("failed Preview, permission, or entitlement checks do not call the availability service", async () => {
  m.preview.mockImplementationOnce(() => { throw Error("NOT_PREVIEW"); }); expect((await readAiButlerSteamAvailability(input())).success).toBe(false);
  m.permission.mockRejectedValueOnce(new Error("DENIED")); expect((await readAiButlerSteamAvailability(input())).success).toBe(false);
  m.entitlement.mockRejectedValueOnce(new Error("DENIED")); expect((await readAiButlerSteamAvailability(input())).success).toBe(false); expect(m.slots).not.toHaveBeenCalled();
});
