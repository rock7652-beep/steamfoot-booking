import { describe, expect, it, vi } from "vitest";
import { courseDebitPolicy } from "@/lib/course-debit-policy";
import { readCourseBusinessProfile } from "@/server/services/course-business-profile";
import { validateFitnessPurchase } from "@/server/services/course-purchase-rules";
import type { Prisma } from "../../generated/course-client";
import type { CourseCheckoutInput } from "@/lib/course-checkout";

describe("course business boundaries", () => {
  it("reads each store through the supplied transaction without retaining another store's profile", async () => {
    const raw = vi.fn().mockResolvedValueOnce([{featureKey:"business.music"}]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("database unavailable"));
    const reader = {$queryRaw:raw} as unknown as Pick<Prisma.TransactionClient,"$queryRaw">;
    expect(await readCourseBusinessProfile(reader,"music-store")).toBe("MUSIC");
    expect(await readCourseBusinessProfile(reader,"fitness-store")).toBe("FITNESS");
    expect(raw.mock.calls.map(call => call.slice(1))).toEqual([["music-store"],["fitness-store"]]);
    await expect(readCourseBusinessProfile(reader,"music-store")).rejects.toThrow("database unavailable");
  });

  it("forfeits music group leave while releasing sports and individual music leave", () => {
    const leave = {target:"STUDENT_LEAVE" as const,hasCard:true,classType:"GROUP"};
    expect(courseDebitPolicy("MUSIC",leave)).toMatchObject({shouldDebit:true,groupLeaveForfeited:true});
    expect(courseDebitPolicy("FITNESS",leave)).toMatchObject({shouldDebit:false,groupLeaveForfeited:false});
    expect(courseDebitPolicy("MUSIC",{...leave,classType:"INDIVIDUAL"}).shouldDebit).toBe(false);
    expect(courseDebitPolicy("MUSIC",{...leave,hasCard:false}).shouldDebit).toBe(false);
  });

  it("deducts paid no-shows in both businesses but only sports allows a makeup voucher", () => {
    const missed = {target:"NO_SHOW" as const,hasCard:true};
    expect(courseDebitPolicy("MUSIC",missed)).toMatchObject({shouldDebit:true,allowsNoShowMakeup:false});
    expect(courseDebitPolicy("FITNESS",missed)).toMatchObject({shouldDebit:true,allowsNoShowMakeup:true});
    for (const profile of ["MUSIC","FITNESS"] as const) {
      expect(courseDebitPolicy(profile,{...missed,hasCard:false}).shouldDebit).toBe(false);
      expect(courseDebitPolicy(profile,{target:"CANCELLED",hasCard:true}).shouldDebit).toBe(false);
      expect(courseDebitPolicy(profile,{target:"CHECKED_IN",hasCard:true}).shouldDebit).toBe(false);
    }
  });

  it.each([{musicPurchaseTerms:2},{musicManualBonus:1},{musicJoinSessionId:"session"},{musicValidityDays:30}])("rejects music purchase options on sports checkout: %j", data => {
    expect(() => validateFitnessPurchase(data as CourseCheckoutInput)).toThrow("此方案不適用音樂課程設定");
  });
});
