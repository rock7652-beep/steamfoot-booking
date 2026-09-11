import { describe, expect, it } from "vitest";
import {
  normalizePersonName,
  normalizeTaiwanPhone,
  reconcileHealthflowImport,
} from "@/lib/healthflow-import-reconciliation";

describe("healthflow import reconciliation", () => {
  it("normalizes Taiwan phone formats", () => {
    expect(normalizeTaiwanPhone("+886 912-345-678")).toBe("0912345678");
    expect(normalizeTaiwanPhone("0912 345 678")).toBe("0912345678");
    expect(normalizeTaiwanPhone("123")).toBeNull();
  });

  it("normalizes names without changing identity semantics", () => {
    expect(normalizePersonName(" 王 小明 ")).toBe("王小明");
    expect(normalizePersonName("Amy・Chen")).toBe("amychen");
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

  it("counts only linked profiles that actually have source records", () => {
    const result = reconcileHealthflowImport(
      [
        { id: "customer-1", healthProfileId: "profile-1", phone: null },
        { id: "customer-2", healthProfileId: "profile-2", phone: null },
      ],
      [
        { id: "profile-1", phone: null, phoneNormalized: null },
        { id: "profile-2", phone: null, phoneNormalized: null },
      ],
      [{ userId: "profile-1" }],
    );
    expect(result.summary.confirmedProfiles).toBe(1);
    expect(result.summary.confirmedRecords).toBe(1);
  });

  it("reports a record whose source profile is missing", () => {
    const result = reconcileHealthflowImport(
      [],
      [],
      [{ userId: "missing-profile" }],
    );
    expect(result.summary.missingSourceProfiles).toBe(1);
    expect(result.summary.missingSourceRecords).toBe(1);
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

  it("separates a unique phone plus supporting identity signal as high confidence review-only", () => {
    const result = reconcileHealthflowImport(
      [
        {
          id: "customer-1",
          healthProfileId: null,
          phone: "0912000001",
          name: "王小明",
          storeKey: "zhubei",
        },
      ],
      [
        {
          id: "profile-1",
          phone: "0912000001",
          phoneNormalized: null,
          fullName: "王 小明",
          storeKey: "zhubei",
        },
      ],
      [{ userId: "profile-1" }],
    );
    expect(result.confirmedProfileToCustomer.size).toBe(0);
    expect(result.summary.highConfidenceReviewProfiles).toBe(1);
    expect(result.summary.phoneReviewProfiles).toBe(0);
  });

  it("reports a unique same-store name and birthday candidate without auto-linking", () => {
    const result = reconcileHealthflowImport(
      [
        {
          id: "customer-1",
          healthProfileId: null,
          phone: null,
          name: "陳美麗",
          birthDate: "1980-05-01",
          storeKey: "hsinchu",
        },
      ],
      [
        {
          id: "profile-1",
          phone: null,
          phoneNormalized: null,
          fullName: "陳美麗",
          birthDate: "1980-05-01",
          storeKey: "hsinchu",
        },
      ],
      [{ userId: "profile-1" }],
    );
    expect(result.confirmedProfileToCustomer.size).toBe(0);
    expect(result.summary.secondaryReviewProfiles).toBe(1);
  });

  it("fails closed when an otherwise unique phone points to another store", () => {
    const result = reconcileHealthflowImport(
      [
        {
          id: "customer-1",
          healthProfileId: null,
          phone: "0912000001",
          name: "王小明",
          storeKey: "taichung",
        },
      ],
      [
        {
          id: "profile-1",
          phone: "0912000001",
          phoneNormalized: null,
          fullName: "王小明",
          storeKey: "zhubei",
        },
      ],
      [{ userId: "profile-1" }],
    );
    expect(result.summary.highConfidenceReviewProfiles).toBe(0);
    expect(result.summary.storeConflictProfiles).toBe(1);
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
