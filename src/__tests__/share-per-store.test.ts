import { describe, expect, it } from "vitest";
import {
  buildReferralEntryUrl,
  buildShareText,
  DEFAULT_REFERRAL_SHARE_TEMPLATE,
  resolveReferralShareTemplate,
  validateReferralShareTemplate,
} from "@/lib/share";

describe("per-store referral share", () => {
  it("分享網址固定經過店舖入口並保留 ref", () => {
    expect(buildReferralEntryUrl("taichung", "ABC234")).toBe(
      "/s/taichung/line-entry?ref=ABC234",
    );
  });

  it.each(["暖暖蒸足", "以斯帖蒸足", "暖沐蒸足"])(
    "預設文案使用 Store.name：%s",
    (storeName) => {
      const text = buildShareText({
        storeName,
        url: "/s/store/line-entry?ref=ABC234",
      });
      expect(text).toContain(`我最近去「${storeName}」`);
      expect(text).toContain(`📍${storeName}`);
      expect(text).toContain("ref=ABC234");
    },
  );

  it("有效的每店模板會替換必要變數", () => {
    const text = buildShareText({
      storeName: "暖沐蒸足",
      inviterName: "小美",
      url: "/s/taichung/line-entry?ref=ABC234",
      template: "{inviterName}推薦你到 {storeName}\n{url}",
    });
    expect(text).toBe(
      "小美推薦你到 暖沐蒸足\n/s/taichung/line-entry?ref=ABC234",
    );
  });

  it("null、空白或失效 DB 值都 fallback 到系統預設", () => {
    expect(resolveReferralShareTemplate(null)).toBe(
      DEFAULT_REFERRAL_SHARE_TEMPLATE,
    );
    expect(resolveReferralShareTemplate("   ")).toBe(
      DEFAULT_REFERRAL_SHARE_TEMPLATE,
    );
    expect(resolveReferralShareTemplate("只有店名 {storeName}")).toBe(
      DEFAULT_REFERRAL_SHARE_TEMPLATE,
    );
  });

  it("寫入驗證要求 {storeName} 與 {url}", () => {
    expect(validateReferralShareTemplate("來 {storeName} 看看")).toEqual({
      ok: false,
      error: "推薦分享模板必須包含 {url}",
    });
    expect(validateReferralShareTemplate("點這裡 {url}")).toEqual({
      ok: false,
      error: "推薦分享模板必須包含 {storeName}",
    });
  });

  it("未知變數會被拒絕，空白則代表清除自訂值", () => {
    expect(
      validateReferralShareTemplate("{storeName} {url} {coupon}"),
    ).toEqual({
      ok: false,
      error: "推薦分享模板含有不支援的變數：{coupon}",
    });
    expect(validateReferralShareTemplate(" \n ")).toEqual({
      ok: true,
      template: null,
    });
  });
});
