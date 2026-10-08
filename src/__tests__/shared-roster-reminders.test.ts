// @vitest-environment jsdom
import { act, createElement } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LabelSnapshot } from "@/lib/customer-labels";
const m = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), open: vi.fn(), edit: vi.fn() }));
vi.mock("@/server/actions/customer-labels", () => ({ loadCustomerLabels: m.load, setCustomerLabel: m.save }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/courses", useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { CustomerLabelsProvider } from "@/components/customer-labels";
import { RosterReminders } from "@/components/admin/roster-reminders";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.save.mockResolvedValue({ success: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

async function render({ count = 1, notes = "本次完整內容", serviceNote = "店內完整內容", canEdit = true, canEditNote = true, enabled = true } = {}) {
  const initial: LabelSnapshot = { available: true, enabled, canEdit, canManage: false,
    categories: [{ id: "cat", name: "偏好", number: 1, position: 0, active: true }],
    labels: Array.from({ length: count }, (_, i) => ({ id: `label-${i}`, name: `標籤${i + 1}`, categoryId: "cat", active: true })),
    assignments: { customer: Array.from({ length: count }, (_, i) => `label-${i}`) } };
  m.load.mockResolvedValue(initial);
  await act(async () => root.render(jsx(CustomerLabelsProvider, { initial, children: createElement(RosterReminders, {
    customerId: "customer", name: "示範學員", serviceNote, notes, canEdit, canEditNote,
    onOpen: m.open, onEdit: m.edit,
  }) })));
}

it.each([0, 1, 7])("keeps two summary lines and two independent action slots with %s labels", async count => {
  await render({ count });
  const cell = host.querySelector("[data-roster-reminders]")!;
  const overview = cell.querySelector<HTMLButtonElement>('button[aria-label="示範學員 標籤與備註"]')!;
  expect(cell.children).toHaveLength(3);
  expect(overview.children).toHaveLength(2);
  expect(overview.querySelector("button,a,input,select")).toBeNull();
  expect(overview.textContent).toContain(count ? "標籤1" : "無標籤");
  if (count === 7) expect(overview.textContent).toContain("＋2");
  expect(overview.textContent).toContain("本次備註：本次完整內容");
  expect(overview.textContent).toContain("店內備註：店內完整內容");
  await act(async () => overview.click());
  expect(m.open).toHaveBeenCalledOnce(); expect(m.edit).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
});

it.each([
  { notes: "", serviceNote: "" },
  { notes: "短備註", serviceNote: "" },
  { notes: "", serviceNote: "店內長備註".repeat(30) },
  { notes: "本次長備註\n第二行".repeat(30), serviceNote: "店內長備註".repeat(30) },
])("keeps a single summary line without merging note sources: %j", async notes => {
  await render(notes);
  const overview = host.querySelector('button[aria-label="示範學員 標籤與備註"]')!;
  expect(overview.children).toHaveLength(2);
  const summary = overview.children[1];
  expect(summary.querySelector("br,button")).toBeNull();
  if (notes.notes) expect(summary.textContent).toContain("本次備註：");
  if (notes.serviceNote) expect(summary.textContent).toContain("店內備註：");
  if (!notes.notes && !notes.serviceNote) expect(summary.textContent).toBe("尚無備註");
});

it("edits only the session note through the note icon and uses the existing separate label picker", async () => {
  await render();
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="示範學員 本次備註"]')!.click());
  expect(m.edit).toHaveBeenCalledOnce(); expect(m.open).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="示範學員 查看或修改標籤"]')!.click());
  const dialog = document.querySelector('[role="dialog"][aria-label="顧客標籤"]')!;
  expect(dialog).toBeTruthy();
  await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!.click());
  expect(m.save).toHaveBeenCalledExactlyOnceWith({ customerId: "customer", labelId: "label-0", selected: false });
  expect(m.edit).toHaveBeenCalledTimes(1);
});

it("retains the summary and action spacing for readonly/cancelled notes", async () => {
  await render({ canEdit: false, canEditNote: false });
  expect(host.querySelector("[data-roster-reminders]")?.children).toHaveLength(3);
  expect(host.querySelector('button[aria-label="示範學員 本次備註"]')).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="示範學員 查看標籤"]')!.click());
  expect([...document.querySelectorAll<HTMLButtonElement>("[aria-pressed]")].every(button => button.disabled)).toBe(true);
  expect(m.save).not.toHaveBeenCalled();
});

it("does not reveal or enable disabled customer labels", async () => {
  await render({ enabled: false });
  expect(host.querySelector('button[aria-label="示範學員 查看或修改標籤"]')).toBeNull();
  expect(host.textContent).not.toContain("標籤1");
  expect(host.querySelector('button[aria-label="示範學員 標籤與備註"]')).toBeTruthy();
});

it("opens complete multiline notes without a module callback and returns focus after closing", async () => {
  const longNote = "完整本次提醒\n第二行：請保留這段結尾";
  await act(async () => root.render(createElement(RosterReminders, {name: "示範顧客", canEdit: false, serviceNote: "平時完整內容", notes: longNote, usualLabel: "平時"})));
  const overview = host.querySelector<HTMLButtonElement>('button[aria-label="示範顧客 標籤與備註"]')!;
  overview.focus();
  await act(async () => overview.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain(longNote);
  expect(dialog.textContent).toContain("平時完整內容");
  expect(dialog.textContent).not.toContain("編輯本次備註");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true})));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(overview);
});
