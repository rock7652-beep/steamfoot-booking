import { describe, expect, it } from "vitest";
import { resolveEffectiveEntitlement, featurePresentationState } from "@/lib/effective-entitlement";

const NOW = new Date("2026-07-16T04:00:00.000Z");

describe("resolveEffectiveEntitlement", () => {
  it.each([false, true])("uses plan default %s without an override", (planDefault) => {
    expect(resolveEffectiveEntitlement(planDefault, null, NOW)).toEqual({
      enabled: planDefault,
      source: "PLAN_DEFAULT",
    });
  });

  it("lets an active ENABLED override unlock a plan-excluded feature", () => {
    expect(resolveEffectiveEntitlement(false, {
      status: "ENABLED",
      startsAt: null,
      expiresAt: null,
    }, NOW)).toEqual({ enabled: true, source: "ENABLED" });
  });

  it("lets an active DISABLED override lock a plan-included feature", () => {
    expect(resolveEffectiveEntitlement(true, {
      status: "DISABLED",
      startsAt: null,
      expiresAt: null,
    }, NOW)).toEqual({ enabled: false, source: "DISABLED" });
  });

  it.each([
    {
      label: "not started",
      override: {
        status: "ENABLED" as const,
        startsAt: new Date("2026-07-17T00:00:00.000Z"),
        expiresAt: null,
      },
      source: "NOT_STARTED",
    },
    {
      label: "expired",
      override: {
        status: "ENABLED" as const,
        startsAt: null,
        expiresAt: new Date("2026-07-15T00:00:00.000Z"),
      },
      source: "EXPIRED",
    },
  ])("falls back to the plan when an override is $label", ({ override, source }) => {
    expect(resolveEffectiveEntitlement(false, override, NOW)).toEqual({
      enabled: false,
      source,
    });
  });

  it("treats exact start and expiry instants as active", () => {
    expect(resolveEffectiveEntitlement(false, {
      status: "ENABLED",
      startsAt: NOW,
      expiresAt: NOW,
    }, NOW)).toEqual({ enabled: true, source: "ENABLED" });
  });
});


describe("three-state presentation", () => {
  it.each(["HIDDEN", "LOCKED"] as const)("%s denies use for every plan default", status => {
    for (const base of [true, false]) {
      const result = resolveEffectiveEntitlement(base, {status, startsAt: NOW, expiresAt: NOW}, NOW);
      expect(result.enabled).toBe(false);
      expect(featurePresentationState(result)).toBe(status);
    }
  });
  it.each(["HIDDEN", "LOCKED"] as const)("%s restores plan presentation outside its active dates", status => {
    for (const dates of [{startsAt:new Date(NOW.getTime()+1), expiresAt:null}, {startsAt:null, expiresAt:new Date(NOW.getTime()-1)}]) {
      expect(featurePresentationState(resolveEffectiveEntitlement(true, {status, ...dates}, NOW))).toBe("ENABLED");
      expect(featurePresentationState(resolveEffectiveEntitlement(false, {status, ...dates}, NOW))).toBe("LOCKED");
    }
  });
  it("keeps legacy DISABLED visibly locked", () => {
    expect(featurePresentationState(resolveEffectiveEntitlement(true, {status:"DISABLED", startsAt:null, expiresAt:null}, NOW))).toBe("LOCKED");
  });
});
