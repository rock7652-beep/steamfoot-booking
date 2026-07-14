import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/server/actions/referral-share-template", () => ({
  updateReferralShareTemplate: vi.fn(),
}));

import { getReferralShareTemplateError } from "@/app/(dashboard)/dashboard/settings/referral-share/referral-share-form";

describe("referral share settings UI validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts the supported store and URL variables", () => {
    expect(
      getReferralShareTemplateError("推薦你來 {storeName}\n{url}"),
    ).toBeNull();
  });

  it("shows the backend-compatible error when URL is missing", () => {
    expect(getReferralShareTemplateError("推薦你來 {storeName}")).toBe(
      "推薦分享文案必須且只能包含一個 {url}",
    );
  });

  it("rejects duplicate URL and unknown variables", () => {
    expect(getReferralShareTemplateError("{url}\n{url}")).toBe(
      "推薦分享文案必須且只能包含一個 {url}",
    );
    expect(getReferralShareTemplateError("{customerName}\n{url}")).toContain(
      "不支援變數 {customerName}",
    );
  });
});
