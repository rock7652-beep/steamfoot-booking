// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/bookings",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("@/app/(dashboard)/dashboard/_components/trial-booking-drawer", () => ({
  TrialBookingDrawer: () => null,
}));

import { DayDetailPanel, type DayBooking } from "@/app/(dashboard)/dashboard/bookings/day-detail-panel";

function textFromHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function booking(overrides: Partial<DayBooking>): DayBooking {
  return {
    id: "booking-1",
    slotTime: "11:00",
    people: 1,
    attendedPeople: null,
    isMakeup: false,
    isCheckedIn: false,
    bookingStatus: "PENDING",
    bookingType: "PACKAGE_SESSION",
    expectedAmount: null,
    trialDefaultPrice: null,
    collected: false,
    collectedAmount: null,
    deductedPlanNames: [],
    customer: {
      name: "陳沛妍",
      phone: "0912345678",
      serviceNote: null,
      assignedStaff: null,
      validPackageSessions: 5,
    },
    revenueStaff: null,
    serviceStaff: { id: "staff-1", displayName: "芊芊店長" },
    servicePlan: null,
    customerPlanWallet: null,
    ...overrides,
  };
}

describe("DayDetailPanel summary", () => {
  it("shows NO_SHOW people total instead of no-show booking count", () => {
    const html = renderToStaticMarkup(
      React.createElement(DayDetailPanel, {
        date: "2026-06-26",
        bookings: [booking({ bookingStatus: "NO_SHOW", people: 2 })],
        slots: [],
      }),
    );

    const text = textFromHtml(html);

    expect(text).toMatch(/未到人數\s+2/);
    expect(text).not.toMatch(/未到\s+1/);
  });

  it("counts partial attendance as attended and absent people", () => {
    const html = renderToStaticMarkup(
      React.createElement(DayDetailPanel, {
        date: "2026-06-26",
        bookings: [
          booking({
            bookingStatus: "COMPLETED",
            people: 2,
            attendedPeople: 1,
          }),
        ],
        slots: [],
      }),
    );
    const text = textFromHtml(html);
    expect(text).toMatch(/完成人數\s+1/);
    expect(text).toMatch(/未到人數\s+1/);
  });

  it("shows the plan recorded by the successful deduction", () => {
    const html = renderToStaticMarkup(
      React.createElement(DayDetailPanel, {
        date: "2026-06-26",
        bookings: [booking({
          bookingStatus: "COMPLETED",
          collected: true,
          deductedPlanNames: ["$299會員限定(250點)"],
        })],
        slots: [],
      }),
    );

    expect(textFromHtml(html)).toContain("已扣堂｜方案：$299會員限定(250點)");
  });

  it("accepts cached rows created before deducted plan names existed", () => {
    expect(() => renderToStaticMarkup(
      React.createElement(DayDetailPanel, {
        date: "2026-06-26",
        bookings: [booking({ deductedPlanNames: undefined })],
        slots: [],
      }),
    )).not.toThrow();
  });
});
describe("trial service label", () => {
  it.each([null, { name: "體驗課" }])("uses the same service label with or without a linked name (%j)", (servicePlan) => {
    const text = textFromHtml(renderToStaticMarkup(
      React.createElement(DayDetailPanel, {
        date: "2026-09-11",
        bookings: [booking({ bookingType: "FIRST_TRIAL", servicePlan, expectedAmount: 499 })],
        slots: [],
      }),
    ));
    expect(text).toContain("服務：首次體驗");
    expect(text).not.toContain("方案：");
    expect(text).toContain("NT$499");
  });
});


describe("當日清單備註", () => {
  function renderNotes(notes: string | null, serviceNote: string | null) {
    const entry = booking({ notes });
    entry.customer.serviceNote = serviceNote;
    entry.customer.notes = "已停用的顧客資料備註";
    return renderToStaticMarkup(React.createElement(DayDetailPanel, {
      date: "2026-09-10", bookings: [entry], slots: [],
    }));
  }
  it("shows this booking's note before the store note with distinct labels", () => {
    const html = renderNotes("今天晚到", "怕冷");
    const text = textFromHtml(html);
    expect(text).toMatch(/本次：\s*今天晚到/);
    expect(text).toMatch(/店內：\s*怕冷/);
    expect(text.indexOf("本次：")).toBeLessThan(text.indexOf("店內："));
    expect(text).not.toContain("已停用的顧客資料備註");
    expect(html).toContain('truncate');
  });
  it.each([[null, null], ["  ", "  "]])("omits empty notes", (notes, serviceNote) => {
    const text = textFromHtml(renderNotes(notes, serviceNote));
    expect(text).not.toContain("本次：");
    expect(text).not.toContain("店內：");
  });
  it("shows a booking note even without a store note", () => {
    const text = textFromHtml(renderNotes("驗收完成扣堂test", null));
    expect(text).toMatch(/本次：\s*驗收完成扣堂test/);
    expect(text).not.toContain("店內：");
  });
});


describe("day booking contact actions", () => {
  it("copies the full phone without opening details or completing the booking, and reports clipboard failure", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onBookingClick = vi.fn();
    const onCompleteSingle = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(React.createElement(DayDetailPanel, {
        date: "2026-09-26", bookings: [booking({})], slots: [],
        onBookingClick, onCompleteSingle,
      })));
      const copy = container.querySelector<HTMLButtonElement>('button[aria-label="複製 陳沛妍 的手機號碼"]')!;
      expect(copy).not.toBeNull();
      expect(copy.parentElement?.closest("button")).toBeNull();
      expect(container.textContent).toContain("0912-345-678");
      await act(async () => copy.click());
      expect(writeText).toHaveBeenCalledWith("0912345678");
      expect(toast.success).toHaveBeenCalledWith("已複製手機號碼");
      expect(onBookingClick).not.toHaveBeenCalled();
      expect(onCompleteSingle).not.toHaveBeenCalled();
      writeText.mockRejectedValueOnce(new Error("clipboard denied"));
      await act(async () => copy.click());
      expect(toast.error).toHaveBeenCalledWith("無法自動複製，請選取號碼手動複製");
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label^="查看 11:00"]')!.click());
      expect(onBookingClick).toHaveBeenCalledWith("booking-1");
      const complete = [...container.querySelectorAll("button")].find(b => b.textContent === "完成")!;
      await act(async () => complete.click());
      expect(onCompleteSingle).toHaveBeenCalledWith("booking-1");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.restoreAllMocks();
    }
  });

  it.each(["PENDING", "COMPLETED", "NO_SHOW"])("keeps phone visible for %s", (bookingStatus) => {
    const html = renderToStaticMarkup(React.createElement(DayDetailPanel, {
      date: "2026-09-26", bookings: [booking({ bookingStatus })], slots: [],
    }));
    expect(textFromHtml(html)).toContain("0912-345-678");
  });

  it("does not offer a copy action when the phone is blank", () => {
    const row = booking({});
    row.customer.phone = "  ";
    const html = renderToStaticMarkup(React.createElement(DayDetailPanel, {
      date: "2026-09-26", bookings: [row], slots: [],
    }));
    expect(textFromHtml(html)).toContain("未留電話");
    expect(html).not.toContain("複製 陳沛妍 的手機號碼");
  });
});
