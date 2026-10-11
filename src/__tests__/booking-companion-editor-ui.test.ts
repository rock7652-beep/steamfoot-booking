// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ find: vi.fn(), attach: vi.fn(), create: vi.fn() }));
vi.mock("@/server/actions/booking-participants", () => ({ findBookingCompanionByPhone: h.find, attachBookingCompanion: h.attach, createBookingCompanion: h.create }));
vi.mock("@/components/operations/panel-read-cache", () => ({ usePanelReader: () => ({ read: h.find, invalidate: vi.fn() }) }));
import { BookingCompanionEditor } from "@/app/(dashboard)/dashboard/bookings/booking-companion-editor";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => vi.resetAllMocks());
it.each([false, true])("shows an inline identity entry only for an unlinked companion (linked=%s)", async linked => {
  const host = document.createElement("div"); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(BookingCompanionEditor, { bookingId: "b", readOnly: false,
      companions: { canEdit: true, canCreate: true, slots: [{ position: 2, revision: 0, customerId: linked ? "c" : null, name: linked ? "朋友" : null, status: "PENDING" }] } })));
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === "資料建檔");
    expect(Boolean(button)).toBe(!linked);
    if (button) {
      await act(async () => button.click());
      expect(host.querySelector('input[type="tel"]')).not.toBeNull();
      expect(host.querySelectorAll('a, [role="dialog"]')).toHaveLength(0);
      expect(host.textContent).not.toContain("建檔後才能");
    }
  } finally { await act(async () => root.unmount()); }
});

async function withEditor(work: (host: HTMLDivElement, updated: ReturnType<typeof vi.fn>) => Promise<void>) {
  const host = document.createElement("div"); const root = createRoot(host); const updated = vi.fn();
  document.body.append(host);
  try {
    await act(async () => root.render(createElement(BookingCompanionEditor, { bookingId: "b", readOnly: false, onUpdated: updated,
      companions: { canEdit: true, canCreate: true, slots: [{ position: 2, revision: 1, customerId: null, name: null, status: "PENDING" }] } })));
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "資料建檔")!.click());
    const inputs = [...host.querySelectorAll("input")];
    await act(async () => {
      for (const [index, value] of ["新朋友", "0912345678"].entries()) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[index], value);
        inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await work(host, updated);
  } finally { await act(async () => root.unmount()); host.remove(); }
}
async function submit(host: HTMLDivElement) {
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
it("fills name and phone together and creates in one submit without a lookup", async () => {
  h.create.mockResolvedValue({ success: true, data: { customerId: "new", name: "新朋友" } });
  await withEditor(async (host, updated) => {
    expect(host.textContent).not.toContain("查詢");
    await submit(host);
    expect(h.create).toHaveBeenCalledWith({ bookingId: "b", position: 2, revision: 1, name: "新朋友", phone: "0912345678" });
    expect(h.find).not.toHaveBeenCalled(); expect(h.attach).not.toHaveBeenCalled();
    expect(host.querySelector("form")).toBeNull(); expect(updated).toHaveBeenCalledTimes(1);
  });
});
it("duplicate phone needs explicit selection and never changes the existing name", async () => {
  h.create.mockResolvedValue({ success: false, error: "此手機已在本店建檔，請重新查詢並確認同行者" });
  h.find.mockResolvedValue({ success: true, data: [{ id: "old", name: "原顧客", phoneMasked: "0912***678" }] });
  h.attach.mockResolvedValue({ success: true, data: [] });
  await withEditor(async (host, updated) => {
    await submit(host); expect(h.attach).not.toHaveBeenCalled(); expect(updated).not.toHaveBeenCalled();
    expect(host.textContent).toContain("原顧客");
    expect(host.querySelector("input")!.value).toBe("新朋友");
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent?.includes("使用此人"))!.click());
    expect(h.attach).toHaveBeenCalledWith({ bookingId: "b", position: 2, customerId: "old", revision: 1 });
    expect(updated).toHaveBeenCalledTimes(1);
  });
});
it("keeps both inputs after failure and after collapsing and reopening", async () => {
  h.create.mockRejectedValue(new Error("offline"));
  await withEditor(async host => {
    await submit(host);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "收合")!.click());
    await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent === "資料建檔")!.click());
    expect([...host.querySelectorAll("input")].map(input => input.value)).toEqual(["新朋友", "0912345678"]);
  });
});
it("deduplicates rapid submits while saving", async () => {
  let finish!: (value: { success: true; data: { customerId: string; name: string } }) => void;
  h.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await withEditor(async host => {
    await submit(host); await submit(host); expect(h.create).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true, data: { customerId: "new", name: "新朋友" } }));
  });
});
