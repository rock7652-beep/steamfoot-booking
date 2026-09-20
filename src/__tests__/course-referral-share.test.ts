import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ member: vi.fn(), feature: vi.fn(), event: vi.fn() }));
vi.mock("@/server/services/course-access", () => ({ courseMember: m.member }));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature }));
vi.mock("@/server/services/referral-events", () => ({ createReferralEvent: m.event }));
import { trackCourseShare } from "@/server/actions/course-referral-share";
beforeEach(() => { vi.clearAllMocks(); m.member.mockResolvedValue({ storeId: "linked-store", customer: { id: "linked-member" } }); m.feature.mockResolvedValue(undefined); });
describe("course sharing identity", () => {
  it("uses the linked actor rather than spoofed member or store", async () => {
    await trackCourseShare({ source: "course-member:copy", storeId: "other", customerId: "victim" } as never);
    expect(m.event).toHaveBeenCalledWith({ storeId: "linked-store", referrerId: "linked-member", type: "SHARE", source: "course-member:copy" });
  });
  it("does not record events for a coach-only or inactive identity", async () => {
    m.member.mockRejectedValue(new Error("member disabled"));
    await trackCourseShare({ source: "course" });
    expect(m.event).not.toHaveBeenCalled();
  });
  it("honors store feature gating", async () => {
    m.feature.mockRejectedValue(new Error("not enabled"));
    await trackCourseShare({ source: "course" });
    expect(m.event).not.toHaveBeenCalled();
  });
});
