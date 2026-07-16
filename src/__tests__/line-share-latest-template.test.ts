import { describe, expect, it } from "vitest";
import { buildLineShareUrl, buildShareText } from "@/lib/share";

function decodeLineShareText(url: string): string {
  const parsed = new URL(url);
  return parsed.searchParams.get("text") ?? "";
}

describe("LINE referral share text", () => {
  it("uses the same latest custom template as copy", () => {
    const shareText = buildShareText({
      storeName: "暖暖蒸足竹北店",
      url: "https://example.com/s/zhubei/line-entry?ref=customer-a",
      template: "LINE 自訂模板測試 0715\n{storeName}\n{url}",
    });

    expect(decodeLineShareText(buildLineShareUrl(shareText))).toBe(shareText);
    expect(shareText).toContain("LINE 自訂模板測試 0715");
    expect(shareText).toContain("暖暖蒸足竹北店");
  });

  it("preserves line breaks, emoji and special characters", () => {
    const shareText = buildShareText({
      storeName: "以斯帖蒸足坊",
      url: "https://example.com/s/hsinchu/line-entry?ref=A%26B",
      template: "放鬆一下 ❤️\n店名：{storeName}\n朋友 & 家人都適合\n{url}",
    });

    expect(decodeLineShareText(buildLineShareUrl(shareText))).toBe(shareText);
  });

  it("falls back to the system default when no custom template exists", () => {
    const shareText = buildShareText({
      storeName: "暖沐蒸足",
      url: "https://example.com/s/taichung/line-entry?ref=customer-c",
      template: null,
    });

    expect(decodeLineShareText(buildLineShareUrl(shareText))).toBe(shareText);
    expect(shareText).toContain("暖沐蒸足");
    expect(shareText).toContain("https://example.com/s/taichung/line-entry?ref=customer-c");
  });
});
