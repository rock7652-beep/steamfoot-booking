// @vitest-environment jsdom
import { act, createElement as el, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), fetch:vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => m, usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/server/actions/course-settings", () => ({ saveCourseSelfBookingSettings: m.save }));
vi.mock("@/components/feature-presentation", () => ({ FeatureEntry: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabelsSettings: () => null }));
vi.mock("@/components/desktop", () => ({ InfoList: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/settings-section-editor", () => ({ CourseSettingsSectionEditor: () => null }));
vi.mock("@/app/(dashboard)/dashboard/courses/settings-panel", () => ({ CourseSettingsPanel: () => null }));
vi.mock("@/app/(dashboard)/dashboard/settings/hours/bookable-until-form", () => ({ BookableUntilForm: () => null }));
vi.mock("@/app/(dashboard)/dashboard/settings/duty/duty-toggle", () => ({ DutySchedulingToggle: () => null }));
vi.mock("@/app/(dashboard)/dashboard/settings/trial/trial-form", () => ({ TrialSettingsForm: () => null }));
vi.mock("@/server/actions/course-trial", () => ({ saveCourseTrialSettings: vi.fn() }));
vi.mock("@/app/(dashboard)/dashboard/courses/course-waitlist-settings", () => ({ CourseWaitlistSettings: () => null }));
import { CourseSettingsWorkspace } from "@/app/(dashboard)/dashboard/courses/settings-workspace";

let host: HTMLDivElement, root: Root;
const props: ComponentProps<typeof CourseSettingsWorkspace> = {
  storeId: "store-a", name: "測試店", planLabel: "方案", address: "", mapUrl: "", lineOfficialUrl: "",
  bankName: "", bankCode: "", bankAccountNumber: "", bookingLeadMinutes: 60, cancellationLeadMinutes: 120,
  canEdit: true, canPayment: false, canStaff: false, canPlans: false,
};
const row = () => [...host.querySelectorAll("h3")].find(node => node.textContent === "允許學員自行預約")!.closest("section")!;
const button = (label: string, scope: ParentNode = row()) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label && !node.closest("[hidden]"))!;
async function click(label: string, scope?: ParentNode) { const node = button(label, scope); expect(node, label).toBeTruthy(); await act(async () => node.click()); }
async function render(extra: Partial<typeof props> = {}) { await act(async () => root.render(el(CourseSettingsWorkspace, { ...props, ...extra }))); }
async function toggle() { await act(async () => row().querySelector<HTMLInputElement>("input")!.click()); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch",m.fetch.mockImplementation(async (_url:string,init:RequestInit)=>{
    const input=JSON.parse(String(init.body));const result=await m.save({enabled:input.enabled});
    return {json:async()=>result.success?{success:true,storeId:input.expectedStoreId,data:{enabled:result.enabled,revision:result.revision}}:result};
  }));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState(null, "", "/s/a/admin/dashboard/courses?view=settings&section=booking");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  let revision = 0;
  m.save.mockImplementation(async ({ enabled }) => ({ success: true, enabled, revision: ++revision }));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove();vi.unstubAllGlobals(); });

