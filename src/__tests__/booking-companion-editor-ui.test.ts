// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ find: vi.fn(), attach: vi.fn(), create: vi.fn() }));
vi.mock("@/server/actions/booking-participants", () => ({ findBookingCompanionByPhone: h.find, attachBookingCompanion: h.attach, createBookingCompanion: h.create }));
vi.mock("@/components/operations/panel-read-cache", () => ({ usePanelReader: () => ({ read: h.find }) }));
import { BookingCompanionEditor } from "@/app/(dashboard)/dashboard/bookings/booking-companion-editor";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it.each([false, true])("shows an inline identity entry only for an unlinked companion (linked=%s)", async linked => {
  const host = document.createElement("div"); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(BookingCompanionEditor, { bookingId: "b", readOnly: false,
      companions: { canEdit: true, canCreate: true, slots: [{ position: 2, revision: 0, customerId: linked ? "c" : null, name: linked ? "朋友" : null, status: "PENDING" }] } })));
    const button = [...host.querySelectorAll("button")].find(b => b.textContent === "補資料");
    expect(Boolean(button)).toBe(!linked);
    if (button) {
      await act(async () => button.click());
      expect(host.querySelector('input[type="tel"]')).not.toBeNull();
      expect(host.querySelectorAll('a, [role="dialog"]')).toHaveLength(0);
      expect(host.textContent).not.toContain("建檔後才能");
    }
  } finally { await act(async () => root.unmount()); }
});
