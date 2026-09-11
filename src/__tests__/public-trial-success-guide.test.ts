import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(
  new URL(
    "../app/pricing/experience/zhubei/book/zhubei-trial-booking-form.tsx",
    import.meta.url,
  ),
  "utf8",
);

const zhubeiPageSource = readFileSync(
  new URL("../app/pricing/experience/zhubei/book/page.tsx", import.meta.url),
  "utf8",
);

const partnerPageSource = readFileSync(
  new URL(
    "../app/pricing/experience/[storeSlug]/book/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("public trial success guidance", () => {
  it("keeps the success confirmation before smoothly revealing the visit guide", () => {
    expect(formSource).toContain("體驗預約成功");
    expect(formSource).toContain("以下是第一次到店前需要知道的事項");
    expect(formSource).toContain("scrollIntoView");
    expect(formSource).toContain('behavior: "smooth"');
    expect(formSource).toContain("查看到店前提醒");
  });

  it("provides the same guide destination for all three stores", () => {
    expect(zhubeiPageSource).toContain('id="first-visit-guide"');
    expect(partnerPageSource).toContain('id="first-visit-guide"');
  });
});
