import { afterEach, expect, it, vi } from "vitest";
import { courseMemberReturnPath } from "@/lib/course-delivery-links";
import { deriveCourseBaseUrl, courseMemberNotificationUrl } from "@/server/services/course-delivery-links";
afterEach(() => vi.unstubAllEnvs());
it("preserves date and mode after LIFF login but cannot redirect to a different store or host", () => {
  const path = courseMemberReturnPath("store-a", "?courseDate=2026-10-01&courseView=bookings&next=https://evil.test&store=store-b");
  expect(path).toBe("/s/store-a/book?date=2026-10-01&month=2026-10&view=bookings");
  expect(courseMemberReturnPath("store-a", "?courseView=admin&courseDate=javascript:bad")).toBe("/s/store-a/book");
});
it("reads the LIFF state query without treating its path as authorization", () => {
  expect(courseMemberReturnPath("a", "?liff.state=" + encodeURIComponent("/s/b?courseView=plans"))).toBe("/s/a/book?view=plans");
});
it("keeps configured delivery links on the fixed origin", () => {
  vi.stubEnv("COURSE_TRIAL_ORIGIN", "https://trial.example.test");
  expect(deriveCourseBaseUrl()).toBe("https://trial.example.test");
  expect(courseMemberNotificationUrl("a", "plans").origin).toBe("https://trial.example.test");
});
it.each(["http://trial.example.test", "https://user:pass@trial.example.test", "https://trial.example.test/other", "https://trial.example.test?store=b"])("rejects invalid delivery origin %s", origin => {
  vi.stubEnv("COURSE_TRIAL_ORIGIN", origin);
  expect(deriveCourseBaseUrl).toThrow();
});
