import { describe, expect, it } from "vitest";
import { FEATURES } from "@/lib/feature-flags";
import {
  getStoreFeatureLabel,
  getStoreFeatureCategory,
  MANAGEABLE_STORE_FEATURES,
  STORE_FEATURE_CATEGORIES,
} from "@/lib/store-feature-catalog";

describe("store feature catalog", () => {
  it("shows service_fee_calculator as 月結管理 without changing the feature key", () => {
    const feature = MANAGEABLE_STORE_FEATURES.find(
      (item) => item.key === FEATURES.SERVICE_FEE_CALCULATOR,
    );

    expect(feature).toMatchObject({
      key: "service_fee_calculator",
      label: "月結管理",
      module: "營運",
      description: "每月服務金額、固定月費、加扣項與月結紀錄。",
    });
    expect(getStoreFeatureLabel(FEATURES.SERVICE_FEE_CALCULATOR)).toBe("月結管理");
  });

  it("groups and orders the HQ feature catalog without changing feature keys", () => {
    const grouped = Object.fromEntries(
      STORE_FEATURE_CATEGORIES.map((category) => [
        category,
        MANAGEABLE_STORE_FEATURES.filter(
          (feature) => getStoreFeatureCategory(feature) === category,
        ).map((feature) => feature.key),
      ]),
    );

    expect(grouped).toEqual({
      顧客經營: ["customer_care", "line_reminder", "member_portal"],
      營運: ["cash_drawer", "service_fee_calculator", "data_export"],
      分析: ["basic_reports", "advanced_reports"],
      健康: ["ai_health_summary"],
      展店: ["multi_store"],
    });
  });

  it("keeps analysis display names and technical identifiers aligned", () => {
    expect(FEATURES.BASIC_REPORTS).toBe("basic_reports");
    expect(FEATURES.ADVANCED_REPORTS).toBe("advanced_reports");
    expect(getStoreFeatureLabel(FEATURES.BASIC_REPORTS)).toBe("營運分析");
    expect(getStoreFeatureLabel(FEATURES.ADVANCED_REPORTS)).toBe("經營診斷");
  });

  it("shows ai_health_summary as 健康評估／摘要 without changing the feature key", () => {
    const feature = MANAGEABLE_STORE_FEATURES.find(
      (item) => item.key === FEATURES.AI_HEALTH_SUMMARY,
    );

    expect(feature).toMatchObject({
      key: "ai_health_summary",
      label: "健康評估／摘要",
      module: "健康",
      description: "顧客健康評估入口與店長後台健康摘要。",
    });
    expect(getStoreFeatureLabel(FEATURES.AI_HEALTH_SUMMARY)).toBe("健康評估／摘要");
  });
});
