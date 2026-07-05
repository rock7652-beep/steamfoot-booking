import { describe, expect, it } from "vitest";
import { FEATURES } from "@/lib/feature-flags";
import {
  getStoreFeatureLabel,
  MANAGEABLE_STORE_FEATURES,
} from "@/lib/store-feature-catalog";

describe("store feature catalog", () => {
  it("shows service_fee_calculator as 月結管理 without changing the feature key", () => {
    const feature = MANAGEABLE_STORE_FEATURES.find(
      (item) => item.key === FEATURES.SERVICE_FEE_CALCULATOR,
    );

    expect(feature).toMatchObject({
      key: "service_fee_calculator",
      label: "月結管理",
      module: "結算",
      description:
        "適合有合作店長或分潤夥伴的店家，用於確認每月服務金額、固定月費、加扣項與月結紀錄。",
    });
    expect(getStoreFeatureLabel(FEATURES.SERVICE_FEE_CALCULATOR)).toBe("月結管理");
  });
});
