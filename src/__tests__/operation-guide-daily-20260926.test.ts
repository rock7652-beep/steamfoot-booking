import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import { findCoursePortalGuides } from "../lib/course-portal-guides";
import type { GuideAccess } from "../lib/operation-guide-types";

const access: GuideAccess = { module: "course", permissions: ["report.read", "staff.manage", "wallet.read", "wallet.create", "transaction.create", "customer.read", "transaction.refund", "transaction.read"], features: { service_fee_calculator: true, line_reminder: true } };
const guide = (id: string) => operationGuides.find(g => g.id === id)!;
const content = (id: string) => JSON.stringify(guide(id));

describe("September 26 guide review", () => {
  it("separates course notification from steamfoot rent and monthly permissions", () => {
    expect(availableGuides(access).some(g => g.id === "C142")).toBe(true);
    expect(availableGuides({...access, features: {}}).some(g => g.id === "C142")).toBe(false);
    expect(availableGuides(access).some(g => ["E13", "E14"].includes(g.id))).toBe(false);
    const steam = {...access, module: "steamfoot" as const};
    expect(availableGuides(steam).map(g => g.id)).toEqual(expect.arrayContaining(["E13", "E14"]));
    expect(availableGuides({...steam, permissions: ["report.read"]}).some(g => g.id === "E14")).toBe(false);
    expect(availableGuides({...steam, features: {}}).some(g => g.id === "E13")).toBe(false);
    expect(availableGuides({...steam, features: {}}).some(g => g.id === "E14")).toBe(true);
    expect(availableGuides({...access, module: "spa"}).some(g => ["C142", "E13", "E14"].includes(g.id))).toBe(false);
  });
  it("finds the new actions without presenting reminders as payments", () => {
    for (const [query, id] of [["通知人員 可重試", "C142"], ["購買方案 現金抽屜", "C112"], ["退款試算", "C105"], ["已預約", "C134"]]) {
      expect(findOperationGuides(query, access).some(g => g.id === id)).toBe(true);
    }
    expect(content("C142")).toContain("23 小時");
    expect(content("C142")).toContain("預覽模式，不會發送");
    expect(content("C142")).toContain("不代表款項已入帳");
    expect(content("E13")).toContain("不是每月新增一筆");
    expect(content("E14")).toContain("下一個完整租期");
  });
  it("documents the removed monthly payment controls and permission-limited reservations", () => {
    expect(content("C140")).toContain("歷史付款紀錄");
    expect(content("C134")).toContain("20");
    expect(content("C134")).toContain("權限");
    for (const id of ["C142", "E13", "E14", "C134", "C138", "C139", "C140"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const path of guide(id).sources) expect(existsSync(path), path).toBe(true);
    }
  });
  it("keeps personal income instructions scoped to the current frontend role", () => {
    expect(findCoursePortalGuides("coach", true, "我的收入").map(g => g.id)).toEqual(["CP17"]);
    expect(findCoursePortalGuides("member", true, "我的收入").map(g => g.id)).toEqual(["CP18"]);
    expect(findCoursePortalGuides("member", false, "一般會員不適用").map(g => g.id)).toEqual(["CP18"]);
  });
});
