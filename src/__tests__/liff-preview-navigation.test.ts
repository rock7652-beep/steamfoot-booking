import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSelectedLayoutSegment: () => null, useSelectedLayoutSegments: () => [] }));
import { LiffBottomNav, LiffBottomNavView } from "@/app/(liff)/liff/liff-bottom-nav";

describe("shared LIFF navigation", () => {
  it("keeps all preview destinations within the selected store and person", () => {
    const base = "/frontend-preview?storeId=test&personId=member&role=member";
    const html = renderToStaticMarkup(createElement(LiffBottomNavView, { base: "/s/test/liff", activeKey: "wallets", healthAssessmentEnabled: true, links: Object.fromEntries(["home", "bookings", "wallets", "health", "profile"].map(key => [key, `${base}&view=${key}`])) }));
    expect(html.match(/href="\/frontend-preview\?/g)).toHaveLength(5);
    expect(html).not.toContain('href="/s/');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("bottom-0");
  });
  it("uses the production routes and hides health when not entitled", () => {
    const html = renderToStaticMarkup(createElement(LiffBottomNav, { storeSlug: "test", healthAssessmentEnabled: false, homeOnly: true }));
    expect(html).toContain('href="/s/test/liff/profile"');
    expect(html).not.toContain('href="/s/test/liff/health"');
    expect(html.match(/<a /g)).toHaveLength(4);
  });
});
