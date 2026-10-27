import { describe, expect, it } from "vitest";

import state from "../../docs/operation-guide-audit-state-20261025.json";
import { findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const allCourse: GuideAccess = {
  module: "course",
  permissions: [
    ...new Set(
      operationGuides
        .flatMap((guide) => [guide.permission, ...(guide.additionalPermissions ?? [])])
        .filter(Boolean),
    ),
  ] as GuideAccess["permissions"],
  features: Object.fromEntries(
    operationGuides
      .filter((guide) => guide.feature)
      .map((guide) => [guide.feature!, true]),
  ),
};

describe("2026-10-21 backend guide audit", () => {
  it("records the exact main baseline and backend-only counts", () => {
    expect(state.previousSuccessfulAuditCommit).toBe(
      "7cb8c26127f60337c159b05391bc90f3263246ad",
    );
    expect(state.lastInventoriedMainCommit).toBe(
      "4efcd72bf513953521665f2556f719d1f73b5e8c",
    );
    expect(state.newGuideIds).toEqual(["C177"]);
    expect(state.updatedGuideIds).toHaveLength(9);
    expect(state.totalInteractionPendingCount).toBe(93);
    expect(operationGuides).toHaveLength(208);
  });

  it("finds the two new backend articles", () => {
    expect(
      findOperationGuides("圖片公告 排程 JPG PNG", allCourse).map(
        (guide) => guide.id,
      ),
    ).toContain("IMG01");
    expect(
      findOperationGuides("期間消耗 所屬店長 前N名 CSV", allCourse).map(
        (guide) => guide.id,
      ),
    ).toContain("CG01");
  });

  it("separates sports rights, setup order and compensation overrides", () => {
    const guide = (id: string) => operationGuides.find((item) => item.id === id)!;
    expect(guide("C123").details.join(" ")).toContain(
      "教練基本資料、教學項目與授課資格、收費方式",
    );
    expect(guide("C172").details.join(" ")).toContain(
      "開放選課通用卡只適用開放選課",
    );
    expect(guide("C173").keywords).toContain("單堂名稱");
    expect(guide("C114").details.join(" ")).toContain("同名教練");
    expect(guide("C176").steps.join(" ")).toContain("0 是明確覆寫");
  });

  it("documents only the three current device preview sizes", () => {
    const preview = operationGuides.find((item) => item.id === "I08")!;
    expect(preview.success).toContain("三種裝置尺寸");
    expect(preview.summary).not.toContain("平板直向");
  });
});
