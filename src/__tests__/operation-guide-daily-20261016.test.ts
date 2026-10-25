import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides, guideCategories } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(g => g.id === id)!;
const text = (id: string) => JSON.stringify(guide(id));
const permissions = [...new Set(operationGuides.flatMap(g => [g.permission, ...(g.additionalPermissions ?? [])]).filter(Boolean))];
const features = Object.fromEntries(operationGuides.filter(g => g.feature).map(g => [g.feature!, true]));
const access: GuideAccess = { module: "course", permissions, features };

describe("2026-10-16 backend guide review", () => {
  it("preserves the backend-only catalog counts after SPA retirement", () => {
    expect(operationGuides).toHaveLength(202);
    expect(guideCategories).toHaveLength(15);
  });

  it("explains music leave without writing frontend instructions", () => {
    expect(text("C145")).toContain("團體班請假記錄缺課並扣 1 堂，不提供補課");
    expect(text("C145")).toContain("不因請假扣堂就取得出席點名權限");
    expect(text("C103")).not.toContain("自由預約未到會釋放占用");
    expect(text("C149")).toContain("不以按下請假當天起算");
    expect(text("C168")).toContain("不能理解為永遠可取消");
    expect(text("C167")).toContain("改期是同交易移轉預約");
    expect(findOperationGuides("音樂 團班請假仍扣堂", access).map(g => g.id)).toContain("C145");
  });

  it("keeps saved-write and roster verification states distinct", () => {
    for (const id of ["C146", "C162"]) {
      expect(text(id)).toContain("出勤已儲存，名單尚未核對完成");
      expect(text(id)).toContain("不是要重新送出教師出勤");
    }
    expect(text("C148")).toContain("永久換時段不再占用舊固定空位");
    expect(text("C148")).toContain("不假設舊時段仍替你保留");
  });

  it("retains HQ history while denying retired business access", () => {
    expect(text("I12")).toContain("module=SPA");
    expect(text("I14")).toContain("已退役的 SPA 不是一般鎖定功能");
    expect(text("I17")).toContain("不會恢復 SPA 入口");
    expect(text("I18")).toContain("不恢復店家功能");
    expect(text("I05")).toContain("返回自己的店舖");
    expect(text("I05")).toContain("返回會重新載入共用外框");
  });
});
