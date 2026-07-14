import { describe, expect, it } from "vitest";
import { buildReferralEntryUrl, buildShareText } from "@/lib/share";

describe("per-store referral share", () => {
  it("分享網址固定經過店舖入口並保留 ref", () => {
    expect(buildReferralEntryUrl("taichung", "ABC234")).toBe(
      "/s/taichung/line-entry?ref=ABC234",
    );
  });

  it.each(["暖暖蒸足", "以斯帖蒸足", "暖沐蒸足"])("文案使用 Store.name：%s", (storeName) => {
    const text = buildShareText({
      storeName,
      url: "/s/store/line-entry?ref=ABC234",
    });
    expect(text).toContain(`我最近去「${storeName}」`);
    expect(text).toContain(`📍${storeName}`);
    expect(text).toContain("ref=ABC234");
  });
});
