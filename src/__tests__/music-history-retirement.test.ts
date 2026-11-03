import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ actor: vi.fn(), change: vi.fn(), parse: vi.fn(), commit: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/server/services/course-access", () => ({ courseManager: m.actor }));
vi.mock("@/server/services/music-opening-makeup", () => ({ changeOpeningMakeup: m.change, openingMakeupCommandSchema: { parse: m.parse } }));
vi.mock("@/server/services/music-operational-pilot", () => ({ commitMusicOperationalPilot: m.commit }));
import { updateOpeningMakeup } from "@/server/actions/music-opening-makeup";
import { applyMusicOperationalPilot } from "@/server/actions/music-operational-pilot";
import { authorizeMusicSourceImport } from "@/server/services/music-source-import";
beforeEach(() => vi.clearAllMocks());
it("rejects historical makeup mutations from stale browser clients before any reads or writes", async () => {
  expect(await updateOpeningMakeup({ action: "RESERVE", entitlementId: "old-right" })).toMatchObject({ success: false });
  for (const query of Object.values(m)) expect(query).not.toHaveBeenCalled();
});
it("cannot replay the source sample import even with a confirmed form", async () => {
  const form = new FormData(); form.set("confirmed", "yes");
  expect(await applyMusicOperationalPilot({ success: false, message: "" }, form)).toMatchObject({ success: false, message: expect.stringContaining("已移除") });
  expect(m.commit).not.toHaveBeenCalled(); expect(m.revalidate).not.toHaveBeenCalled();
});
it("blocks service authorization independently of the page and action guards", async () => {
  await expect(authorizeMusicSourceImport()).rejects.toThrow("已移除");
  expect(m.actor).not.toHaveBeenCalled();
});
