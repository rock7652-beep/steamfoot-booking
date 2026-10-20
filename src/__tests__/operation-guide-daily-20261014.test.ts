import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
const access = (module: GuideAccess["module"]): GuideAccess => ({ module, permissions, features });
const guide = (id: string) => operationGuides.find(g => g.id === id)!;

describe("2026-10-14 backend operation guide audit", () => {
  it("adds one guide while preserving backend-only scope and actual access", () => {
    expect(operationGuides).toHaveLength(193);
    expect(guide("I22").modules).toEqual(["steamfoot", "course"]);
    expect(guide("I22").permission).toBe("plans.edit");
    expect(guide("I22").verification).toBe("source-reviewed");
    expect(guide("I22").important).toContain("每月報告額度沒有一起取消");
    expect(findOperationGuides("無上限", access("course")).map(g => g.id)).toContain("I22");
    expect(findOperationGuides("無上限", { ...access("course"), permissions: [] }).map(g => g.id)).not.toContain("I22");
    expect(operationGuides.some(g => g.id.startsWith("CP"))).toBe(false);
  });

  it("distinguishes cancellation, audited deletion and guarded restoration", () => {
    expect(findOperationGuides("刪除同行者", access("steamfoot")).map(g => g.id)).toEqual(expect.arrayContaining(["A15", "A16"]));
    expect(guide("A15").important).toContain("仍有操作稽核");
    expect(guide("A15").important).toContain("預約人本人不能刪除");
    expect(guide("A16").details?.join(" ")).toContain("恢復名額");
    expect(guide("A16").details?.join(" ")).toContain("不自動收款或完成");
  });

  it("updates staff-side identity checks without inventing frontend tutorials", () => {
    for (const id of ["C08", "C117", "W06"]) {
      const text = [...guide(id).steps, ...(guide(id).details ?? [])].join(" ");
      expect(text).toContain("確認碼");
      expect(text).toContain("確認通知連結");
      expect(guide(id).verification).toBe("source-reviewed");
    }
    expect(guide("C142").details?.join(" ")).not.toContain("另受每月提醒額度限制");
    expect(guide("C164").important).not.toContain("額度不足");
    expect(guide("C04").details?.join(" ")).toContain("不必等整組結束");
    expect(guide("I07").important).toContain("進銷存、工單額外加購");
  });
});
