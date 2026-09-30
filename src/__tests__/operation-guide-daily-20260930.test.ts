import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(item => item.id === id)!;
const course: GuideAccess = {
  module: "course",
  permissions: [
    "booking.read", "booking.create", "booking.update", "customer.read", "plans.edit",
    "wallet.create", "transaction.create", "staff.view", "staff.manage",
    "teacher.compensation.manage",
  ],
  features: {},
};
const steam: GuideAccess = {
  module: "steamfoot",
  permissions: ["business_hours.manage", "booking.read"],
  features: {},
};

describe("September 30 guide review", () => {
  it("adds selected-date hours, operation history and the new music workflows", () => {
    expect(operationGuides).toHaveLength(167);
    expect(findOperationGuides("跨月 複選 覆蓋 復原", steam).map(item => item.id)).toContain("B11");
    expect(findOperationGuides("誰修改 最後操作", steam).map(item => item.id)).toContain("I11");
    expect(findOperationGuides("課程 科目 收費方案 分開", course).map(item => item.id)).toContain("C153");
    expect(findOperationGuides("買三送一 5加4加4", course).map(item => item.id)).toContain("C154");
    expect(findOperationGuides("拖曳 上移 下移", course).map(item => item.id)).toContain("C155");
    expect(findOperationGuides("店長兼老師 連結同一人", course).map(item => item.id)).toContain("C156");
    expect(findOperationGuides("老師預設 科目 方案例外", course).map(item => item.id)).toContain("C157");
  });

  it("keeps articles in their real modules and behind write permissions", () => {
    expect(availableGuides({ ...steam, module: "course" }).some(item => item.id === "B11")).toBe(false);
    expect(availableGuides({ ...course, module: "steamfoot" }).some(item => item.id.startsWith("C15"))).toBe(false);
    expect(availableGuides({ ...course, permissions: ["plans.edit"] }).some(item => item.id === "C153")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["wallet.create", "transaction.create"] }).some(item => item.id === "C154")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["staff.manage"] }).some(item => item.id === "C156")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["teacher.compensation.manage"] }).some(item => item.id === "C157")).toBe(false);
    expect(availableGuides({ module: "spa", permissions: [], features: {} }).map(item => item.id)).toEqual(expect.arrayContaining(["G04", "I11"]));
  });

  it("updates old guidance and traces all affected articles to real source files", () => {
    expect(JSON.stringify(guide("G04"))).toContain("一小時內有效");
    expect(JSON.stringify(guide("C114"))).toContain("身分分離");
    expect(JSON.stringify(guide("C122"))).toContain("音樂授課費可分次");
    expect(JSON.stringify(guide("C124"))).toContain("明確確認加入");
    expect(JSON.stringify(guide("C136"))).toContain("同一人");
    expect(JSON.stringify(guide("C143"))).toContain("1～1000");
    expect(JSON.stringify(guide("C147"))).toContain("拒絕儲存");
    expect(JSON.stringify(guide("C149"))).toContain("5＋4＋4");
    for (const id of ["B11", "G04", "I11", "C114", "C122", "C124", "C136", "C143", "C147", "C149", "C153", "C154", "C155", "C156", "C157"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const source of guide(id).sources) expect(existsSync(source), `${id}: ${source}`).toBe(true);
    }
  });
});
