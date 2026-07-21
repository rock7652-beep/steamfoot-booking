import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(customer)/profile/page.tsx"),
  "utf8",
);

describe("customer profile simplification", () => {
  it("shows linked stores and a single low-key support message", () => {
    expect(source).toContain("已連結門市");
    expect(source).toContain("資料有誤？請聯絡門市協助");
  });

  it("does not render normal-flow claim or unlink controls", () => {
    expect(source).not.toContain("CentralMemberClaimForm");
    expect(source).not.toContain("CentralMemberLinkReviewForm");
    expect(source).not.toContain("連結其他門市會員資料");
    expect(source).not.toContain("確認手機並自動連結");
    expect(source).not.toContain("解除連結申請");
  });
});
