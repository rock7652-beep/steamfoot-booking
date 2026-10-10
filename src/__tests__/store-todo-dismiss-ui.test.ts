// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreTodoCard } from "@/app/(dashboard)/dashboard/store-todo-card";
import type { StoreTodoItem } from "@/server/queries/store-todos";
import type { ActionResult } from "@/types";

const { dismissTodo } = vi.hoisted(() => ({ dismissTodo: vi.fn() }));
vi.mock("@/server/actions/todo-dismiss", () => ({ dismissTodo }));
vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({ children, href, ...props }: { children: ReactNode; href: string }) => createElement("a", { href, ...props }, children),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function todo(name: string, token = "2026-09-01"): StoreTodoItem {
  return { id: `followup:${name}:${token}`, type: "FOLLOW_UP", label: "回訪", message: `${name} 已 39 天沒回來`, href: `/dashboard/customers/${name}`, actionLabel: "查看顧客", priority: 4 };
}
function deferred() {
  let resolve!: (result: ActionResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ActionResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let host: HTMLDivElement;
let root: Root;
const rows = [todo("甲"), todo("乙"), todo("丙"), todo("丁"), todo("戊")];
const success: ActionResult = { success: true, data: undefined };
async function render(items = rows, options: { readOnly?: boolean; canCreateBooking?: boolean; scope?: string } = {}) {
  await act(async () => root.render(createElement(StoreTodoCard, {
    key: options.scope ?? "user-a:store-a:false", items, defaultVisible: 3,
    readOnly: options.readOnly, canCreateBooking: options.canCreateBooking,
  })));
}
const rowNames = () => Array.from(host.querySelectorAll("li")).map(row => row.textContent ?? "");
const hasRow = (name: string) => rowNames().some(text => text.startsWith(`回訪${name} `));
function closeButton(name: string) {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(node => node.getAttribute("aria-label")?.startsWith(`關閉「${name} `));
  expect(button).toBeTruthy();
  return button!;
}
async function clickClose(name: string) { await act(async () => closeButton(name).click()); }
async function expand() { await act(async () => Array.from(host.querySelectorAll("button")).find(node => node.textContent === "查看全部 →")!.click()); }

beforeEach(() => {
  vi.resetAllMocks();
  dismissTodo.mockImplementation(() => new Promise(() => {}));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("homepage immediate todo dismissal", () => {
  it("removes before a slow save resolves, fills the next row, and updates remaining count", async () => {
    const save = deferred(); dismissTodo.mockReturnValue(save.promise);
    await render();
    expect(host.textContent).toContain("還有 2 件待處理");
    await clickClose("甲");
    expect(hasRow("甲")).toBe(false); expect(hasRow("丁")).toBe(true);
    expect(host.textContent).toContain("還有 1 件待處理");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("儲存中…（1 筆）");
    expect(dismissTodo).toHaveBeenCalledExactlyOnceWith({ todoKey: rows[0].id, todoType: "FOLLOW_UP" });
    await act(async () => save.resolve(success));
    expect(hasRow("甲")).toBe(false); expect(host.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("blocks repeated clicks on the same key before React commits", async () => {
    await render(); const button = closeButton("甲");
    await act(async () => { button.click(); button.click(); });
    expect(dismissTodo).toHaveBeenCalledTimes(1);
  });

  it("allows other rows while saving and rolls back only a failed row in reverse completion order", async () => {
    const first = deferred(); const second = deferred();
    dismissTodo.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render(); await clickClose("甲"); await clickClose("乙");
    expect(hasRow("甲")).toBe(false); expect(hasRow("乙")).toBe(false);
    expect(host.textContent).toContain("儲存中…（2 筆）");
    await act(async () => second.resolve(success));
    await act(async () => first.resolve({ success: false, error: "保存失敗，請重試。" }));
    expect(hasRow("甲")).toBe(true); expect(hasRow("乙")).toBe(false);
    expect(closeButton("甲").textContent).toBe("重試關閉");
    expect(host.querySelector('[role="alert"]')?.closest("li")?.textContent).toContain("甲");
    expect(host.textContent).toContain("還有 1 件待處理");
  });

  it("keeps every failed row and retry visible when multiple rollbacks exceed the collapsed preview", async () => {
    const first = deferred(); const fourth = deferred();
    dismissTodo.mockReturnValueOnce(first.promise).mockReturnValueOnce(fourth.promise);
    await render(); await clickClose("甲"); await clickClose("丁");
    await act(async () => first.resolve({ success: false, error: "甲未保存" }));
    await act(async () => fourth.resolve({ success: false, error: "丁未保存" }));
    expect(hasRow("甲")).toBe(true); expect(hasRow("丁")).toBe(true);
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(2);
    expect(host.textContent).toContain("還有 1 件待處理");
    expect(closeButton("丁").textContent).toBe("重試關閉");
  });

  it("restores network failures with a retry and clears the old error on retry", async () => {
    const save = deferred(); dismissTodo.mockReturnValueOnce(save.promise).mockResolvedValueOnce(success);
    await render(); await clickClose("甲");
    await act(async () => save.reject(new Error("offline")));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("連線中斷");
    await clickClose("甲");
    expect(dismissTodo).toHaveBeenCalledTimes(2); expect(hasRow("甲")).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("never flashes saved or pending keys back from stale server props, even after an empty snapshot", async () => {
    const save = deferred(); dismissTodo.mockReturnValue(save.promise);
    await render([rows[0]]); await clickClose("甲");
    await render([rows[0]]); expect(hasRow("甲")).toBe(false);
    await act(async () => save.resolve(success));
    await render([]); await render([rows[0]]);
    expect(hasRow("甲")).toBe(false); expect(dismissTodo).toHaveBeenCalledTimes(1);
  });

  it("keeps the list mounted when the server sends empty props before the action fails", async () => {
    const save = deferred(); dismissTodo.mockReturnValue(save.promise);
    await render([rows[0]]); await clickClose("甲"); await render([]);
    expect(host.textContent).toContain("儲存中…");
    await act(async () => save.resolve({ success: false, error: "請重試" }));
    await render([rows[0]]);
    expect(hasRow("甲")).toBe(true); expect(host.querySelector('[role="alert"]')?.textContent).toContain("請重試");
  });

  it("shows the empty state immediately for the final row while honestly indicating pending persistence", async () => {
    const save = deferred(); dismissTodo.mockReturnValue(save.promise);
    await render([rows[0]], { canCreateBooking: true }); await clickClose("甲");
    expect(host.querySelectorAll("li")).toHaveLength(0);
    expect(host.textContent).toContain("今天目前沒有急件"); expect(host.textContent).toContain("儲存中…");
    expect(host.querySelector('a[href="/dashboard/bookings/new"]')).not.toBeNull();
    await act(async () => save.resolve({ success: false, error: "尚未保存" }));
    expect(hasRow("甲")).toBe(true); expect(host.textContent).not.toContain("今天目前沒有急件");
  });

  it("preserves expanded state and derives its count from the optimistic list", async () => {
    await render(); await expand(); await clickClose("甲");
    expect(host.querySelectorAll("li")).toHaveLength(4); expect(host.textContent).toContain("共 4 件待處理");
    await render([...rows]);
    expect(host.querySelectorAll("li")).toHaveLength(4); expect(host.textContent).toContain("收合 ▲");
  });

  it("shows a changed reminder token for the same customer", async () => {
    dismissTodo.mockResolvedValue(success);
    await render([rows[0]]); await clickClose("甲");
    const updated = todo("甲", "2026-10-01");
    await render([rows[0], updated]);
    expect(host.querySelectorAll("li")).toHaveLength(1); await clickClose("甲");
    expect(dismissTodo).toHaveBeenLastCalledWith({ todoKey: updated.id, todoType: updated.type });
  });

  it("does not expose dismissal, customer links, or booking creation in read-only mode", async () => {
    await render(rows, { readOnly: true, canCreateBooking: true });
    expect(host.querySelector('button[aria-label^="關閉"]')).toBeNull();
    expect(host.querySelector("a")).toBeNull(); expect(dismissTodo).not.toHaveBeenCalled();
    await render([], { readOnly: true, canCreateBooking: true });
    expect(host.querySelector("a")).toBeNull(); expect(host.textContent).toContain("查看模式");
  });

  it.each(["user-a:store-b:false", "user-b:store-a:false"])("isolates late results from a new account/store scope %s", async scope => {
    const oldSave = deferred(); dismissTodo.mockReturnValueOnce(oldSave.promise).mockResolvedValueOnce(success);
    await render([rows[0]]); await clickClose("甲");
    await render([rows[0]], { scope });
    expect(hasRow("甲")).toBe(true);
    await act(async () => oldSave.resolve({ success: false, error: "OLD_SCOPE_ERROR" }));
    expect(host.textContent).not.toContain("OLD_SCOPE_ERROR");
    await clickClose("甲"); expect(dismissTodo).toHaveBeenCalledTimes(2); expect(hasRow("甲")).toBe(false);
  });

  it("uses server-authoritative rows after leaving and returning rather than persisting unsaved hiding", async () => {
    const oldSave = deferred(); dismissTodo.mockReturnValueOnce(oldSave.promise);
    await render([rows[0]]); await clickClose("甲");
    await act(async () => root.render(createElement("div", {}, "其他頁面")));
    await act(async () => oldSave.resolve(success));
    await render([]); expect(host.querySelectorAll("li")).toHaveLength(0);
    expect(host.textContent).not.toContain("儲存中");
    await render([rows[0]]); expect(hasRow("甲")).toBe(true);
  });
});
