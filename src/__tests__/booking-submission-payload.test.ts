import { describe, expect, it } from "vitest";
import {
  buildCanonicalBookingCreateIntent,
  buildBookingCreatePayloadHash,
} from "@/server/services/booking-submission-payload";

const base = {
  storeId: "store-a",
  actorUserId: "user-a",
  canonicalCustomerId: "customer-a",
  bookingType: "PACKAGE_SESSION" as const,
  servicePlanId: "plan-a",
  bookingDate: "2026-08-01",
  slotTime: "10:00",
  people: 2,
};

describe("booking submission payload", () => {
  it("is deterministic and canonicalizes nullable fields and slot time", () => {
    const first = buildBookingCreatePayloadHash({
      ...base,
      slotTime: "10:00:00",
      notes: "  ",
    });
    const second = buildBookingCreatePayloadHash({
      ...base,
      slotTime: "10:00",
      notes: undefined,
      expectedAmount: undefined,
    });

    expect(first.intent.slotTime).toBe("10:00");
    expect(first.intent.notes).toBeNull();
    expect(first.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.payloadHash).toBe(second.payloadHash);
  });

  it("uses AUTO_FEFO when no preferred wallet is specified", () => {
    expect(buildCanonicalBookingCreateIntent(base)).toMatchObject({
      walletSelectionMode: "AUTO_FEFO",
      preferredWalletId: null,
    });
  });

  it("includes a validated preferred wallet in the intent hash", () => {
    const walletA = buildBookingCreatePayloadHash({
      ...base,
      customerPlanWalletId: "wallet-a",
    });
    const walletAReplay = buildBookingCreatePayloadHash({
      ...base,
      customerPlanWalletId: "wallet-a",
    });
    const walletB = buildBookingCreatePayloadHash({
      ...base,
      customerPlanWalletId: "wallet-b",
    });

    expect(walletA.intent).toMatchObject({
      walletSelectionMode: "PREFERRED_WALLET",
      preferredWalletId: "wallet-a",
    });
    expect(walletA.payloadHash).toBe(walletAReplay.payloadHash);
    expect(walletA.payloadHash).not.toBe(walletB.payloadHash);
  });

  it("does not accept execution allocation details as payload input", () => {
    const intent = buildCanonicalBookingCreateIntent(base);
    expect(intent).not.toHaveProperty("walletSessionIds");
    expect(intent).not.toHaveProperty("makeupCreditId");
    expect(intent).not.toHaveProperty("primaryWalletId");
    expect(intent).not.toHaveProperty("timestamp");
  });
});
