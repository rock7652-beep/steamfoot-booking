import { beforeEach, describe, expect, it, vi } from "vitest";

const storeProbeMock = vi.fn();
const centralProbeMock = vi.fn();

vi.mock("@/lib/line", () => ({
  probeStoreLineRecipient: (...args: unknown[]) => storeProbeMock(...args),
  probeSteamButlerLineRecipient: (...args: unknown[]) => centralProbeMock(...args),
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
    storeProbeMock.mockResolvedValue({ status: "COMPATIBLE" });
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
    expect(storeProbeMock).toHaveBeenCalledWith("store-hsinchu", "U-store");
    expect(centralProbeMock).not.toHaveBeenCalled();
  });

  it("falls back to central when the id is from a different LINE provider", async () => {
    storeProbeMock.mockResolvedValue({ status: "INCOMPATIBLE" });
    centralProbeMock.mockResolvedValue({ status: "COMPATIBLE" });
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
    expect(centralProbeMock).toHaveBeenCalledWith("U-central");
  });

  it("blocks a LINE Login subject that the central Messaging API cannot reach", async () => {
    storeProbeMock.mockResolvedValue({ status: "INCOMPATIBLE" });
    centralProbeMock.mockResolvedValue({ status: "INCOMPATIBLE", httpStatus: 404 });
    const { resolveVerifiedReminderLineRoute } = await import(
      "@/server/services/verified-reminder-line-route"
    );

    await expect(
      resolveVerifiedReminderLineRoute("store-hsinchu", "U-central-login", central),
    ).resolves.toMatchObject({
      status: "BLOCKED",
      channel: null,
      reason: "CENTRAL_LINE_NOT_MESSAGING_REACHABLE",
    });
  });

  it("fails closed when compatibility cannot be determined", async () => {
    storeProbeMock.mockResolvedValue({ status: "UNAVAILABLE", httpStatus: 401 });
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