describe("per-store student self-booking settings", () => {
  it("defaults on and uses the existing collapsed row with explicit edit/save/cancel", async () => {
    await render(); expect(row().querySelector("p")!.textContent).toBe("開啟");
    expect(row().querySelector("form")!.closest("[hidden]")).not.toBeNull();
    await click("修改"); expect(button("儲存").disabled).toBe(true);
    await toggle(); expect(row().textContent).toContain("未儲存");
    await click("取消"); expect(m.save).not.toHaveBeenCalled();
    await click("修改"); expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(true);
  });

  it("reports scoped dirty state, preserves the draft across categories and guards leaving", async () => {
    await render(); await click("修改"); await toggle();
    expect(host.querySelector('nav[aria-label="設定分類"]')!.textContent).toContain("營業與預約未儲存");
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    await click("店家資料", host); await render();
    await click("營業與預約未儲存", host); await render(); await click("修改");
    expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    await click("取消");
    const cleanUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(cleanUnload); expect(cleanUnload.defaultPrevented).toBe(false);
  });

  it("submits only the flag once, blocks pending navigation, and keeps confirmed state across stale refreshes", async () => {
    let resolve!: (value: { success: true; enabled: boolean; revision: number }) => void;
    m.save.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    await render(); await click("修改"); await toggle();
    const save = button("儲存");
    await act(async () => { save.click(); save.click(); });
    expect(m.save).toHaveBeenCalledExactlyOnceWith({ enabled: false });
    expect(button("取消").disabled).toBe(true); expect(button("儲存中…").disabled).toBe(true);
    await click("店家資料", host); expect(window.location.search).toContain("section=booking");
    await act(async () => resolve({ success: true, enabled: false, revision: 1 }));
    expect(row().querySelector("p")!.textContent).toBe("關閉"); expect(row().textContent).toContain("已儲存 ✓");
    expect(host.querySelector('nav[aria-label="設定分類"]')!.textContent).not.toContain("未儲存");
    await render({ selfBookingEnabled: true }); expect(row().querySelector("p")!.textContent).toBe("關閉");
    await click("修改"); expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    m.save.mockResolvedValueOnce({ success: true, enabled: true, revision: 2 });
    await toggle(); await click("儲存"); expect(m.save).toHaveBeenLastCalledWith({ enabled: true });
    expect(row().querySelector("p")!.textContent).toBe("開啟"); expect(m.refresh).not.toHaveBeenCalled();
  });

  it.each(["response", "network"])("keeps a failed %s save editable, dirty and recoverable", async mode => {
    if (mode === "response") m.save.mockResolvedValueOnce({ success: false, error: "沒有設定權限" });
    else m.save.mockRejectedValueOnce(new Error("offline"));
    await render(); await click("修改"); await toggle(); await click("儲存");
    expect(row().querySelector('[role="alert"]')).not.toBeNull(); expect(row().textContent).toContain("未儲存");
    const label=mode==="network"?"重試確認儲存結果":"儲存";
    expect(button(label).disabled).toBe(false); expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    if(mode==="network"){expect(button("取消").disabled).toBe(true);expect(row().querySelector<HTMLInputElement>("input")!.disabled).toBe(true);}
    await click(label);
    if(mode==="network")expect(m.fetch.mock.calls[0][1].body).toBe(m.fetch.mock.calls[1][1].body); expect(row().querySelector("p")!.textContent).toBe("關閉");
  });

  it("shows the saved status without edit permission and isolates a different store", async () => {
    await render({ canEdit: false, selfBookingEnabled: false });
    expect(row().querySelector("p")!.textContent).toBe("關閉"); expect(button("修改")).toBeUndefined();
    await render({ storeId: "store-b", selfBookingEnabled: true });
    expect(row().querySelector("p")!.textContent).toBe("開啟");
  });

  it.each([true, false])("reconciles clean same-store external updates when canEdit is %s", async canEdit => {
    await render({ canEdit, selfBookingEnabled: true, selfBookingRevision: 0 });
    await render({ canEdit, selfBookingEnabled: false, selfBookingRevision: 1 });
    expect(row().querySelector("p")!.textContent).toBe("關閉");
    if (canEdit) {
      await click("修改");
      expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
      expect(button("儲存").disabled).toBe(true);
    }
    await render({ canEdit, selfBookingEnabled: true, selfBookingRevision: 2 });
    expect(row().querySelector("p")!.textContent).toBe("開啟");
    expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    await render({ canEdit, selfBookingEnabled: false, selfBookingRevision: 1 });
    expect(row().querySelector("p")!.textContent).toBe("開啟");
  });

  it("retains a dirty draft while advancing the authoritative same-store revision", async () => {
    await render(); await click("修改"); await toggle();
    await render({ selfBookingEnabled: true, selfBookingRevision: 2 });
    expect(row().querySelector("p")!.textContent).toBe("開啟");
    expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    expect(row().textContent).toContain("未儲存");
    await render({ selfBookingEnabled: false, selfBookingRevision: 3 });
    expect(row().querySelector("p")!.textContent).toBe("關閉");
    expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    expect(button("儲存").disabled).toBe(true);
  });

  it("accepts a newer receipt and ignores an older refresh without losing a later draft", async () => {
    m.save.mockResolvedValueOnce({ success: true, enabled: false, revision: 4 });
    await render({ selfBookingRevision: 1 }); await click("修改"); await toggle(); await click("儲存");
    await render({ selfBookingEnabled: true, selfBookingRevision: 3 });
    expect(row().querySelector("p")!.textContent).toBe("關閉");
    await click("修改"); await toggle();
    await render({ selfBookingEnabled: false, selfBookingRevision: 4 });
    expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(true);
    expect(row().textContent).toContain("未儲存");
    await click("取消"); expect(row().querySelector("p")!.textContent).toBe("關閉");
  });

  it("preserves a pending draft and refuses an older save receipt after newer authority arrives", async () => {
    let resolve!: (value: { success: true; enabled: boolean; revision: number }) => void;
    m.save.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    await render({ selfBookingRevision: 1 }); await click("修改"); await toggle(); await click("儲存");
    await render({ selfBookingEnabled: false, selfBookingRevision: 5 });
    await render({ selfBookingEnabled: true, selfBookingRevision: 6 });
    expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    expect(button("取消").disabled).toBe(true);
    await act(async () => resolve({ success: true, enabled: false, revision: 4 }));
    expect(row().querySelector("p")!.textContent).toBe("開啟");
    expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    expect(row().querySelector('[role="alert"]')!.textContent).toContain("設定已由其他人更新");
    expect(row().textContent).not.toContain("已儲存 ✓"); expect(button("儲存").disabled).toBe(false);
    await click("取消"); expect(row().querySelector<HTMLInputElement>("input")!.checked).toBe(true);
  });

});
