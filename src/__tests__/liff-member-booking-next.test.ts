import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildMemberBookingNextPath,
  parseMemberBookingNextPeople,
} from "@/lib/liff/member-booking-next";

describe("LIFF member booking next booking", () => {
  it("round-trips only the people count through the booking URL", () => {
    const path = buildMemberBookingNextPath("zhubei", 2);

    expect(path).toBe("/s/zhubei/liff/member-booking?people=2");
    expect(parseMemberBookingNextPeople(path.split("?")[1] ?? "")).toBe(2);
  });

  it("rejects malformed people query values", () => {
    expect(parseMemberBookingNextPeople("?people=0")).toBeNull();
    expect(parseMemberBookingNextPeople("?people=5")).toBeNull();
  });

  it("wires the success CTA without carrying or preselecting a slot", () => {
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
    expect(form).not.toContain("preferredSlot");
    expect(form).not.toContain("setSelectedSlot(matchingSlot)");
  });
});
