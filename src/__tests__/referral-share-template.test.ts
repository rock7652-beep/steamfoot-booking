import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFERRAL_SHARE_TEMPLATE,
  REFERRAL_SHARE_TEMPLATE_MAX_LENGTH,
  normalizeReferralShareTemplate,
  renderReferralShareTemplate,
} from "@/lib/referral-share-template";
import { buildShareText } from "@/lib/share";

describe("referral share template", () => {
  it("uses the system default when the store has no custom template", () => {
    const text = buildShareText({
      storeName: "暖暖蒸足",
      url: "https://example.com/s/zhubei/line-entry?ref=abc",
      template: null,
    });

    expect(text).toContain("暖暖蒸足");
    expect(text).toContain("https://example.com/s/zhubei/line-entry?ref=abc");
    expect(text).not.toContain("{storeName}");
    expect(text).not.toContain("{url}");
  });

  it("renders a valid merchant template", () => {
    expect(
      renderReferralShareTemplate({
        template: "推薦你來 {storeName}\n{url}",
        storeName: "以斯帖蒸足坊",
        url: "https://example.com/ref",
      }),
    ).toBe("推薦你來 以斯帖蒸足坊\nhttps://example.com/ref");
  });

  it("normalizes empty input to null so the default remains active", () => {
    expect(normalizeReferralShareTemplate("   \n ")).toBeNull();
  });

  it("requires exactly one system-controlled URL placeholder", () => {
    expect(() => normalizeReferralShareTemplate("只有文字")).toThrow(
      "必須且只能包含一個 {url}",
    );
    expect(() =>
      normalizeReferralShareTemplate("{url}\n再次：{url}"),
    ).toThrow("必須且只能包含一個 {url}");
  });

  it("rejects unknown or malformed variables", () => {
    expect(() =>
      normalizeReferralShareTemplate("{customerName}\n{url}"),
    ).toThrow("不支援變數 {customerName}");
    expect(() =>
      normalizeReferralShareTemplate("{storeName\n{url}"),
    ).toThrow("變數格式錯誤");
  });

  it("rejects an overlong template", () => {
    const text = `${"a".repeat(REFERRAL_SHARE_TEMPLATE_MAX_LENGTH)}{url}`;
    expect(() => normalizeReferralShareTemplate(text)).toThrow(
      `不可超過 ${REFERRAL_SHARE_TEMPLATE_MAX_LENGTH}`,
    );
  });

  it("fails safely to the default if persisted data is invalid", () => {
    const text = renderReferralShareTemplate({
      template: "invalid persisted value",
      storeName: "暖沐蒸足",
      url: "https://example.com/ref",
    });
    expect(text).toBe(
      DEFAULT_REFERRAL_SHARE_TEMPLATE.replaceAll(
        "{storeName}",
        "暖沐蒸足",
      ).replace("{url}", "https://example.com/ref"),
    );
  });
});
