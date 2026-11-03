// @vitest-environment jsdom
/** Synthetic DOM regression coverage; no real transaction or financial writes. */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  read: vi.fn(), note: vi.fn(), refresh: vi.fn(), close: vi.fn(),
  payment: vi.fn(), staff: vi.fn(), void: vi.fn(), refund: vi.fn(),
}));
vi.mock("@/server/actions/transaction", () => ({
  fetchTransactionDetailDTO: m.read, updateTransactionNote: m.note,
  updateTransactionPaymentMethod: m.payment, updateTransactionOwnerStaff: m.staff,
  voidTransaction: m.void, refundTransaction: m.refund,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/dashboard/transactions", useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/components/admin/right-sheet", () => ({
  RightSheet: ({ open, children, onClose }: { open: boolean; children: ReactNode; onClose: () => void }) => open
    ? createElement("div", { role: "dialog" }, children, createElement("button", { onClick: onClose }, "模擬背景關閉")) : null,
}));
import { TransactionDrawer } from "@/app/(dashboard)/dashboard/transactions/_components/TransactionDrawer";
import { PanelReadProvider } from "@/components/operations/panel-read-cache";

function payload(id = "a", note = "原始備註", staffName = "原店長") {
  return { success: true, data: {
    id, customerName: `顧客-${id}`, storeId: "store-a", amount: 350, paymentMethod: "CASH",
    revenueStaffId: "staff", revenueStaffName: staffName, createdAt: "2026-10-04T00:00:00Z",
    transactionType: "TRIAL_PURCHASE", status: "SUCCESS", note, paymentSplits: [], auditLogs: [],
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  m.read.mockImplementation(async (id: string) => payload(id));
  m.note.mockResolvedValue({ success: true });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  expect(m.payment).not.toHaveBeenCalled(); expect(m.staff).not.toHaveBeenCalled();
  expect(m.void).not.toHaveBeenCalled(); expect(m.refund).not.toHaveBeenCalled();
});
async function render(id = "a", store = "store-a", open = true) {
  await act(async () => root.render(createElement(PanelReadProvider, { key: store },
    createElement(TransactionDrawer, { open, onClose: m.close, transactionId: id,
      staffOptions: [], canEdit: true, canVoid: false, canRefund: false }))));
}
function button(label: string) { return [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === label)!; }
async function click(label: string) { await act(async () => button(label).click()); }
async function edit(value: string) {
  await act(async () => {
    const input = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function startEdit(value = "新的備註") { await click("修改"); await edit(value); }

it("shows immediate pending, blocks same-tick duplicates/cancel/close, and freezes the submitted draft", async () => {
  const write = deferred<{ success: boolean }>(); m.note.mockReturnValue(write.promise);
  await render(); await startEdit();
  await act(async () => { button("儲存").click(); button("儲存").click(); button("取消").click(); button("模擬背景關閉").click(); });
  expect(m.note).toHaveBeenCalledExactlyOnceWith({ transactionId: "a", note: "新的備註" });
  expect(button("儲存中…").disabled).toBe(true); expect(button("取消").disabled).toBe(true);
  expect(host.querySelector("textarea")?.disabled).toBe(true); expect(m.close).not.toHaveBeenCalled();
  expect(host.querySelector('[role="status"]')).toBeNull();
  await act(async () => write.resolve({ success: true }));
  expect(host.querySelector("textarea")).toBeNull(); expect(host.textContent).toContain("新的備註");
  await click("模擬背景關閉"); expect(m.close).toHaveBeenCalledOnce();
});

it.each(["throw", "missing", "malformed"])("retains draft and reports an uncertain %s result without automatic replay", async mode => {
  if (mode === "throw") m.note.mockRejectedValue(new Error("response lost"));
  else m.note.mockResolvedValue(mode === "missing" ? undefined : {});
  await render(); await startEdit(); await click("儲存");
  expect(host.querySelector("textarea")?.value).toBe("新的備註");
  expect(host.querySelector("textarea")?.disabled).toBe(false);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("尚未確認儲存結果");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("草稿已保留");
  expect(m.note).toHaveBeenCalledOnce(); expect(m.read).toHaveBeenCalledOnce();
  expect(m.refresh).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("已儲存 ✓");
});

it("keeps a server rejection beside the editable draft, with a manual retry", async () => {
  m.note.mockResolvedValueOnce({ success: false, error: "交易已作廢，不可修改" });
  await render(); await startEdit(); await click("儲存");
  const alert = host.querySelector('[role="alert"]')!;
  expect(alert.textContent).toBe("交易已作廢，不可修改");
  expect(alert.parentElement?.querySelector("textarea")?.value).toBe("新的備註");
  await edit("手動修訂"); await click("儲存");
  expect(m.note).toHaveBeenLastCalledWith({ transactionId: "a", note: "手動修訂" });
  expect(host.textContent).toContain("手動修訂"); expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("shows confirmed note before a slow detail refresh and updates only other details from that read", async () => {
  await render(); const read = deferred<ReturnType<typeof payload>>(); m.read.mockReturnValueOnce(read.promise);
  await startEdit(); await click("儲存");
  expect(host.querySelector("textarea")).toBeNull(); expect(host.textContent).toContain("新的備註");
  expect(host.textContent).toContain("已儲存 ✓"); expect(button("修改").disabled).toBe(false);
  expect(m.read).toHaveBeenCalledTimes(2);
  await act(async () => read.resolve(payload("a", "舊讀取備註", "更新店長")));
  expect(host.textContent).toContain("新的備註"); expect(host.textContent).toContain("更新店長");
  expect(host.textContent).not.toContain("舊讀取備註");
});

it.each(["throw", "reject"])("keeps a confirmed note if background refresh fails (%s)", async mode => {
  await render();
  if (mode === "throw") m.read.mockRejectedValueOnce(new Error("offline"));
  else m.read.mockResolvedValueOnce({ success: false, error: "讀取失敗" });
  await startEdit(); await click("儲存");
  expect(host.textContent).toContain("新的備註"); expect(host.textContent).toContain("備註已儲存，其他交易資料更新失敗");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await click("修改"); expect(host.querySelector("textarea")?.value).toBe("新的備註");
});

it.each(["missing", "wrong record"])("keeps the confirmed note when a background response has %s data", async mode => {
  await render();
  m.read.mockResolvedValueOnce(mode === "missing" ? { success: true } : payload("other"));
  await startEdit(); await click("儲存");
  expect(host.textContent).toContain("顧客-a"); expect(host.textContent).toContain("新的備註");
  expect(host.textContent).toContain("備註已儲存，其他交易資料更新失敗");
  expect(host.textContent).not.toContain("顧客-other");
});

it("preserves a newer draft when the previous save's background read completes", async () => {
  await render(); const read = deferred<ReturnType<typeof payload>>(); m.read.mockReturnValueOnce(read.promise);
  await startEdit(); await click("儲存"); await startEdit("下一筆草稿");
  await act(async () => read.resolve(payload("a", "新的備註")));
  expect(host.querySelector("textarea")?.value).toBe("下一筆草稿");
  await click("取消"); expect(host.textContent).toContain("新的備註");
});

it.each(["throw", "reject"])("does not restore saved feedback underneath a newer unsaved draft (%s)", async mode => {
  await render(); const read = deferred<unknown>(); m.read.mockReturnValueOnce(read.promise);
  await startEdit(); await click("儲存"); await startEdit("尚未儲存的新草稿");
  await act(async () => {
    if (mode === "throw") read.reject(new Error("old read offline"));
    else read.resolve({ success: false, error: "old read rejected" });
  });
  expect(host.querySelector("textarea")?.value).toBe("尚未儲存的新草稿");
  expect(host.textContent).not.toContain("已儲存");
  expect(host.querySelector('[role="status"]')).toBeNull();
});

it("ignores a previous background refresh after a newer note save begins", async () => {
  await render(); const read = deferred<ReturnType<typeof payload>>(); m.read.mockReturnValueOnce(read.promise);
  await startEdit("第一次儲存"); await click("儲存");
  const nextWrite = deferred<{ success: boolean }>(); m.note.mockReturnValueOnce(nextWrite.promise);
  await startEdit("第二次儲存"); await click("儲存");
  await act(async () => read.resolve(payload("a", "第一次儲存", "舊回應店長")));
  expect(host.textContent).not.toContain("舊回應店長"); expect(button("儲存中…").disabled).toBe(true);
  await act(async () => nextWrite.resolve({ success: true })); expect(host.textContent).toContain("第二次儲存");
});

it.each(["resolve", "reject"])("does not apply an old %s after transaction A → B → A, or unlock its new write", async mode => {
  const old = deferred<{ success: boolean }>(); const current = deferred<{ success: boolean }>();
  m.note.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  await render(); await startEdit("旧草稿"); await click("儲存");
  await render("b"); await render("a"); await startEdit("新草稿"); await click("儲存");
  await act(async () => { if (mode === "resolve") old.resolve({ success: true }); else old.reject(new Error("old offline")); });
  expect(host.querySelector("textarea")?.value).toBe("新草稿"); expect(button("儲存中…").disabled).toBe(true);
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(m.read).toHaveBeenCalledTimes(3);
  await act(async () => current.resolve({ success: true })); expect(host.textContent).toContain("新草稿");
});

it("keeps a new store scope untouched by the old store's late note response", async () => {
  const old = deferred<{ success: boolean }>(); m.note.mockReturnValueOnce(old.promise);
  await render(); await startEdit("A 店草稿"); await click("儲存");
  await render("b", "store-b"); await startEdit("B 店草稿");
  await act(async () => old.resolve({ success: true }));
  expect(host.textContent).toContain("顧客-b"); expect(host.querySelector("textarea")?.value).toBe("B 店草稿");
  expect(button("儲存").disabled).toBe(false); expect(m.read).toHaveBeenCalledTimes(2);
});

it("keeps new state clean when externally closed and reopened before a response arrives", async () => {
  const old = deferred<{ success: boolean }>(); m.note.mockReturnValueOnce(old.promise);
  await render(); await startEdit(); await click("儲存");
  await render("a", "store-a", false); await render();
  await act(async () => old.resolve({ success: true }));
  expect(host.textContent).toContain("原始備註"); expect(host.textContent).not.toContain("新的備註");
  expect(button("修改").disabled).toBe(false); expect(m.read).toHaveBeenCalledTimes(2);
});


it("keeps long unbroken note content in a shrinking, wrapping summary beside its edit control", async () => {
  const note = "LONG_NOTE_".repeat(15);
  m.read.mockResolvedValueOnce(payload("a", note));
  await render();
  const control = button("修改");
  const summary = control.previousElementSibling!;
  expect(summary.textContent).toBe(note);
  expect(summary.classList.contains("min-w-0")).toBe(true);
  expect(summary.classList.contains("flex-1")).toBe(true);
  expect(summary.classList.contains("[overflow-wrap:anywhere]")).toBe(true);
  expect(control.classList.contains("shrink-0")).toBe(true);
});
