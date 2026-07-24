import { beforeEach, describe, expect, it, vi } from "vitest";

const probeMock = vi.fn();

vi.mock("@/lib/line", () => ({
  probeStoreLineRecipient: (...args: unknown[]) => probeMock(...args),
}));

const central = {
  customerId: "customer-1",
  status: "READY" as const,
  deliverable: true,
  centralUserId: "user-1",
  recipientLineUserId: "U-central",
  maskedRecipient: "U******tral",
};

describe("resolveVerifiedReminderLineRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the store route only after the store channel recognizes the id", async () => {
    probeMock.mockResolvedValue({ status: "COMPATIBLE" });
    const { resolveVerifiedReminderLineRoute } = await import(
      "@/server/services/verified-reminder-line-route"
    );

    await expect(
      resolveVerifiedReminderLineRoute("store-hsinchu", "U-store", central),
    ).resolves.toMatchObject({
      status: "READY",
      channel: "STORE",
      recipientLineUserId: "U-store",
    });
    expect(probeMock).toHaveBeenCalledWith("store-hsinchu", "U-store");
  });

  it("falls back to central when the id is from a different LINE provider", async () => {
    probeMock.mockResolvedValue({ status: "INCOMPATIBLE" });
    const { resolveVerifiedReminderLineRoute } = await import(
      "@/server/services/verified-reminder-line-route"
    );

    await expect(
      resolveVerifiedReminderLineRoute("store-hsinchu", "U-central-login", central),
    ).resolves.toMatchObject({
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: "U-central",
    });
  });

  it("fails closed when compatibility cannot be determined", async () => {
    probeMock.mockResolvedValue({ status: "UNAVAILABLE", httpStatus: 401 });
    const { resolveVerifiedReminderLineRoute } = await import(
      "@/server/services/verified-reminder-line-route"
    );

    await expect(
      resolveVerifiedReminderLineRoute("store-hsinchu", "U-unknown", central),
    ).resolves.toMatchObject({
      status: "BLOCKED",
      channel: null,
      reason: "store_channel_verification_unavailable:401",
    });
  });
});
