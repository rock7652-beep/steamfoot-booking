// @vitest-environment jsdom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), submit: vi.fn() }));
vi.mock("@/server/actions/beauty", () => ({ readBeautySlots: m.read, submitBeautyTrial: m.submit }));
import { BeautyPublicBookingForm } from "@/components/beauty/public-booking-form";
import type { BeautyBookingCatalog } from "@/components/beauty/booking-form";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const catalog: BeautyBookingCatalog = {
  policy: { revision: 4, selfBooking: true, selfCancel: true, selfReschedule: true, cancelDeduct: false, noShowDeduct: false, cancelLeadMinutes: 120 },
  services: [{ id: "massage", name: "全身按摩", duration: 60, trialDuration: 30, trialPrice: 750, price: 1200, revision: 2 }],
  techs: [{ id: "f", name: "技師甲", gender: "FEMALE", serviceIds: ["massage"] }],
};
const roots: { root: ReturnType<typeof createRoot>; host: HTMLDivElement }[] = [];
function mount(props: Partial<Parameters<typeof BeautyPublicBookingForm>[0]> = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push({ root, host });
  act(() => root.render(h(BeautyPublicBookingForm, { catalog, slug: "soulife", ...props })));
  return host;
}
function button(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`); return found;
}
function field(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll("label")].find(l => l.textContent?.trim() === label);
  if (!found) throw new Error(`Missing field: ${label}`);
  return (found.htmlFor ? document.getElementById(found.htmlFor) : found.querySelector("input,select,textarea")) as HTMLInputElement;
}
function set(el: HTMLInputElement, value: string) {
  act(() => {
    const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function chooseTime(host: HTMLElement) {
  set(field(host, "手機"), "0900000000"); set(field(host, "技師安排"), "ANY");
  await act(async () => button(host, "查詢可用時段").click());
  act(() => button(host, "09:00").click());
  act(() => button(host, "下一步：填寫聯絡資料").click());
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-26T01:00:00Z"));
  m.read.mockResolvedValue({ success: true, data: { slots: ["09:00", "10:00"] } });
  m.submit.mockResolvedValue({ success: true, data: { groupId: "group", ids: ["booking"] } });
});
afterEach(() => { for (const { root, host } of roots.splice(0)) { act(() => root.unmount()); host.remove(); } vi.useRealTimers(); });

it("queries eligible public slots before collecting names or an extra contact", async () => {
  const host = mount(); expect(host.textContent).not.toContain("聯絡人姓名"); expect(host.querySelector('label[for$="-name"]')).toBeNull();
  expect(host.querySelector('select[id$="-service"]')).toBeNull(); expect(host.textContent).not.toContain("第 1 位");
  await chooseTime(host);
  expect(m.read.mock.calls[0]).toEqual(["public", "soulife", { date: "2026-10-26", isTrial: true, people: [{ phone: "0900000000", serviceId: "massage", serviceRevision: 2, preference: "ANY", specifiedTechnicianId: null }] }]);
  expect(host.textContent).toContain("09:00–09:30"); expect(host.textContent).toContain("體驗總額 NT$750");
  expect(host.textContent).not.toContain("原價"); expect(host.textContent).not.toContain("扣次"); expect(host.textContent).toContain("2 小時");
});
it("marks the exact missing fields and focuses the first error instead of giving a generic message", async () => {
  const host = mount(); await act(async () => button(host, "查詢可用時段").click());
  expect(m.read).not.toHaveBeenCalled(); expect(field(host, "手機").getAttribute("aria-invalid")).toBe("true");
  expect(field(host, "技師安排").getAttribute("aria-invalid")).toBe("true"); expect(document.activeElement).toBe(field(host, "手機"));
});
it("preserves time while correcting a name, phone, note or separate contact, and sends the latest data", async () => {
  const host = mount({ entry: "opaque-entry" }); await chooseTime(host);
  set(field(host, "姓名"), "預約人"); set(field(host, "手機"), "+886 911 111 111");
  const details = [...host.querySelectorAll("details")].find(d => d.querySelector("summary")?.textContent?.includes("特殊需求"))!;
  act(() => { details.open = true; }); set(field(host, "本次備註"), "方便時聯絡");
  act(() => field(host, "另設聯絡人").click()); set(field(host, "聯絡人姓名"), "代約人"); set(field(host, "聯絡人手機"), "0922222222");
  expect(host.textContent).toContain("09:00–09:30"); expect(m.read).toHaveBeenCalledOnce();
  await act(async () => button(host, "確認預約").click());
  expect(m.submit.mock.calls[0]).toMatchObject(["soulife", { time: "09:00", contactName: "代約人", phone: "0922222222", people: [{ name: "預約人", phone: "0911111111", notes: "方便時聯絡" }] }, "opaque-entry"]);
});
it("defaults the contact to the first person and keeps the time when returning to edit", async () => {
  const host = mount(); await chooseTime(host); set(field(host, "姓名"), "預約人");
  act(() => button(host, "返回修改服務與時段").click());
  expect(button(host, "09:00").getAttribute("aria-pressed")).toBe("true");
  act(() => button(host, "下一步：填寫聯絡資料").click()); expect(field(host, "姓名").value).toBe("預約人");
  await act(async () => button(host, "確認預約").click());
  expect(m.submit.mock.calls[0][1]).toMatchObject({ contactName: "預約人", phone: "0900000000", time: "09:00" });
});
it("invalidates availability only when scheduling requirements change", async () => {
  const host = mount(); await chooseTime(host); act(() => button(host, "返回修改服務與時段").click());
  set(field(host, "技師安排"), "FEMALE"); expect(host.textContent).not.toContain("09:00");
  expect(button(host, "下一步：填寫聯絡資料").disabled).toBe(true);
  await act(async () => button(host, "查詢可用時段").click()); expect(m.read.mock.calls[1][2].people[0].preference).toBe("FEMALE");
});
it("lets a replacement query finish without waiting for an obsolete read", async () => {
  let finishOld: (v: unknown) => void = () => {}, finishNew: (v: unknown) => void = () => {};
  m.read.mockImplementationOnce(() => new Promise(r => { finishOld = r; })).mockImplementationOnce(() => new Promise(r => { finishNew = r; }));
  const host = mount(); set(field(host, "手機"), "0900000000"); set(field(host, "技師安排"), "ANY");
  await act(async () => button(host, "查詢可用時段").click());
  set(field(host, "日期"), "2026-10-27"); await act(async () => button(host, "查詢可用時段").click());
  await act(async () => finishNew({ success: true, data: { slots: ["10:00"] } }));
  expect(button(host, "10:00").disabled).toBe(false);
  await act(async () => finishOld({ success: true, data: { slots: ["09:00"] } })); expect(host.textContent).not.toContain("09:00");
});
it("keeps names private until confirmation, and does not accept a duplicated trial identity", async () => {
  const host = mount(); act(() => button(host, "＋新增同行者").click());
  const groups = [...host.querySelectorAll('section[aria-label^="服務安排 "]')] as HTMLElement[];
  for (const group of groups) { set(field(group, "手機"), "0900000000"); set(field(group, "技師安排"), "ANY"); }
  await act(async () => button(host, "查詢可用時段").click());
  expect(m.read).not.toHaveBeenCalled(); expect(host.textContent).toContain("同一手機不可重複預約相同體驗服務");
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="移除第 2 位"]')!.click());
  expect(field(host, "手機").value).toBe("0900000000");
});
it("requires an eligible technician and derives gender from an explicit choice", async () => {
  const host = mount(); set(field(host, "手機"), "0900000000"); set(field(host, "技師安排"), "SPECIFIC");
  await act(async () => button(host, "查詢可用時段").click()); expect(m.read).not.toHaveBeenCalled();
  set(field(host, "選擇技師"), "f"); await act(async () => button(host, "查詢可用時段").click());
  expect(m.read.mock.calls[0][2].people[0]).toMatchObject({ preference: "FEMALE", specifiedTechnicianId: "f" });
});
it("retries an unknown submission with the identical payload and blocks duplicate same-tick clicks", async () => {
  const host = mount(); await chooseTime(host); set(field(host, "姓名"), "預約人"); m.submit.mockRejectedValueOnce(new Error("network"));
  await act(async () => { button(host, "確認預約").click(); button(host, "確認預約").click(); });
  expect(m.submit).toHaveBeenCalledOnce(); const first = m.submit.mock.calls[0][1];
  expect(host.querySelector("fieldset")!.disabled).toBe(true); expect(button(host, "返回修改服務與時段").disabled).toBe(true);
  await act(async () => button(host, "重試確認").click()); expect(m.submit.mock.calls[1][1]).toEqual(first);
  expect(host.textContent).toContain("預約成功");
});
it("shows safe follow-up links and the full receipt without claiming a LINE delivery", async () => {
  const host = mount({ publicInfo: { address: "測試地址", contactUrl: "https://line.me/R/ti/p/@test", mapUrl: "https://maps.google.com/?q=test" } });
  await chooseTime(host); set(field(host, "姓名"), "預約人"); await act(async () => button(host, "確認預約").click());
  expect(host.textContent).toContain("09:00–09:30"); expect(host.textContent).toContain("測試地址");
  expect([...host.querySelectorAll("a")].map(a => a.textContent)).toEqual(["聯絡店家", "查看地圖", "會員專區（需登入）"]);
  expect(host.textContent).not.toContain("已送達");
});
it("does not collect personal data when no trial service is available", () => {
  const host = mount({ catalog: { ...catalog, services: [] } }); expect(host.querySelector("input")).toBeNull(); expect(host.textContent).toContain("目前尚無可預約的體驗服務");
});
