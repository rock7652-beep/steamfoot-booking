import { describe, expect, it } from "vitest";
import {
  normalizeTaiwanPhone,
  reconcileHealthflowImport,
} from "@/lib/healthflow-import-reconciliation";

describe("healthflow import reconciliation", () => {
  it("normalizes Taiwan phone formats", () => {
    expect(normalizeTaiwanPhone("+886 912-345-678")).toBe("0912345678");
    expect(normalizeTaiwanPhone("0912 345 678")).toBe("0912345678");
    expect(normalizeTaiwanPhone("123")).toBeNull();
  });

  it("imports only an existing unique profile link", () => {
    const result = reconcileHealthflowImport(
      [{ id: "customer-1", healthProfileId: "profile-1", phone: "0912000001" }],
      [{ id: "profile-1", phone: "0912000001", phoneNormalized: "0912000001" }],
      [{ userId: "profile-1" }, { userId: "profile-1" }],
    );
    expect(result.confirmedProfileToCustomer.get("profile-1")?.id).toBe("customer-1");
    expect(result.summary.confirmedRecords).toBe(2);
  });

  it("reports a unique phone match for review without auto-linking", () => {
    const result = reconcileHealthflowImport(
      [{ id: "customer-1", healthProfileId: null, phone: "0912000001" }],
      [{ id: "profile-1", phone: null, phoneNormalized: "+886912000001" }],
      [{ userId: "profile-1" }],
    );
    expect(result.confirmedProfileToCustomer.size).toBe(0);
    expect(result.summary.phoneReviewProfiles).toBe(1);
    expect(result.summary.phoneReviewRecords).toBe(1);
  });

  it("fails closed when a phone or confirmed profile is ambiguous", () => {
    const result = reconcileHealthflowImport(
      [
        { id: "customer-1", healthProfileId: "profile-1", phone: "0912000001" },
        { id: "customer-2", healthProfileId: "profile-1", phone: "0912000002" },
        { id: "customer-3", healthProfileId: null, phone: "0912000003" },
        { id: "customer-4", healthProfileId: null, phone: "0912000003" },
      ],
      [
        { id: "profile-1", phone: "0912000001", phoneNormalized: null },
        { id: "profile-2", phone: "0912000003", phoneNormalized: null },
      ],
      [{ userId: "profile-1" }, { userId: "profile-2" }],
    );
    expect(result.confirmedProfileToCustomer.size).toBe(0);
    expect(result.summary.duplicateConfirmedProfileIds).toBe(1);
    expect(result.summary.ambiguousProfiles).toBe(1);
  });
});
