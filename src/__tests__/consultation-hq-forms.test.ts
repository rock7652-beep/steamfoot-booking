// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/app/hq/dashboard/trial-applications/consultation-actions", () => ({ updateConsultationLead: m.update }));
import { ConsultationNoteForm, ConsultationLinkForm, CopyLineId } from "@/app/hq/dashboard/trial-applications/consultation-forms";
let host: HTMLDivElement; let root: Root;
const id = "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a";
const app = "6613bac6-7d97-485c-92c4-c59d71e1cba2";
beforeEach(() => {
  vi.resetAllMocks(); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function type(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
describe("consultation inline forms", () => {
  it("preserves a note on failure and requires explicit conflict review before resubmitting", async () => {
    m.update.mockResolvedValueOnce({ success: false, message: "資料已有更新", conflict: { revision: 4, status: "FOLLOW_UP", applicationId: app } }).mockResolvedValueOnce({ success: true, message: "已儲存 ✓", revision: 5 });
    await act(async () => root.render(createElement(ConsultationNoteForm, { id, revision: 2 })));
    await type(host.querySelector("textarea")!, "我尚未儲存的原始紀錄"); await submit();
    expect(host.querySelector("textarea")!.value).toBe("我尚未儲存的原始紀錄"); expect(host.textContent).toContain("最新修訂 4");
    expect(m.update.mock.calls[0][0].get("revision")).toBe("2");
    const save = [...host.querySelectorAll("button")].find(button => button.textContent === "新增紀錄")!; expect(save.disabled).toBe(true);
    const accept = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("已核對最新資料"))!;
    await act(async () => accept.click()); await submit();
    expect(m.update.mock.calls[1][0].get("revision")).toBe("4"); expect(host.querySelector("textarea")!.value).toBe(""); expect(host.textContent).toContain("已儲存 ✓");
  });
  it("disables repeated submissions while the first write is pending", async () => {
    let resolve!: (value: unknown) => void; m.update.mockReturnValue(new Promise(done => { resolve = done; }));
    await act(async () => root.render(createElement(ConsultationNoteForm, { id, revision: 1 })));
    await type(host.querySelector("textarea")!, "聯繫紀錄");
    await act(async () => { const form = host.querySelector("form")!; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(m.update).toHaveBeenCalledOnce(); expect(host.querySelector("fieldset")!.disabled).toBe(true);
    await act(async () => resolve({ success: true, message: "已儲存 ✓", revision: 2 }));
  });
  it("keeps the original revision and note when newer server props arrive", async () => {
    await act(async () => root.render(createElement(ConsultationNoteForm, { id, revision: 1 })));
    await type(host.querySelector("textarea")!, "保留草稿");
    await act(async () => root.render(createElement(ConsultationNoteForm, { id, revision: 3 })));
    expect(host.querySelector("textarea")!.value).toBe("保留草稿"); expect(host.querySelector<HTMLInputElement>('[name="revision"]')!.value).toBe("1"); expect(host.textContent).toContain("資料已有更新");
  });
  it("resets manual verification when the exact application id changes", async () => {
    await act(async () => root.render(createElement(ConsultationLinkForm, { id, revision: 1, applicationId: null })));
    const field = host.querySelector<HTMLInputElement>('[name="applicationId"]')!; const check = host.querySelector<HTMLInputElement>('[type="checkbox"]')!;
    await type(field, app); await act(async () => check.click()); expect(check.checked).toBe(true);
    await type(field, "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a"); expect(check.checked).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("copies the original LINE identifier without constructing a URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await act(async () => root.render(createElement(CopyLineId, { value: "某店原留名稱" })));
    await act(async () => host.querySelector("button")!.click()); expect(writeText).toHaveBeenCalledWith("某店原留名稱"); expect(host.querySelector("a")).toBeNull(); expect(host.textContent).toContain("已複製 LINE ID");
  });
});
