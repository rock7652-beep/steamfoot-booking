import { describe, expect, it } from "vitest";
import { resolveSportsCoachCompensation } from "@/lib/sports-coach-compensation";
import { calculateSportsTeacherFee } from "@/lib/sports-teacher-fee";

const shared = { rules: [{ mode: "SHARE", value: 60 }], revision: 2 };
const seat = { id: "b", customerName: "合成學員", status: "ATTENDED", bookingKind: "STANDARD", absenceKind: null, originalUnitPrice: 100, sportsCharge: 200 };
describe("教練個別設定優先，否則沿用教學項目", () => {
  it.each([null, { rules: [], revision: 3 }])("未設定或清除後沿用共用費率", individual => {
    expect(resolveSportsCoachCompensation(individual, shared)).toEqual({ rule: { mode: "SHARE", value: 60 }, revision: 2, source: "SPORTS_FEE" });
  });
  it.each(["SHARE", "HOUR", "CLASS"])("個別 %s 包含零元，且不修改共用預設", mode => {
    const before = structuredClone(shared);
    const result = resolveSportsCoachCompensation({ rules: [{ mode, value: 0 }], revision: 4 }, shared);
    expect(result).toEqual({ rule: { mode, value: 0 }, revision: 4, source: "SPORTS_COACH_FEE" });
    expect(shared).toEqual(before);
  });
  it.each([{ mode: "SHARE", value: 101 }, { mode: "HOUR", value: -1 }, { mode: "HOUR", value: 0.001 }, { mode: "unknown", value: 5 }])("非法個別費率不能悄悄回退共用預設", rule => {
    expect(() => resolveSportsCoachCompensation({ rules: [rule], revision: 1 }, shared)).toThrow("待核對");
  });
  it("沒有共用預設仍可使用合法個別設定", () => {
    expect(resolveSportsCoachCompensation({ rules: [{ mode: "HOUR", value: 800 }], revision: 5 }, null)?.rule).toEqual({ mode: "HOUR", value: 800 });
    expect(resolveSportsCoachCompensation(null, null)).toBeNull();
  });
  it("90 分鐘鐘點只計一次，既有每堂固定費也只計一次", () => {
    expect(calculateSportsTeacherFee({ mode: "HOUR", value: 800, durationMinutes: 90 }, [seat, { ...seat, id: "b2" }]).amount).toBe(1200);
    expect(calculateSportsTeacherFee({ mode: "CLASS", value: 500, durationMinutes: 90 }, [seat, { ...seat, id: "b2" }]).amount).toBe(500);
  });
  it("個別拆帳沿用既有購買額度計價，待點名仍不結算", () => {
    expect(calculateSportsTeacherFee({ mode: "SHARE", value: 70 }, [seat]).amount).toBe(140);
    expect(calculateSportsTeacherFee({ mode: "CLASS", value: 500 }, [{ ...seat, status: "RESERVED" }]).amount).toBeNull();
  });
});
