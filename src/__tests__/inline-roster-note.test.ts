// @vitest-environment jsdom
/** Real shared editor/state/modal interactions with synthetic rows and save adapters.
 * jsdom does not prove browser layout, native keyboard behavior, or server permissions. */
import { act, createElement } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RosterReminders } from "@/components/admin/roster-reminders";
import { ModalPanel } from "@/components/admin/modal-panel";
import { OperationScope } from "@/components/operations/operation-scope";
import type { NoteSaveResult } from "@/components/operations/retained-note-editor";

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/synthetic/roster", useRouter: () => navigation }));
vi.mock("@/components/customer-labels", () => ({ CustomerLabels: () => null }));

const customerName = "合成顧客";
const initialNote = "原有本次備註\n第二行";
const usualNote = "固定店內提醒，不可由本次備註修改";
let host: HTMLDivElement, root: Root;
let fixture: { scopeKey: string; notes: string | null; canEditNote: boolean; modal: boolean; visible: boolean; principal: string };
const save = vi.fn<(notes: string | null, expected: string | null) => Promise<NoteSaveResult>>();
const onSaved = vi.fn<(notes: string | null) => void>();
const onRowOpen = vi.fn(), onOverview = vi.fn(), onLegacyEdit = vi.fn(), onModalClose = vi.fn();

