import { describe, expect, it } from "vitest";
import {
  buildCentralLineAcceptanceSummary,
  classifyCentralLineAcceptance,
} from "@/server/services/central-line-acceptance";

const resolution = (status: Parameters<typeof classifyCentralLineAcceptance>[0]["status"]) => ({
  status,
  deliverable: status === "READY",
  recipientLineUserId: status === "READY" ? "U-central" : null,
});

describe("central LINE production acceptance", () => {
  it("accepts only a deliverable central LINE resolution", () => {
    expect(classifyCentralLineAcceptance(resolution("READY"))).toBe("ACCEPTED");
    expect(classifyCentralLineAcceptance({
      status: "READY",
      deliverable: false,
      recipientLineUserId: null,
    })).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("separates customer onboarding from identity conflicts", () => {
    expect(classifyCentralLineAcceptance(resolution("NO_CENTRAL_USER"))).toBe("CUSTOMER_ACTION_REQUIRED");
    expect(classifyCentralLineAcceptance(resolution("NO_CENTRAL_LINE"))).toBe("CUSTOMER_ACTION_REQUIRED");
    expect(classifyCentralLineAcceptance(resolution("LEGACY_LINE_CONFLICT"))).toBe("MANUAL_REVIEW_REQUIRED");
    expect(classifyCentralLineAcceptance(resolution("CENTRAL_USER_CONFLICT"))).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("passes conflict acceptance without claiming every customer is deliverable", () => {
    expect(buildCentralLineAcceptanceSummary([
      resolution("READY"),
      resolution("NO_CENTRAL_LINE"),
    ])).toEqual({
      counts: {
        ACCEPTED: 1,
        CUSTOMER_ACTION_REQUIRED: 1,
        MANUAL_REVIEW_REQUIRED: 0,
      },
      conflictFree: true,
      fullyDeliverable: false,
    });
  });

  it("fails acceptance when any central identity conflict remains", () => {
    const summary = buildCentralLineAcceptanceSummary([
      resolution("READY"),
      resolution("IDENTITY_LINK_CONFLICT"),
    ]);
    expect(summary.conflictFree).toBe(false);
    expect(summary.fullyDeliverable).toBe(false);
    expect(summary.counts.MANUAL_REVIEW_REQUIRED).toBe(1);
  });
});
