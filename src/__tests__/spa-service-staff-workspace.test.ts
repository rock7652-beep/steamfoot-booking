import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SPA service staff workspace", () => {
  const auth = readFileSync("src/lib/auth.ts", "utf8");
  const page = readFileSync("src/app/(service-workspace)/staff-schedule/page.tsx", "utf8");
  const proxy = readFileSync("src/proxy.ts", "utf8");
  const createAction = readFileSync("src/server/actions/staff.ts", "utf8");
  const createUi = readFileSync("src/app/(dashboard)/dashboard/staff/staff-workspace.tsx", "utf8");

  it("uses a separate phone login restricted to active Demo providers", () => {
    expect(auth).toContain('id: "service-staff-phone"');
    expect(auth).toContain('role: "PARTNER"');
    expect(auth).toContain('store: { slug: storeSlug, id: "demo-store" }');
    expect(proxy).toContain('subPath === "/staff/login"');
    expect(proxy).toContain('subPath === "/staff/my-bookings"');
  });

  it("pins booking reads to the current session staff and store", () => {
    expect(page).toContain("serviceStaffId: user.staffId");
    expect(page).toContain("storeId: user.storeId");
    expect(page).toContain('user.role !== "PARTNER"');
  });

  it("selects only the customer name and never sends private customer fields", () => {
    expect(page).toContain('customer: { select: { name: true } }');
    expect(page).not.toMatch(/customer:\s*\{\s*select:\s*\{[^}]*phone/s);
    expect(page).not.toContain("customerPlanWallet");
    expect(page).not.toContain("transactions");
  });

  it("requires a Taiwan mobile number in both UI and server validation", () => {
    expect(createUi).toContain('pattern="09[0-9]{8}"');
    expect(createUi).toContain("手機（必填）");
    expect(createAction).toContain("請輸入 09 開頭的 10 碼手機號碼");
  });
});