function tree() {
  const row = createElement("div", { "data-booking-row": fixture.scopeKey, onClick: onRowOpen },
    createElement("span", { "data-preserved-status": true }, "已報到 · 方案剩餘 8 堂"),
    createElement(RosterReminders, {
      name: customerName, notes: fixture.notes, serviceNote: usualNote,
      canEdit: true, canEditNote: fixture.canEditNote, onOpen: onOverview, onEdit: onLegacyEdit,
      inlineNote: { scopeKey: fixture.scopeKey, maxLength: 1000, save, onSaved },
    }));
  const content = fixture.visible ? row : null;
  return createElement(OperationScope, { scope: fixture.principal, key: fixture.principal },
    fixture.modal ? jsx(ModalPanel, { open: true, onClose: onModalClose, labelledById: "parent-title", children: createElement("div", null, createElement("h2", { id: "parent-title" }, "既有名單視窗"), content) }) : content);
}
async function render(patch: Partial<typeof fixture> = {}) {
  fixture = { ...fixture, ...patch };
  await act(async () => root.render(tree()));
}
function trigger() { return document.querySelector<HTMLButtonElement>(`button[aria-label="${customerName} 本次備註"]`)!; }
function textarea() { return document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${customerName} 本次備註內容"]`)!; }
function editor() { return document.querySelector<HTMLElement>("[data-inline-roster-note]")!; }
function action(label: string) { return [...editor().querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === label)!; }
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
async function input(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea(), value);
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(target: HTMLElement, value: string) {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  await act(async () => target.dispatchEvent(event));
  return event;
}
function deferred() {
  let resolve!: (result: NoteSaveResult) => void;
  const promise = new Promise<NoteSaveResult>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 100, height: 44 }] as unknown as DOMRectList);
  save.mockResolvedValue({ success: true });
  fixture = { scopeKey: "store:steam:booking-a", notes: initialNote, canEditNote: true, modal: false, visible: true, principal: "account:store:steam:editable" };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  onSaved.mockImplementation(notes => { fixture = { ...fixture, notes }; root.render(tree()); });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); sessionStorage.clear();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("shared inline roster note editor", () => {
  it("opens immediately in the original row without invoking a detail, overview or legacy editor", async () => {
    await render(); const originalRow = document.querySelector("[data-booking-row]");
    const pencil = trigger(); pencil.focus(); await click(pencil);
    expect(editor().closest("[data-booking-row]")).toBe(originalRow);
    expect(editor().closest("[data-roster-reminders]")).not.toBeNull();
    expect(textarea().value).toBe(initialNote); expect(textarea().maxLength).toBe(1000);
    expect(document.activeElement).toBe(textarea()); expect(pencil.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onRowOpen).not.toHaveBeenCalled(); expect(onOverview).not.toHaveBeenCalled(); expect(onLegacyEdit).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves only the changed note and its original expected value, then restores row focus", async () => {
    await render(); const pencil = trigger(); await click(pencil); await input("  新的本次提醒\n保留換行  "); await click(action("儲存"));
    expect(save).toHaveBeenCalledExactlyOnceWith("新的本次提醒\n保留換行", initialNote);
    expect(onSaved).toHaveBeenCalledExactlyOnceWith("新的本次提醒\n保留換行");
    expect(editor()).toBeNull(); expect(document.activeElement).toBe(pencil);
    expect(host.textContent).toContain("新的本次提醒 保留換行"); expect(host.textContent).toContain(usualNote);
    expect(host.querySelector("[data-preserved-status]")?.textContent).toBe("已報到 · 方案剩餘 8 堂");
    expect(onRowOpen).not.toHaveBeenCalled(); expect(onLegacyEdit).not.toHaveBeenCalled(); expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it.each(["取消", "Escape"])("%s discards only the editor and keeps the surrounding ModalPanel open", async dismissal => {
    await render({ modal: true }); const panel = document.querySelector('[role="dialog"]'); const pencil = trigger();
    await click(pencil); await input("尚未儲存");
    if (dismissal === "Escape") expect((await key(textarea(), "Escape")).defaultPrevented).toBe(true);
    else await click(action("取消"));
    expect(window.confirm).toHaveBeenCalledOnce(); expect(editor()).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBe(panel); expect(onModalClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(pencil); expect(save).not.toHaveBeenCalled(); expect(onRowOpen).not.toHaveBeenCalled();
    await click(pencil); expect(textarea().value).toBe(initialNote);
  });

  it("keeps a dirty draft when discard confirmation is declined", async () => {
    await render({ modal: true }); await click(trigger()); await input("不要丟掉");
    vi.mocked(window.confirm).mockReturnValue(false); await key(textarea(), "Escape");
    expect(textarea().value).toBe("不要丟掉"); expect(onModalClose).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it("repeated pencil clicks retain the draft and return focus to its textarea", async () => {
    await render(); await click(trigger()); await input("繼續編輯中的草稿");
    trigger().focus(); await click(trigger()); await click(trigger());
    expect(textarea().value).toBe("繼續編輯中的草稿"); expect(document.activeElement).toBe(textarea());
    expect(document.querySelectorAll("textarea")).toHaveLength(1); expect(save).not.toHaveBeenCalled();
  });

  it("deduplicates same-tick saves and keeps pending inputs locked", async () => {
    const pending = deferred(); save.mockReturnValueOnce(pending.promise);
    await render({ modal: true }); await click(trigger()); await input("慢速儲存"); const button = action("儲存");
    await act(async () => { button.click(); button.click(); button.click(); });
    expect(save).toHaveBeenCalledTimes(1); expect(textarea().disabled).toBe(true); expect(action("取消").disabled).toBe(true);
    await key(textarea(), "Escape"); expect(onModalClose).not.toHaveBeenCalled(); expect(editor()).not.toBeNull();
    await act(async () => pending.resolve({ success: true }));
    expect(onSaved).toHaveBeenCalledExactlyOnceWith("慢速儲存"); expect(editor()).toBeNull();
  });

  it.each(["rejected", "network"])("retains draft after %s failure and permits an explicit retry", async failure => {
    if (failure === "network") save.mockRejectedValueOnce(new Error("offline"));
    else save.mockResolvedValueOnce({ success: false, error: "尚未儲存，請重試" });
    await render(); await click(trigger()); await input("失敗不能丟失"); await click(action("儲存"));
    expect(textarea().value).toBe("失敗不能丟失"); expect(textarea().disabled).toBe(false);
    expect(editor().querySelector('[role="alert"]')?.textContent).toContain(failure === "network" ? "內容已保留" : "請重試");
    expect(onSaved).not.toHaveBeenCalled(); await click(action("儲存"));
    expect(save).toHaveBeenCalledTimes(2); expect(save).toHaveBeenLastCalledWith("失敗不能丟失", initialNote);
    expect(onSaved).toHaveBeenCalledExactlyOnceWith("失敗不能丟失"); expect(editor()).toBeNull();
  });

  it("shows a conflicting note without overwriting the draft and retries against the acknowledged current value", async () => {
    save.mockResolvedValueOnce({ success: false, error: "另一位同事已更新", currentValue: "別人儲存的備註" });
    await render(); await click(trigger()); await input("我的備註"); await click(action("儲存"));
    expect(textarea().value).toBe("我的備註"); expect(editor().textContent).toContain("別人儲存的備註"); expect(action("儲存").disabled).toBe(true);
    await click(action("保留我的輸入")); expect(textarea().value).toBe("我的備註"); await click(action("儲存"));
    expect(save).toHaveBeenLastCalledWith("我的備註", "別人儲存的備註"); expect(save).toHaveBeenCalledTimes(2);
  });

  it("clears an existing note as null and does not mutate store reminders", async () => {
    await render(); await click(trigger()); await input(" \n  "); await click(action("儲存"));
    expect(save).toHaveBeenCalledExactlyOnceWith(null, initialNote); expect(onSaved).toHaveBeenCalledExactlyOnceWith(null);
    expect(host.textContent).toContain(usualNote); expect(host.textContent).not.toContain(initialNote);
  });

  it("collapses unchanged content without a write or a discard prompt", async () => {
    await render(); await click(trigger()); await click(action("儲存"));
    expect(editor()).toBeNull(); expect(save).not.toHaveBeenCalled(); expect(window.confirm).not.toHaveBeenCalled();
  });

  it("keeps Enter available for multiline input and never submits on Enter", async () => {
    await render(); await click(trigger());
    expect((await key(textarea(), "Enter")).defaultPrevented).toBe(false);
    // jsdom has no native text-editing default action; insert the resulting newline explicitly.
    await input("第一行\n第二行"); expect(textarea().value).toBe("第一行\n第二行"); expect(save).not.toHaveBeenCalled();
    await click(action("儲存")); expect(save).toHaveBeenCalledExactlyOnceWith("第一行\n第二行", initialNote);
  });

  it("renders markup-like notes literally without creating executable elements", async () => {
    const payload = '<img src=x onerror="window.inlineNoteXss=true"><script>alert(1)</script>';
    await render({ notes: payload }); expect(host.textContent).toContain(payload);
    expect(host.querySelector("img,script")).toBeNull(); await click(trigger()); expect(textarea().value).toBe(payload);
    await input(`${payload}\n補充`); await click(action("儲存"));
    expect(host.textContent).toContain(payload); expect(host.querySelector("img,script")).toBeNull();
  });

  it("preserves typed draft and original expected value across a 60-second background refresh and resize", async () => {
    vi.useFakeTimers(); await render(); await click(trigger()); await input("尚未儲存的本機內容");
    setTimeout(() => { fixture = { ...fixture, notes: "背景刷新帶來的內容" }; root.render(tree()); }, 60_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); window.dispatchEvent(new Event("resize")); });
    expect(textarea().value).toBe("尚未儲存的本機內容"); await click(action("儲存"));
    expect(save).toHaveBeenCalledExactlyOnceWith("尚未儲存的本機內容", initialNote);
  });

  it("retains an unsaved draft when its row disappears and returns within the same operation scope", async () => {
    await render(); await click(trigger()); await input("篩選後仍要保留"); await render({ visible: false });
    expect(editor()).toBeNull(); await render({ visible: true, notes: "更新後的伺服器內容" });
    expect(textarea().value).toBe("篩選後仍要保留"); expect(save).not.toHaveBeenCalled();
  });

  it("clears only its submitted retained draft after a successful save resolves while the row is filtered out", async () => {
    const pending = deferred(); save.mockReturnValueOnce(pending.promise);
    await render(); await click(trigger()); await input("篩選前送出的內容"); await click(action("儲存"));
    await render({ visible: false }); await act(async () => pending.resolve({ success: true }));
    expect(onSaved).not.toHaveBeenCalled();
    await render({ visible: true, notes: "篩選前送出的內容" }); expect(editor()).toBeNull();
    await click(trigger()); expect(textarea().value).toBe("篩選前送出的內容");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not clear newer retained input when an earlier unmounted editor save succeeds", async () => {
    const pending = deferred(); save.mockReturnValueOnce(pending.promise);
    await render(); await click(trigger()); await input("第一版送出"); await click(action("儲存"));
    await render({ visible: false }); await render({ visible: true });
    expect(textarea().value).toBe("第一版送出"); await input("第二版仍在編輯");
    await act(async () => pending.resolve({ success: true }));
    expect(textarea().value).toBe("第二版仍在編輯"); expect(onSaved).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it.each([null, "", "  "])("does not treat an unchanged empty note (%j) as dirty", async notes => {
    await render({ notes }); await click(trigger());
    expect(editor().textContent).not.toContain("未儲存"); await click(action("取消"));
    expect(window.confirm).not.toHaveBeenCalled(); await click(trigger()); await click(action("儲存"));
    expect(editor()).toBeNull(); expect(save).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"])("ignores old %s responses after changing the booking scope", async result => {
    const pending = deferred(); save.mockReturnValueOnce(pending.promise);
    await render(); await click(trigger()); await input("舊預約尚未回應"); await click(action("儲存"));
    await render({ scopeKey: "store:steam:booking-b", notes: "另一筆預約" }); await click(trigger()); await input("新预約自己的草稿");
    await act(async () => pending.resolve(result === "success" ? { success: true } : { success: false, error: "舊錯誤", currentValue: "舊衝突" }));
    expect(textarea().value).toBe("新预約自己的草稿"); expect(textarea().disabled).toBe(false);
    expect(editor().textContent).not.toContain("舊錯誤"); expect(editor().textContent).not.toContain("舊衝突"); expect(onSaved).not.toHaveBeenCalled();
    await click(action("儲存")); expect(save).toHaveBeenLastCalledWith("新预約自己的草稿", "另一筆預約");
  });

  it("hides editing without permission and keeps the note readable", async () => {
    await render({ canEditNote: false }); expect(trigger()).toBeNull(); expect(editor()).toBeNull();
    expect(host.textContent).toContain("原有本次備註 第二行"); expect(save).not.toHaveBeenCalled();
  });

  it("disables an already-open draft when permission is revoked without dropping its text", async () => {
    await render(); await click(trigger()); await input("權限改變前的草稿"); await render({ canEditNote: false });
    expect(trigger()).toBeNull(); expect(textarea().value).toBe("權限改變前的草稿"); expect(textarea().disabled).toBe(true);
    expect(action("儲存").disabled).toBe(true); expect(editor().textContent).toContain("目前無編輯權限"); expect(save).not.toHaveBeenCalled();
  });
});
