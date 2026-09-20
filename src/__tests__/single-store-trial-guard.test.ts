import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), latest: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: m.store }, storeSubscription: { findFirst: m.latest } } }));
import { isStoreSubscriptionWriteBlocked, assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T04:00:00Z")); });
describe("trial expiry write boundary", () => {
  it.each(["2026-11-11T15:59:59.999Z", "2026-11-11T16:00:00.000Z"])("retention boundary %s never restores trial writes", async now => {
    vi.setSystemTime(new Date(now));
    m.store.mockResolvedValue({ currentSubscription: { status: "TRIAL", expiresAt: new Date("2026-10-12T00:00:00Z") } });
    expect(await isStoreSubscriptionWriteBlocked("retention-test-store")).toBe(true);
  });
  it("blocks on day 31 using the actual current subscription, even if a newer draft exists", async () => {
    m.store.mockResolvedValue({ currentSubscription: { status: "TRIAL", expiresAt: new Date("2026-10-12T00:00:00Z") } });
    m.latest.mockResolvedValue({ status: "PAYMENT_PENDING", expiresAt: null });
    await expect(assertStoreSubscriptionWritable("store")).rejects.toThrow("唯讀");
    expect(m.latest).not.toHaveBeenCalled();
  });
  it("continues through the end of day 30 in Taiwan", async () => {
    vi.setSystemTime(new Date("2026-10-12T15:59:59Z"));
    m.store.mockResolvedValue({ currentSubscription: { status: "TRIAL", expiresAt: new Date("2026-10-12T00:00:00Z") } });
    expect(await isStoreSubscriptionWriteBlocked("store")).toBe(false);
    vi.setSystemTime(new Date("2026-10-12T16:00:00Z"));
    expect(await isStoreSubscriptionWriteBlocked("store")).toBe(true);
  });
  it("restores writes after conversion and leaves legacy unsubscribed shops usable", async () => {
    m.store.mockResolvedValue({ currentSubscription: { status: "ACTIVE", expiresAt: new Date("2026-11-12T00:00:00Z") } });
    expect(await isStoreSubscriptionWriteBlocked("store")).toBe(false);
    m.store.mockResolvedValue({ currentSubscription: null }); m.latest.mockResolvedValue(null);
    expect(await isStoreSubscriptionWriteBlocked("legacy")).toBe(false);
  });
});
