import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SPA service staff workspace", () => {
  const auth = readFileSync("src/lib/auth.ts", "utf8");
  const page = readFileSync("src/app/(service-workspace)/staff-schedule/page.tsx", "utf8");
  const datePicker = readFileSync("src/app/(service-workspace)/staff-schedule/staff-schedule-date-picker.tsx", "utf8");
  const createAction = readFileSync("src/server/actions/staff.ts", "utf8");
  const createUi = readFileSync("src/app/(dashboard)/dashboard/staff/staff-workspace.tsx", "utf8");

  it("removes the retired provider login without removing supported staff login", () => {
    expect(auth).not.toContain('id: "service-staff-phone"');
    expect(auth).toContain('id: "credentials"');
    expect(auth).toContain('id: "customer-phone"');
  });

  it("pins booking reads to the current session staff and store", () => {
    expect(page).toContain("serviceStaffId: user.staffId");
    expect(page).toContain("storeId: user.storeId");
    expect(page).toContain('!["PARTNER", "STAFF"].includes(user.role)');
  });

  it("selects only the customer name and never sends private customer fields", () => {
    expect(page).toContain("customerNames.get(booking.customerId)");
    expect(page).toContain("select: { id: true, name: true }");
    expect(page).not.toContain("select: { id: true, name: true, phone");
    expect(page).not.toContain("customerPlanWallet");
    expect(page).not.toContain("transactions");
  });

  it("requires a Taiwan mobile number in both UI and server validation", () => {
    expect(createUi).toContain('pattern="09[0-9]{8}"');
    expect(createUi).toContain("手機（必填）");
    expect(createAction).toContain("請輸入 09 開頭的 10 碼手機號碼");
  });

  it("lets providers switch months directly and keeps empty days compact", () => {
    expect(page).toContain('aria-label="上個月"');
    expect(page).toContain('aria-label="下個月"');
    expect(page).toContain("shiftMonth(selectedDate, -1)");
    expect(page).toContain("shiftMonth(selectedDate, 1)");
    expect(page).toContain("這一天沒有安排顧客");
    expect(page).not.toContain('py-8 text-center text-sm text-earth-500">這一天沒有安排顧客');
  });

  it("keeps the date picker synchronized and avoids repeating the duration", () => {
    expect(page).toContain("StaffScheduleDatePicker");
    expect(datePicker).toContain("key={selectedDate}");
    expect(datePicker).toContain("router.push");
    expect(datePicker).toContain('aria-label="選擇日期"');
    expect(page).toContain("variant !== durationLabel");
    expect(page).toContain("treatmentSummary(serviceName, variant, minutes)");
  });
});
