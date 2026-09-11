import { describe, expect, it } from "vitest";
import { findSpaPartyProviderAssignment } from "@/lib/spa-party-assignment";
import { SPA_DEMO_PROVIDERS } from "@/lib/spa-demo-store";
import { composeSpaServices } from "@/lib/spa-scheduling";

const providers = SPA_DEMO_PROVIDERS.map((provider) => ({
  id: provider.id,
  label: `${provider.badge}號 ${provider.name}`,
  specialties: provider.specialtyKeys,
  weeklyAvailability: provider.weeklyAvailability,
  availabilityExceptions: [],
  occupiedRanges: [],
}));

describe("SPA party provider assignment", () => {
  it("assigns distinct qualified providers to guests with different services and durations", () => {
    const result = findSpaPartyProviderAssignment({
      date: "2026-08-30",
      time: "11:00",
      providers,
      requests: [
        { items: composeSpaServices("aroma_body_60") },
        { items: composeSpaServices("facial_60") },
        { items: composeSpaServices("sleep_combo_120") },
      ],
    });

    expect(result).toHaveLength(3);
    expect(new Set(result.map((provider) => provider.id)).size).toBe(3);
    expect(result[1].specialties).toContain("face");
    expect(result[2].specialties).toEqual(expect.arrayContaining(["body", "head", "foot"]));
  });

  it("returns no time when distinct qualified providers cannot cover every guest", () => {
    const result = findSpaPartyProviderAssignment({
      date: "2026-08-30",
      time: "11:00",
      providers,
      requests: [
        { items: composeSpaServices("sleep_combo_120") },
        { items: composeSpaServices("sleep_combo_120") },
      ],
    });

    expect(result).toEqual([]);
  });

  it("honors an explicitly selected provider without assigning them twice", () => {
    const result = findSpaPartyProviderAssignment({
      date: "2026-08-30",
      time: "11:00",
      providers,
      requests: [
        { items: composeSpaServices("aroma_body_60"), providerId: "spa-demo-staff-10" },
        { items: composeSpaServices("facial_60") },
      ],
    });

    expect(result.map((provider) => provider.id)).toEqual(["spa-demo-staff-10", "spa-demo-staff-16"]);
  });
});
