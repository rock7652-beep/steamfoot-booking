// @vitest-environment jsdom
/** Synthetic rows and mocked saves exercise the real ordering hook. Browser layout
 * and real store permissions require separate Preview acceptance. */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCourseDisplayOrder } from "@/components/admin/course-display-order";

type Result = { success: true; revision: number } | { success: false; error: string };
type ToastOptions = { action?: { label: string; onClick: () => void } };
const mocks = vi.hoisted(() => ({ save: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/server/actions/course-display-order", () => ({ saveCourseDisplayOrder: mocks.save }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, info: mocks.info } }));

const rows = [{ id: "a", name: "方案甲", active: true }, { id: "b", name: "方案乙", active: true }, { id: "c", name: "方案丙", active: false }];
let host: HTMLDivElement, root: Root;
function Fixture({ enabled = true, writer }: { enabled?: boolean;writer?:import("@/lib/course-display-order").CourseOrderWriter }) {
  const order = useCourseDisplayOrder("plan", rows, { ids: ["a", "b", "c"], revision: 7 }, enabled, row => row.active,writer);
  return createElement("ul", { "aria-label": "方案排序" }, ...order.rows.map(row => createElement("li", {
    key: row.id, ...order.rowProps(row.id),
  }, order.handle(row.id, row.name), row.name)));
}
async function render(enabled = true, scope = "store-a") { await act(async () => root.render(createElement(Fixture, { key: scope, enabled }))); }
const ids = () => [...host.querySelectorAll<HTMLElement>("[data-row-id]")].map(row => row.dataset.rowId);
const handle = (id: string) => host.querySelector<HTMLButtonElement>(`[data-row-id="${id}"] button`)!;
function button(label: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label)!; }
async function key(id: string, key: string) { await act(async () => handle(id).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))); }
async function click(label: string) { await act(async () => button(label).click()); }
function undo() { return (mocks.success.mock.calls.findLast(call => (call[1] as ToastOptions | undefined)?.action)?.[1] as ToastOptions).action!.onClick; }
function deferred() {
  let resolve!: (result: Result) => void, reject!: (error: Error) => void;
  const promise = new Promise<Result>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  mocks.save.mockResolvedValue({ success: true, revision: 8 });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("course display order immediate feedback", () => {
  it("keeps the existing immediate move, reports pending locally, and blocks same-tick repeats", async () => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
    await render(); const trigger = handle("b");
    await act(async () => { for (let i = 0; i < 3; i++) trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); });
    expect(ids()).toEqual(["b", "a", "c"]);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ kind: "plan", ids: ["b", "a", "c"], revision: 7 });
    expect(host.querySelector('[role="status"]')?.closest("li")?.dataset.rowId).toBe("b");
    expect([...host.querySelectorAll("button")].every(item => item.disabled)).toBe(true);
    await act(async () => pending.resolve({ success: true, revision: 8 }));
    expect(host.querySelector('[role="status"]')).toBeNull(); expect(ids()).toEqual(["b", "a", "c"]);
  });

  it.each(["rejected", "network"])("rolls back a %s move at its row and permits explicit retry", async failure => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
    await render(); await key("b", "ArrowUp");
    await act(async () => failure === "rejected" ? pending.resolve({ success: false, error: "排序尚未儲存" }) : pending.reject(new Error("offline")));
    expect(ids()).toEqual(["a", "b", "c"]);
    const alert = host.querySelector('[role="alert"]'); expect(alert?.closest("li")?.dataset.rowId).toBe("b");
    expect(alert?.textContent).toContain(failure === "rejected" ? "排序尚未儲存" : "連線中斷");
    expect(mocks.success).not.toHaveBeenCalled();
    await click("重試"); expect(ids()).toEqual(["b", "a", "c"]);
    expect(mocks.save).toHaveBeenCalledTimes(2); expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("restores immediately while Undo is pending and deduplicates repeated Undo clicks", async () => {
    await render(); await key("b", "ArrowUp"); const restore = undo();
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
    await act(async () => { restore(); restore(); restore(); });
    expect(ids()).toEqual(["a", "b", "c"]); expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenLastCalledWith({ kind: "plan", ids: ["a", "b", "c"], revision: 8 });
    expect(host.querySelector('[role="status"]')?.closest("li")?.dataset.rowId).toBe("b");
    await act(async () => pending.resolve({ success: true, revision: 9 }));
    expect(ids()).toEqual(["a", "b", "c"]); expect(mocks.success).toHaveBeenLastCalledWith("已復原排序");
  });

  it.each(["rejected", "network"])("rolls back a %s Undo to the last saved order and retries the same revision", async failure => {
    await render(); await key("b", "ArrowUp"); const restore = undo();
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
    await act(async () => restore()); expect(ids()).toEqual(["a", "b", "c"]);
    await act(async () => failure === "rejected" ? pending.resolve({ success: false, error: "復原尚未儲存" }) : pending.reject(new Error("offline")));
    expect(ids()).toEqual(["b", "a", "c"]);
    expect(host.querySelector('[role="alert"]')?.closest("li")?.dataset.rowId).toBe("b");
    mocks.save.mockResolvedValueOnce({ success: true, revision: 9 }); await click("重試");
    expect(mocks.save).toHaveBeenLastCalledWith({ kind: "plan", ids: ["a", "b", "c"], revision: 8 });
    expect(ids()).toEqual(["a", "b", "c"]); expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("does not let an older Undo overwrite a newer successful order", async () => {
    await render(); await key("b", "ArrowUp"); const oldUndo = undo();
    mocks.save.mockResolvedValueOnce({ success: true, revision: 9 }); await key("a", "ArrowUp");
    await act(async () => oldUndo());
    expect(mocks.save).toHaveBeenCalledTimes(2); expect(ids()).toEqual(["a", "b", "c"]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("排序已變更");
  });

  it("does not allow a stale toast to change ordering while filters disable it", async () => {
    await render(); await key("b", "ArrowUp"); const restore = undo();
    await render(false); await act(async () => restore()); await key("b", "ArrowDown");
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(ids()).toEqual(["b", "a", "c"]);
  });

  it("preserves active/inactive grouping and keyboard/menu alternatives", async () => {
    await render(); await key("b", "ArrowDown"); expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => handle("b").click()); expect(button("下移").disabled).toBe(true);
    await click("上移"); expect(ids()).toEqual(["b", "a", "c"]);
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it.each(["success", "failure"])("ignores late %s and old toast callbacks after a store remount", async result => {
    const pending = deferred(); mocks.save.mockReturnValueOnce(pending.promise);
    await render(); await key("b", "ArrowUp"); await render(true, "store-b");
    await act(async () => pending.resolve(result === "success" ? { success: true, revision: 8 } : { success: false, error: "舊店錯誤" }));
    expect(ids()).toEqual(["a", "b", "c"]); expect(host.textContent).not.toContain("舊店錯誤");
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });

  it("ignores a previously rendered Undo after its component unmounts", async () => {
    await render(); await key("b", "ArrowUp"); const restore = undo();
    await render(true, "store-b"); await act(async () => restore());
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(ids()).toEqual(["a", "b", "c"]);
  });
});

it("uses an injected Beauty writer including undo, without calling the Course action",async()=>{
 const writer=vi.fn().mockResolvedValueOnce({success:true,revision:8}).mockResolvedValueOnce({success:true,revision:9});
 await act(async()=>root.render(createElement(Fixture,{writer})));await key("b","ArrowUp");
 expect(writer).toHaveBeenCalledWith({kind:"plan",ids:["b","a","c"],revision:7});expect(mocks.save).not.toHaveBeenCalled();
 await act(async()=>undo()());expect(writer).toHaveBeenLastCalledWith({kind:"plan",ids:["a","b","c"],revision:8});expect(mocks.save).not.toHaveBeenCalled();
});
