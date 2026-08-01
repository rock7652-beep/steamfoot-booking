import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leadList = readFileSync(
  "src/app/(dashboard)/dashboard/digital-butler/leads/lead-list.tsx",
  "utf8",
);

describe("digital butler lead card UI contract", () => {
  it("uses plain-language progress labels and a clear save action", () => {
    expect(leadList).toContain('NEW: "待接手"');
    expect(leadList).toContain('CONTACTING: "處理中"');
    expect(leadList).toContain('LOST: "已結案（未成交）"');
    expect(leadList).toContain("儲存處理結果");
  });

  it("keeps secondary activity history collapsed to reduce card height", () => {
    expect(leadList).toContain("<details");
    expect(leadList).toContain("查看最近追蹤");
    expect(leadList).toContain("顧客需求：");
  });

  it("explains that assigning an owner counts as accepting the handoff", () => {
    expect(leadList).toContain("選擇負責人並儲存，就代表已接手");
  });
});
