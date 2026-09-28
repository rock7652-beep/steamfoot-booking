// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pending: false, prefetch: false, scroll: true }));
vi.mock("next/navigation", () => ({ usePathname: () => "/s/zhubei/admin/dashboard/bookings" }));
vi.mock("next/link", () => ({
  default: ({ children, prefetch, scroll, ...props }: React.ComponentProps<"a"> & { prefetch: boolean; scroll: boolean }) => { state.prefetch = prefetch; state.scroll = scroll; return React.createElement("a", props, children); },
  useLinkStatus: () => ({ pending: state.pending }),
}));
import { BookingMonthLink } from "@/app/(dashboard)/dashboard/bookings/booking-month-link";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("shows the destination while pending and clears feedback on arrival or cancellation", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => root.render(React.createElement(BookingMonthLink, { href: "/dashboard/bookings?year=2027&month=1", year: 2027, month: 1, direction: "next" }));
  try {
    act(render);
    expect(state.prefetch).toBe(false);
    expect(state.scroll).toBe(false);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/s/zhubei/admin/dashboard/bookings?year=2027&month=1");
    expect(document.querySelector('[role="status"]')).toBeNull();
    state.pending = true; act(render);
    expect(container.textContent).toBe("…");
    expect(document.querySelector('[role="status"]')?.textContent).toContain("正在切換至 2027 年 1 月");
    expect(document.querySelector('[role="status"]')?.textContent).toContain("目前仍顯示原月份");
    state.pending = false; act(render);
    expect(container.textContent).toBe("›");
    expect(document.querySelector('[role="status"]')).toBeNull();
  } finally { act(() => root.unmount()); state.pending = false; }
});
