import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("course UI final fixes", () => {
  it("keeps customer actions compact and removes LINE name from course search prompts", () => {
    const table = read("src/app/(dashboard)/dashboard/customers/_components/customers-table.tsx");
    const toolbar = read("src/app/(dashboard)/dashboard/customers/_components/customers-toolbar.tsx");
    const picker = read("src/components/admin/course-customer-picker.tsx");

    expect(table).toContain('"h-8 min-w-14 whitespace-nowrap text-xs"');
    expect(toolbar).toContain('placeholder="搜尋姓名／電話"');
    expect(picker).toContain('placeholder="搜尋姓名／電話"');
  });

  it("separates plan products from held plans and keeps assignment with held plans", () => {
    const workspace = read("src/app/(dashboard)/dashboard/courses/member-workspace.tsx");
    expect(workspace).toContain("方案商品");
    expect(workspace).toContain("顧客持有方案");
    expect(workspace).toContain('planArea === "cards"');
    expect(workspace).toContain("單位價格");
  });

  it("shows textual session states in addition to color", () => {
    const workspace = read("src/app/(dashboard)/dashboard/courses/workspace.tsx");
    for (const label of ["未開始", "進行中", "待點名", "已完成", "未到", "已結束"]) {
      expect(workspace).toContain(label);
    }
    expect(workspace).toContain('["待點名", "bg-violet-50 text-violet-800"]');
  });

  it("clarifies closed-day conflicts and trial payment counts", () => {
    const workspace = read("src/app/(dashboard)/dashboard/courses/workspace.tsx");
    const roster = read("src/app/(dashboard)/dashboard/courses/roster.tsx");

    expect(workspace).toContain("堂既有課程；可查看與處理，但不可新增排課。");
    expect(roster).toContain("未收款 {unpaidTrialCount} 人");
  });

  it("keeps customer creation in flow and checks schedule conflicts on submit", () => {
    const workspace = read("src/app/(dashboard)/dashboard/courses/workspace.tsx");
    const roster = read("src/app/(dashboard)/dashboard/courses/roster.tsx");

    expect(roster).toContain("＋ 直接建立新顧客");
    expect(workspace).not.toContain("預覽日期與衝突");
    expect(workspace).toContain("按下確認後會自動檢查教練、教室、營業時間與撞期");
  });

  it("disables member booking until a learner and eligible plan are selected", () => {
    const workspace = read("src/app/(dashboard)/dashboard/courses/workspace.tsx");
    const roster = read("src/app/(dashboard)/dashboard/courses/roster.tsx");

    expect(workspace).toContain("onMemberBookingReadyChange={setMemberBookingReady}");
    expect(workspace).toContain('courseDialog.kind === "member-booking" &&');
    expect(workspace).toContain("!memberBookingReady");
    expect(roster).toContain("沒有可用方案，請先指派方案。");
    expect(roster).not.toContain("改用體驗預約");
  });
});
