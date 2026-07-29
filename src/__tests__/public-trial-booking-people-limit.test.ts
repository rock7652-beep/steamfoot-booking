import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actionSource = readFileSync("src/server/actions/public-trial-booking.ts", "utf8");
const formSource = readFileSync(
  "src/app/pricing/experience/zhubei/book/zhubei-trial-booking-form.tsx",
  "utf8",
);
const pageSource = readFileSync("src/app/pricing/experience/zhubei/book/page.tsx", "utf8");

describe("public trial booking people limit", () => {
  it("rejects public submissions above two people", () => {
    expect(actionSource).toContain('.max(2, "單次最多預約 2 人")');
    expect(actionSource).not.toContain('.max(4, "單次最多預約 4 人")');
  });

  it("only offers one or two people and keeps public copy aligned", () => {
    expect(formSource).toContain("[1, 2].map((count)");
    expect(formSource).not.toContain("[1, 2, 3, 4].map((count)");
    expect(pageSource).toContain("1–2 人皆可預約");
    expect(pageSource).toContain("一次可預約 1–2 人");
    expect(pageSource).toContain("單次可預約 1–2 人");
    expect(pageSource).not.toContain("1–4 人");
  });
});
