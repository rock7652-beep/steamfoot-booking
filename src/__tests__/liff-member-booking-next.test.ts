import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMemberBookingNextPath,
  findPreferredMemberBookingSlot,
  parseMemberBookingNextSelection,
} from "@/lib/liff/member-booking-next";
import type { SlotAvailability } from "@/types";

const availableSlot: SlotAvailability = {
  startTime: "14:30",
  capacity: 4,
  bookedCount: 1,
  available: 3,
  isEnabled: true,
};

describe("LIFF member booking next booking", () => {
  it("round-trips the preferred time and people through the booking URL", () => {
    const path = buildMemberBookingNextPath("zhubei", {
      slotTime: "14:30",
      people: 2,
    });

    expect(path).toBe(
      "/s/zhubei/liff/member-booking?preferredSlot=14%3A30&people=2",
    );
    expect(parseMemberBookingNextSelection(path.split("?")[1] ?? "")).toEqual({
      slotTime: "14:30",
      people: 2,
    });
  });

  it("rejects malformed time and people query values", () => {
    expect(
      parseMemberBookingNextSelection("?preferredSlot=25:00&people=1"),
    ).toBeNull();
    expect(
      parseMemberBookingNextSelection("?preferredSlot=14:30&people=5"),
    ).toBeNull();
  });

  it("selects the prior time only when the requested party still fits", () => {
    expect(findPreferredMemberBookingSlot([availableSlot], "14:30", 3)).toBe(
      "14:30",
    );
    expect(findPreferredMemberBookingSlot([availableSlot], "14:30", 4)).toBeNull();
    expect(
      findPreferredMemberBookingSlot(
        [{ ...availableSlot, isPast: true }],
        "14:30",
        1,
      ),
    ).toBeNull();
  });

  it("wires the success CTA and unavailable-slot guidance into the LIFF form", () => {
    const form = readFileSync(
      "src/app/(liff)/liff/member-booking/member-booking-form.tsx",
      "utf8",
    );
    const successCard = readFileSync(
      "src/app/(liff)/liff/member-booking/_components/success-card.tsx",
      "utf8",
    );

    expect(successCard).toContain("successBookNextCta");
    expect(form).toContain("buildMemberBookingNextPath");
    expect(form).toContain("findPreferredMemberBookingSlot");
    expect(form).toContain("repeatPreferredSlotUnavailable");
  });
});
