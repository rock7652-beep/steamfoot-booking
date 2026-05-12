/**
 * settlement-overrides — JSON schema validation + lookup behavior
 *
 * Pure schema tests; doesn't touch the filesystem.
 */

import { describe, it, expect } from "vitest";
import {
  OverrideEntrySchema,
  OverrideFileSchema,
  SETTLEMENT_DECISIONS,
} from "@/server/services/settlement-overrides";

describe("OverrideEntrySchema", () => {
  it("接受 CONFIRM_AS_IS（不需 totalSessions / unitPrice）", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "CONFIRM_AS_IS",
    });
    expect(r.success).toBe(true);
  });

  it("接受 EXCLUDE_FROM_SETTLEMENT（不需 totalSessions / unitPrice）", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "EXCLUDE_FROM_SETTLEMENT",
    });
    expect(r.success).toBe(true);
  });

  it("接受 OVERRIDE_TOTAL 含 overrideTotalSessions + overrideUnitPrice", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "OVERRIDE_TOTAL",
      overrideTotalSessions: 22,
      overrideUnitPrice: 545.45,
    });
    expect(r.success).toBe(true);
  });

  it("OVERRIDE_TOTAL 缺 overrideTotalSessions → 失敗", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "OVERRIDE_TOTAL",
      overrideUnitPrice: 545.45,
    });
    expect(r.success).toBe(false);
  });

  it("OVERRIDE_TOTAL 缺 overrideUnitPrice → 失敗", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "OVERRIDE_TOTAL",
      overrideTotalSessions: 22,
    });
    expect(r.success).toBe(false);
  });

  it("walletId 為空字串 → 失敗", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "",
      decision: "CONFIRM_AS_IS",
    });
    expect(r.success).toBe(false);
  });

  it("decision 非合法值 → 失敗", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "MAYBE",
    });
    expect(r.success).toBe(false);
  });

  it("overrideTotalSessions 為 0 → 失敗（必須正整數）", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "OVERRIDE_TOTAL",
      overrideTotalSessions: 0,
      overrideUnitPrice: 100,
    });
    expect(r.success).toBe(false);
  });

  it("overrideUnitPrice 為負數 → 失敗（必須正數）", () => {
    const r = OverrideEntrySchema.safeParse({
      walletId: "ck_abc",
      decision: "OVERRIDE_TOTAL",
      overrideTotalSessions: 10,
      overrideUnitPrice: -100,
    });
    expect(r.success).toBe(false);
  });
});

describe("OverrideFileSchema", () => {
  it("接受 version=1 + 空 overrides", () => {
    const r = OverrideFileSchema.safeParse({
      version: 1,
      overrides: [],
    });
    expect(r.success).toBe(true);
  });

  it("接受多筆混合 decision", () => {
    const r = OverrideFileSchema.safeParse({
      version: 1,
      overrides: [
        { walletId: "w1", decision: "CONFIRM_AS_IS" },
        {
          walletId: "w2",
          decision: "OVERRIDE_TOTAL",
          overrideTotalSessions: 22,
          overrideUnitPrice: 545.45,
        },
        { walletId: "w3", decision: "EXCLUDE_FROM_SETTLEMENT" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("version != 1 → 失敗（未支援其他版本）", () => {
    const r = OverrideFileSchema.safeParse({
      version: 2,
      overrides: [],
    });
    expect(r.success).toBe(false);
  });

  it("overrides 不是陣列 → 失敗", () => {
    const r = OverrideFileSchema.safeParse({
      version: 1,
      overrides: { w1: "anything" },
    });
    expect(r.success).toBe(false);
  });

  it("允許額外不認得的欄位（_comment / _updatedAt 等）", () => {
    const r = OverrideFileSchema.safeParse({
      version: 1,
      _comment: "doc",
      _updatedAt: "2026-05-12",
      overrides: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("SETTLEMENT_DECISIONS constant", () => {
  it("包含三個合法決策值", () => {
    expect(SETTLEMENT_DECISIONS).toEqual([
      "CONFIRM_AS_IS",
      "OVERRIDE_TOTAL",
      "EXCLUDE_FROM_SETTLEMENT",
    ]);
  });
});
