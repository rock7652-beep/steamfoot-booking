// @vitest-environment jsdom
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ save: vi.fn(), windowSave: vi.fn(), trialSave: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh, push: vi.fn() }), usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/server/actions/course-settings", () => ({ saveCourseSettingsSection: m.save }));
vi.mock("@/components/app-link", () => ({ AppLink: ({ children, ...props }: ComponentProps<"a">) => createElement("a", props, children) }));
vi.mock("@/components/desktop", () => ({ InfoList: ({ items }: { items: { label: string; value: ReactNode }[] }) => createElement("dl", null, items.map(item => createElement("div", { key: item.label }, item.label, item.value))) }));
vi.mock("@/server/actions/shop", () => ({ updateTrialSettings: vi.fn(), updateDutyScheduling: vi.fn(), updateBookableUntilDate: vi.fn(), updateCustomerBookingWindow: vi.fn() }));
vi.mock("@/server/actions/course-booking-window", () => ({ saveCourseBookingWindow: m.windowSave }));
vi.mock("@/server/actions/course-trial", () => ({ saveCourseTrialSettings: m.trialSave }));
import { CourseSettingsWorkspace } from "@/app/(dashboard)/dashboard/courses/settings-workspace";
let root: Root, host: HTMLDivElement;
const defaults: ComponentProps<typeof CourseSettingsWorkspace> = { storeId: "a", name: "A 店", planLabel: "專業版", address: "地址", mapUrl: "", lineOfficialUrl: "https://line.me/a", bankName: "銀行", bankCode: "123", bankAccountNumber: "0001234567", bookingLeadMinutes: 10, cancellationLeadMinutes: 30, canEdit: true, canPayment: true, canStaff: true, canPlans: true, canHours: true, canDutyManage: true, canTrial: true, canReminders: true, canCare: true, subscriptionSummary: "使用中 · 到期日 2026-12-31" };
async function render(props = defaults) { await act(async () => root.render(createElement(CourseSettingsWorkspace, props))); }
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find(node => node.textContent === text && !node.closest("[hidden]"));
  expect(button, text).toBeTruthy(); await act(async () => button!.click());
}
async function select(section: string) { await click(section); await render(); }
async function input(name: string, value: string) {
  const field = host.querySelector(`input[name="${name}"]`)!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit() { await act(async () => [...host.querySelectorAll("form")].find(form => !form.closest("[hidden]"))!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); window.scrollTo = vi.fn();
  window.history.replaceState(null, "", "/s/a/admin/dashboard/courses?view=settings&month=2026-09");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); m.save.mockResolvedValue({ success: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("five-section course settings", () => {
  it("shows one section at a time and retains store prefix and query parameters", async () => {
    await render(); expect(host.querySelectorAll("nav button")).toHaveLength(5); expect(host.querySelectorAll("section[hidden]")).toHaveLength(4);
    await select("營業與預約"); expect(window.location.pathname).toBe("/s/a/admin/dashboard/courses"); expect(window.location.search).toContain("month=2026-09"); expect(window.location.search).toContain("section=booking");
    expect(host.querySelector('a[href="/s/a/admin/dashboard/courses?view=settings&section=booking&panel=hours&panelQuery=tab%3Dweekly"]')).not.toBeNull();
    expect(host.querySelector('section[aria-label="營業與預約"]')?.hasAttribute("hidden")).toBe(false);
    expect(host.textContent).toContain("固定期課：未到仍扣堂，不提供補課券");
  });
  it("retains unsaved fields across category changes and failed saves", async () => {
    await render(); await input("name", "尚未儲存店名"); await select("收款與體驗");
    await select("店家資料未儲存"); expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("尚未儲存店名");
    m.save.mockResolvedValueOnce({ success: false, error: "暫時失敗" }); await submit();
    expect(host.textContent).toContain("暫時失敗"); expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("尚未儲存店名"); expect(m.refresh).not.toHaveBeenCalled();
    await submit(); expect(m.refresh).toHaveBeenCalledOnce(); expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("尚未儲存店名"); expect(host.textContent).toContain("已儲存");
  });
  it("requires an explicit discard and does not discard another section", async () => {
    await render(); await input("name", "店名草稿"); await select("收款與體驗"); await input("bankCode", "999"); await click("取消");
    expect(host.textContent).toContain("要捨棄本區修改嗎"); await click("繼續編輯"); expect((host.querySelector('input[name="bankCode"]') as HTMLInputElement).value).toBe("999"); await click("取消"); await click("捨棄本區修改"); expect((host.querySelector('input[name="bankCode"]') as HTMLInputElement).value).toBe("123");
    await select("店家資料未儲存"); expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("店名草稿");
  });
  it("sends only bank fields and blocks repeated submissions while saving", async () => {
    let finish!: (result: unknown) => void; m.save.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    await render(); await select("收款與體驗"); await input("bankName", "新銀行"); await submit(); await submit();
    expect(m.save).toHaveBeenCalledExactlyOnceWith({ section: "payment", bankName: "新銀行", bankCode: "123", bankAccountNumber: "0001234567" }); expect(host.querySelector('form[aria-label="編輯銀行資訊"] fieldset')?.hasAttribute("disabled")).toBe(true);
    await act(async () => finish({ success: true })); expect(host.textContent).toContain("已儲存");
  });
  it("guards in-app links with a custom dialog and lets the user keep editing", async () => {
    await render(); await input("name", "草稿"); await select("營業與預約");
    const outside = document.createElement("a"); outside.href = "/dashboard/revenue"; host.append(outside);
    await act(async () => outside.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("尚有未儲存的修改");
    const keep = [...document.querySelectorAll("button")].find(b => b.textContent === "繼續編輯")!; await act(async () => keep.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull(); await select("店家資料未儲存"); expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("草稿");
  });
  it("hides unavailable features and shows real subscription summary without the mock plan center", async () => {
    await render({ ...defaults, canEdit: false, canPayment: false, canReminders: false, canCare: false, canTrial: false });
    expect(host.querySelector('button')?.textContent).toBe("店家資料"); expect(host.textContent).not.toContain("編輯店家資料"); expect(host.textContent).not.toContain("編輯銀行資訊");
    expect(host.querySelector('a[href$="panel=butler"]')).toBeNull(); expect(host.querySelector('a[href$="panel=referral"]')).toBeNull(); expect(host.querySelector('a[href$="/settings/plans"]')).toBeNull();
    expect(host.textContent).toContain("使用中 · 到期日 2026-12-31");
  });
  it("uses the mobile category selector and falls back safely for an unknown category", async () => {
    window.history.replaceState(null, "", "/s/a/admin/dashboard/courses?view=settings&section=unknown"); await render();
    const selector = host.querySelector("select")!; expect(selector.value).toBe("store");
    await act(async () => { selector.value = "subscription"; selector.dispatchEvent(new Event("change", { bubbles: true })); }); await render();
    expect(selector.value).toBe("subscription"); expect(host.querySelector('section[aria-label="系統方案與用量"]')?.hasAttribute("hidden")).toBe(false);
  });
  it("preserves input when the connection throws and guards a browser reload", async () => {
    m.save.mockRejectedValueOnce(new Error("network")); await render(); await input("name", "斷線草稿"); await submit();
    expect(host.textContent).toContain("連線失敗，輸入內容已保留"); expect((host.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("斷線草稿");
    const before = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(before); expect(before.defaultPrevented).toBe(true);
    await click("取消"); await click("捨棄本區修改"); const after = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
  });
  it("shows enabled notification features at scoped destinations", async () => {
    await render({ ...defaults, canDigitalButler: true, canReferralShare: true });
    expect(host.querySelector('a[href="/s/a/admin/dashboard/courses?view=settings&section=notifications&panel=butler"]')).not.toBeNull(); expect(host.querySelector('a[href="/s/a/admin/dashboard/courses?view=settings&section=notifications&panel=referral"]')).not.toBeNull();
  });
  it("shows the basic unassigned-plan reminder even without the customer-care add-on", async () => {
    await render({ ...defaults, canUnassignedPlans: true, canCare: false, canReminders: false });
    expect(host.querySelector('a[href="/s/a/admin/dashboard/courses?view=settings&section=notifications&panel=unassigned"]')).not.toBeNull(); expect(host.textContent).toContain("本階段不自動傳送 LINE");
  });
});

it("edits the booking window directly and guards its draft when leaving", async () => {
 await render({...defaults, today:"2026-09-21", bookingWindowDays:14}); await click("營業與預約"); await render({...defaults, today:"2026-09-21", bookingWindowDays:14});
 const days=host.querySelector('select[aria-label="自動開放天數"]')!;
 await act(async()=>{(days as HTMLSelectElement).value="30";days.dispatchEvent(new Event("change",{bubbles:true}));});
 await click("店家資料"); await render({...defaults, today:"2026-09-21", bookingWindowDays:14}); const before=new Event("beforeunload",{cancelable:true}); window.dispatchEvent(before); expect(before.defaultPrevented).toBe(true);
 await click("營業與預約"); await render({...defaults, today:"2026-09-21", bookingWindowDays:14}); expect((days as HTMLSelectElement).value).toBe("30"); m.windowSave.mockResolvedValueOnce({success:true}); await click("儲存設定"); expect(m.windowSave).toHaveBeenCalledExactlyOnceWith({mode:"rolling",days:30});
});
it("edits trial price directly, keeps failed drafts and restores without losing bank edits", async()=>{
 const props={...defaults,trialSettings:{trialEnabled:true,trialDefaultPrice:350,trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:1000}};
 await render(props); await select("收款與體驗"); await render(props); await input("bankCode","999");
 const price=host.querySelector('form[aria-label="體驗設定"] input[type="number"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(price,"400");price.dispatchEvent(new Event("input",{bubbles:true}));});
 m.trialSave.mockRejectedValueOnce(new Error("network")); await act(async()=>host.querySelector('form[aria-label="體驗設定"]')!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect((price as HTMLInputElement).value).toBe("400"); expect(m.trialSave).toHaveBeenCalledOnce(); await click("還原修改"); expect((price as HTMLInputElement).value).toBe("350"); expect((host.querySelector('input[name="bankCode"]') as HTMLInputElement).value).toBe("999");
});
