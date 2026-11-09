import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuccessCard } from "@/app/(liff)/liff/member-booking/_components/success-card";

afterEach(() => vi.unstubAllGlobals());
function receipt(usedMakeupCount: number, planSessionCount: number) {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(React.createElement(SuccessCard, { storeSlug: "nuannuan", bookingDate: "2026-11-03", slotTime: "10:00", usedMakeupCount, planSessionCount, onBookNext: () => {} }));
}
describe("LIFF actual makeup receipt", () => {
  it("confirms a fully covered booking does not use plan sessions", () => {
    expect(receipt(1, 0)).toContain("本次不扣方案堂數。");
    expect(receipt(1, 0)).toContain("張補課券");
  });
  it("explains mixed usage without claiming the whole booking is free of plan deductions", () => {
    const html = receipt(1, 2);
    expect(html).toContain("另保留 2 堂方案，完成服務後核銷。");
    expect(html).not.toContain("本次不扣方案堂數。");
  });
  it("does not claim makeup usage when no credit was used", () => {
    expect(receipt(0, 1)).not.toContain("張補課券");
  });
});
