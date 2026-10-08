// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OpeningMakeupList } from "@/app/(dashboard)/dashboard/courses/opening-makeups/opening-makeup-list";
import type { OpeningMakeupWorkspace } from "@/server/queries/music-opening-makeup";
const mocks = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/actions/music-opening-makeup", () => ({ updateOpeningMakeup: mocks.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
let root: Root, element: HTMLDivElement;
const data: OpeningMakeupWorkspace = {
  opening: { issued: 2, outstanding: 2, reserved: 0, unreserved: 2, redeemed: 0 }, native: { issued: 1, outstanding: 1, reserved: 0, unreserved: 1, redeemed: 0 }, totalOutstanding: 3, verifiedCustomerCount: 1,
  rows: [{ id: "right", version: 0, customerId: "learner", customerName: "Synthetic learner", label: "原第 9 期第 3 堂", sourceDate: "2026-09-01", expiry: "2026-12-31", type: "STUDENT_LEAVE", state: "AVAILABLE", booking: null, sessions: [{ id: "session", label: "Synthetic lesson", date: "2026-10-15T02:00:00Z" }] }],
};
const button = (text: string) => Array.from(element.querySelectorAll("button")).find(b => b.textContent === text)!;
const click = async (text: string) => { await act(async () => button(text).click()); };
const render = async (value = data, canCreate = true, canUpdate = true) => { await act(async () => root.render(createElement(OpeningMakeupList, { data: value, canCreate, canUpdate }))); };
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); mocks.update.mockReset(); mocks.refresh.mockReset(); element = document.createElement("div"); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(async () => root.unmount()); element.remove(); });
describe("opening entitlement staff UI", () => {
  it("shows 2 opening + 1 native = 3 without a paid balance control", async () => { await render(); expect(element.textContent).toContain("已核對學員待補 3 堂"); expect(element.textContent).toContain("期初 2 堂"); expect(element.textContent).toContain("切點後請假 1 堂"); expect(element.textContent).toContain("教師鐘點仍待核對"); expect(element.querySelector('input[type="number"]')).toBeNull(); });
  it("respects separate read-only permissions", async () => { await render(data, false, false); expect(button("安排補課")).toBeUndefined(); });
  it("cancel/reopen clears form and does not write", async () => { await render(); await click("安排補課"); expect(element.querySelector("select")).not.toBeNull(); await click("取消"); expect(element.querySelector("select")).toBeNull(); await click("安排補課"); expect((element.querySelector("select") as HTMLSelectElement).value).toBe(""); expect(mocks.update).not.toHaveBeenCalled(); });
  it("requires explicit actual attendance beyond check-in", async () => { await render({ ...data, rows: [{ ...data.rows[0], state: "RESERVED", version: 1, booking: { id: "booking", status: "RESERVED", checkedIn: true, date: "2026-10-07T02:00:00Z", sessionName: "Synthetic lesson" } }] }); await click("確認出席"); expect(button("確認儲存").disabled).toBe(true); expect(element.textContent).toContain("簽到不等於出席"); await act(async () => (element.querySelector('input[type="checkbox"]') as HTMLInputElement).click()); expect(button("確認儲存").disabled).toBe(false); });
  it("keeps a failed action reviewable and does not refresh", async () => { mocks.update.mockResolvedValue({ success: false, error: "資料已更新，請重新整理" }); await render(); await click("安排補課"); await act(async () => { const select = element.querySelector("select")!; select.value = "session"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await click("確認儲存"); expect(element.querySelector('[role="alert"]')?.textContent).toContain("資料已更新"); expect(mocks.refresh).not.toHaveBeenCalled(); expect(element.querySelector("select")).not.toBeNull(); });
  it("successful save closes the editor and refreshes authoritative counts", async () => { mocks.update.mockResolvedValue({ success: true, data: { version: 1 } }); await render(); await click("安排補課"); await act(async () => { const select = element.querySelector("select")!; select.value = "session"; select.dispatchEvent(new Event("change", { bubbles: true })); }); await click("確認儲存"); expect(mocks.update).toHaveBeenCalledOnce(); expect(mocks.update.mock.calls[0][0]).toMatchObject({ action: "RESERVE", entitlementId: "right", expectedVersion: 0, sessionId: "session", actualAttendance: false, bookingId: null }); expect(element.querySelector("select")).toBeNull(); expect(mocks.refresh).toHaveBeenCalledOnce(); });
});
