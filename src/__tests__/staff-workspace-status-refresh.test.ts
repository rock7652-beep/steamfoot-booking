// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffWorkspace, type StaffWorkspacePerson } from "@/app/(dashboard)/dashboard/staff/staff-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: "a" }));
vi.mock("@/server/actions/staff", () => ({ updateStaff: vi.fn(), activateStaff: vi.fn(), deactivateStaff: vi.fn(), resetStaffPasswordAction: vi.fn() }));
vi.mock("@/server/actions/spa-operations", () => ({ saveSpaAvailabilityException: vi.fn(), saveSpaStaffCompensation: vi.fn(), saveSpaStaffSetup: vi.fn(), saveSpaStaffSkills: vi.fn(), saveSpaWeeklyAvailability: vi.fn() }));

const person: StaffWorkspacePerson = {
  id: "qa", userId: "qa-user", displayName: "QA 門市", legalName: "QA 門市",
  roleLabel: "門市人員", email: "qa@example.invalid", phone: null,
  colorCode: "#123456", status: "INACTIVE", customerCount: 0,
  specialties: "", specialtyKeys: [], emergencyContact: null,
  weeklyAvailability: [], scheduleExceptions: [], canEdit: true,
  canResetPassword: false, compensationMode: null, compensationValue: null,
};

afterEach(() => { document.body.innerHTML = ""; });

describe("staff workspace authoritative refresh", () => {
  it("updates the open drawer and card after activation and deactivation without remounting", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (status: string) => root.render(createElement(StaffWorkspace, {
      people: [{ ...person, status }], today: "2026-10-05", canManage: true,
      showSpaCompensation: false, createAction: vi.fn(),
    }));
    await act(async () => render("INACTIVE"));
    const open = Array.from(host.querySelectorAll("button")).find(b => b.textContent?.includes("QA 門市"));
    expect(open).toBeDefined();
    await act(async () => open!.click());
    expect(document.body.textContent).toContain("已停用");

    await act(async () => render("ACTIVE"));
    expect(document.body.textContent).toContain("人員基本資料");
    expect(document.body.textContent).toContain("啟用中");
    expect(document.body.textContent).not.toContain("已停用");
    expect(Array.from(document.body.querySelectorAll("button")).some(b => b.textContent === "停用")).toBe(true);
    expect(host.querySelector("article")?.textContent).toContain("啟用");

    await act(async () => render("INACTIVE"));
    expect(document.body.textContent).toContain("人員基本資料");
    expect(document.body.textContent).toContain("已停用");
    expect(Array.from(document.body.querySelectorAll("button")).some(b => b.textContent === "啟用")).toBe(true);
    await act(async () => root.unmount());
  });
});
