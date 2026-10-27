import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/image-announcements/carousel", () => ({
  StoreImageAnnouncements: ({ storeSlug, preview }: { storeSlug: string; preview: boolean }) =>
    React.createElement("section", { "data-public-notice": storeSlug, "data-preview": String(preview) }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => React.createElement("a", { href }, children) }));
vi.mock("@/server/actions/liff-my-wallets", () => ({ fetchLiffWallets: vi.fn() }));
vi.mock("@/server/actions/liff-my-bookings", () => ({ fetchLiffBookings: vi.fn() }));
vi.mock("@/server/actions/liff-health", () => ({ fetchLiffHealthSummary: vi.fn() }));
vi.mock("@/server/actions/liff-member-stores", () => ({ fetchLiffMemberStoreContext: vi.fn() }));
vi.mock("@/server/actions/liff-referral-share", () => ({ fetchLiffReferralShareContext: vi.fn() }));
vi.mock("@/server/actions/liff-staff-access", () => ({ fetchLiffStaffAccess: vi.fn() }));
vi.mock("@/server/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/(liff)/liff/liff-store-share-card", () => ({ LiffStoreShareCard: () => null }));
vi.mock("@/app/(liff)/liff/liff-store-switcher", () => ({ LiffStoreSwitcher: () => null }));
vi.mock("@/app/(liff)/liff/liff-bottom-nav", () => ({ LiffBottomNav: () => null }));

import { WelcomeBack, type MemberHomeSummary } from "@/app/(liff)/liff/liff-shell";

const ready: MemberHomeSummary = {
  walletsStatus: "ok", activeWallets: [], makeupCredits: [], upcomingBookings: [],
  nextBooking: null, healthSummary: null, referralShare: null,
};

describe("public announcements independent of private member summary", () => {
  it.each([null, "error", ready] as const)("keeps exactly one current-store announcement reader for summary %s", (memberSummary) => {
    const html = renderToStaticMarkup(React.createElement(WelcomeBack, {
      storeSlug: "zhubei", displayName: null, healthAssessmentEnabled: false, memberSummary,
    }));
    expect(html.match(/data-public-notice="zhubei"/g)).toHaveLength(1);
    expect(html).toContain('data-preview="false"');
  });

  it("retains the explicit authenticated preview flag while summary is pending", () => {
    const html = renderToStaticMarkup(React.createElement(WelcomeBack, {
      storeSlug: "silverlily", displayName: null, healthAssessmentEnabled: false,
      memberSummary: null, previewAnnouncements: true,
    }));
    expect(html).toContain('data-public-notice="silverlily"');
    expect(html).toContain('data-preview="true"');
  });
});
