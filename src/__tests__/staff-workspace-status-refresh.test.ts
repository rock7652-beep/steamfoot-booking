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
  it("keeps the account list and editing free of SPA scheduling controls", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(StaffWorkspace, {
      accountListOnly: true, people: [{ ...person, status: "ACTIVE" }],
      today: "2026-10-05", canManage: true, showSpaCompensation: false,
      createAction: vi.fn(),
    })));
    expect(host.querySelector('section[aria-label="人員清單"] table')).not.toBeNull();
    expect(host.querySelector('section[aria-label="人員總覽"]')).toBeNull();
    expect(host.textContent).not.toContain("近期例外");
    const more = host.querySelector('button[aria-label="QA 門市操作"]') as HTMLButtonElement;
    expect(more.textContent).toBe("⋯");
    expect(more.className).not.toContain("border");
    await act(async () => more.click());
    const edit = Array.from(document.body.querySelectorAll("button")).find(b => b.textContent === "編輯");
    await act(async () => edit!.click());
    expect(document.body.textContent).toContain("編輯人員");
    expect(document.body.querySelector('input[name="displayName"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("可服務項目");
    expect(document.body.textContent).not.toContain("固定班表");
    await act(async () => root.unmount());
  });

  it("refreshes account-list status from server props without remounting", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (status: string) => root.render(createElement(StaffWorkspace, {
      accountListOnly: true, people: [{ ...person, status }],
      today: "2026-10-05", canManage: true, showSpaCompensation: false,
      createAction: vi.fn(),
    }));
    await act(async () => render("ACTIVE"));
    expect(host.querySelector("tbody")?.textContent).toContain("啟用");
    await act(async () => render("INACTIVE"));
    expect(host.querySelector("tbody tr td:nth-child(5)")?.textContent).toBe("停用");
    await act(async () => root.unmount());
  });

});

it("keeps role and permission edits in the same panel and submits once", async () => {
  const { StaffAccountEditor } = await import("@/app/(dashboard)/dashboard/staff/staff-account-editor");
  const { updateStaff } = await import("@/server/actions/staff");
  vi.mocked(updateStaff).mockResolvedValue({ success: false, error: "權限已變更" });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(createElement(StaffAccountEditor, { person: { ...person, role: "STAFF", permissions: ["inventory.read"] }, policy: {
    canAssignRoles: true, editablePermissions: ["inventory.read", "inventory.cost.read"],
    rolePresets: { MANAGER: ["inventory.read", "inventory.cost.read"] },
    permissionGroups: [{ label: "進銷存", codes: [{code:"inventory.read",label:"查看庫存"},{code:"inventory.cost.read",label:"查看成本"}] }],
  }, onClose: vi.fn() })));
  const tab = Array.from(document.body.querySelectorAll("button")).find(b=>b.textContent==="後台帳號／權限")!;
  await act(async()=>tab.click());
  expect(document.body.querySelector('a[href*="/edit"]')).toBeNull();
  const role = document.body.querySelector('select[name="backendRole"]') as HTMLSelectElement;
  await act(async()=>{role.value="MANAGER";role.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(document.body.textContent).toContain("未儲存");
  // Role changes preserve grants until the explicit preset control is clicked.
  expect((document.body.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).checked).toBe(false);
  await act(async()=>Array.from(document.body.querySelectorAll("button")).find(b=>b.textContent==="套用角色預設權限")!.click());
  expect((document.body.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).checked).toBe(true);
  await act(async()=>Array.from(document.body.querySelectorAll("button")).find(b=>b.textContent==="基本資料")!.click());
  await act(async()=>tab.click()); expect(role.value).toBe("MANAGER");
  await act(async()=>document.body.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(updateStaff).toHaveBeenCalledWith("qa",expect.objectContaining({role:"MANAGER",permissions:{"inventory.read":true,"inventory.cost.read":true}}));
  expect(document.body.querySelector('[role="alert"]')?.textContent).toBe("權限已變更");
  expect(role.value).toBe("MANAGER");
  await act(async()=>root.unmount());vi.restoreAllMocks();
});
