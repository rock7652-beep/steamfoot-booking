import { describe, expect, it } from "vitest";
import { resolveReminderLineRoute } from "@/server/services/reminder-line-route";
import type { CentralLineRecipientResolution } from "@/server/services/central-line-recipient";

const central = (
  overrides: Partial<CentralLineRecipientResolution> = {},
): CentralLineRecipientResolution => ({
  customerId: "customer-1",
  status: "READY",
  deliverable: true,
  centralUserId: "user-1",
  recipientLineUserId: "U-central",
  maskedRecipient: "U******tral",
  ...overrides,
});

describe("resolveReminderLineRoute", () => {
  it("prefers the verified central channel when both recipients exist", () => {
    expect(resolveReminderLineRoute(" U-store ", central())).toEqual({
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: "U-central",
    });
  });

  it("uses the central channel when no store recipient exists", () => {
    expect(resolveReminderLineRoute(null, central())).toEqual({
      status: "READY",
      channel: "CENTRAL",
      recipientLineUserId: "U-central",
    });
  });

  it("selects exactly one recipient when both routes exist", () => {
    const route = resolveReminderLineRoute("U-store", central());
    expect(route.channel).toBe("CENTRAL");
    expect(route.recipientLineUserId).toBe("U-central");
  });

  it("preserves a usable store fallback during central onboarding", () => {
    expect(resolveReminderLineRoute("U-store", central({
      status: "NO_CENTRAL_LINE",
      deliverable: false,
      recipientLineUserId: null,
    }))).toMatchObject({
      status: "READY",
      channel: "STORE",
      recipientLineUserId: "U-store",
    });
  });

  it("blocks with an auditable reason when neither route is usable", () => {
    expect(resolveReminderLineRoute(null, central({
      status: "NO_CENTRAL_USER",
      deliverable: false,
      recipientLineUserId: null,
    }))).toEqual({
      status: "BLOCKED",
      channel: null,
      recipientLineUserId: null,
      reason: "NO_CENTRAL_USER",
    });
  });
});
