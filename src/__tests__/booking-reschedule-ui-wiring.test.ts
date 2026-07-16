import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";

const harness = vi.hoisted(() => ({
  cursor: 0,
  states: [] as unknown[],
  pending: [] as Promise<unknown>[],
  updateBooking: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: vi.fn(),
    useState: <T,>(initial: T | (() => T)) => {
      const index = harness.cursor++;
      if (!(index in harness.states)) {
        harness.states[index] =
          typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((previous: T) => T)) => {
        const previous = harness.states[index] as T;
        harness.states[index] =
          typeof next === "function"
            ? (next as (value: T) => T)(previous)
            : next;
      };
      return [harness.states[index] as T, setState] as const;
    },
    useTransition: () => [
      false,
      (callback: () => void | Promise<void>) => {
        harness.pending.push(Promise.resolve(callback()));
      },
    ] as const,
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/actions/booking", () => ({
  markCompleted: vi.fn(),
  markNoShow: vi.fn(),
  cancelBooking: vi.fn(),
  revertBookingStatus: vi.fn(),
  updateBooking: (...args: unknown[]) => harness.updateBooking(...args),
}));

vi.mock("@/server/actions/booking-drawer", () => ({
  fetchBookingDetail: vi.fn(),
}));
vi.mock("@/server/actions/slots", () => ({
  fetchDaySlots: vi.fn(),
}));

vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
vi.mock("@/components/admin/right-sheet", () => ({ RightSheet: () => null }));
vi.mock("@/components/admin/status-badge", () => ({
  StatusBadge: () => null,
  bookingStatusMeta: {},
}));
vi.mock("@/components/admin/people-badge", () => ({ PeopleBadge: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/no-show-modal", () => ({
  NoShowModal: () => null,
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal", () => ({
  CollectTrialModal: () => null,
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal", () => ({
  CorrectTrialCollectionModal: () => null,
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/attendance-modal", () => ({
  AttendanceModal: () => null,
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-single-modal", () => ({
  CollectSingleModal: () => null,
}));
vi.mock("@/app/(dashboard)/dashboard/bookings/adjust-checkout-modal", () => ({
  AdjustCheckoutModal: () => null,
}));

import { RescheduleModal } from "@/app/(dashboard)/dashboard/bookings/reschedule-modal";
import { BookingDetailDrawer } from "@/app/(dashboard)/dashboard/bookings/booking-detail-drawer";

type ElementLike = {
  type?: unknown;
  props?: Record<string, unknown> & { children?: ReactNode };
};

function findElement(
  node: ReactNode,
  predicate: (element: ElementLike) => boolean,
): ElementLike {
  if (node && typeof node === "object" && "props" in node) {
    const element = node as ElementLike;
    if (predicate(element)) return element;
    const children = element.props?.children;
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      try {
        return findElement(child, predicate);
      } catch {
        // Continue searching sibling elements.
      }
    }
  }
  throw new Error("Expected element was not found");
}

function renderWithHookState<T>(render: () => T): T {
  harness.cursor = 0;
  return render();
}

function bookingPayload(): BookingDrawerPayload {
  return {
    booking: {
      id: "booking-cross-date",
      bookingDate: "2026-07-20",
      slotTime: "10:00",
      bookingStatus: "PENDING",
      bookingType: "PACKAGE_SESSION",
      people: 1,
      isMakeup: false,
      isCheckedIn: false,
      notes: null,
      customer: {
        id: "customer-cross-date",
        name: "Cross-date fixture",
        phone: "test-only",
        serviceNote: null,
      },
      revenueStaff: null,
      serviceStaff: null,
      servicePlan: {
        id: "plan-cross-date",
        name: "Test plan",
        price: 0,
        sessionCount: 2,
        category: "PACKAGE",
      },
      customerPlanWallet: {
        id: "wallet-cross-date",
        remainingSessions: 1,
        totalSessions: 2,
        expiryDate: "2026-12-31",
        plan: { name: "Test plan" },
      },
      makeupCreditLinks: [],
      walletSessions: [{ id: "session-cross-date", status: "RESERVED" }],
      expectedAmount: null,
      attendedPeople: null,
    },
    customerSummary: {
      totalBookings: 1,
      lastVisit: null,
      isNewCustomer: true,
    },
    trial: null,
    single: null,
    checkout: null,
    checkoutToSingle: null,
  };
}

describe("booking reschedule UI wiring", () => {
  beforeEach(() => {
    harness.cursor = 0;
    harness.states = [];
    harness.pending = [];
    harness.updateBooking.mockReset();
    harness.updateBooking.mockResolvedValue({ success: true });
  });

  it("passes the selected cross-date and slot through RescheduleModal", () => {
    const onConfirm = vi.fn();
    harness.states = [
      "2026-07-20",
      "10:00",
      [
        {
          startTime: "12:00",
          capacity: 2,
          bookedCount: 0,
          available: 2,
          isEnabled: true,
          isPast: false,
        },
      ],
      null,
    ];

    let tree = renderWithHookState(() =>
      RescheduleModal({
        open: true,
        onClose: vi.fn(),
        currentDate: "2026-07-20",
        currentSlotTime: "10:00",
        people: 1,
        onConfirm,
      }),
    );
    const dateInput = findElement(
      tree,
      (element) => element.type === "input" && element.props?.type === "date",
    );
    (dateInput.props?.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "2026-07-27" },
    });

    tree = renderWithHookState(() =>
      RescheduleModal({
        open: true,
        onClose: vi.fn(),
        currentDate: "2026-07-20",
        currentSlotTime: "10:00",
        people: 1,
        onConfirm,
      }),
    );
    const slotPicker = findElement(
      tree,
      (element) =>
        typeof element.type === "function" && Array.isArray(element.props?.slots),
    );
    const slotTree = (
      slotPicker.type as (props: Record<string, unknown>) => ReactNode
    )(slotPicker.props ?? {});
    const slotButton = findElement(
      slotTree,
      (element) => element.type === "button" && element.props?.children === "12:00",
    );
    (slotButton.props?.onClick as () => void)();

    tree = renderWithHookState(() =>
      RescheduleModal({
        open: true,
        onClose: vi.fn(),
        currentDate: "2026-07-20",
        currentSlotTime: "10:00",
        people: 1,
        onConfirm,
      }),
    );
    const confirmButton = findElement(
      tree,
      (element) => element.type === "button" && element.props?.children === "確認",
    );
    (confirmButton.props?.onClick as () => void)();

    expect(onConfirm).toHaveBeenCalledWith("2026-07-27", "12:00");
  });

  it("forwards RescheduleModal values to updateBooking unchanged", async () => {
    const payload = bookingPayload();
    harness.states = [
      payload,
      null,
      false,
      false,
      null,
      null,
      true,
      false,
      false,
      false,
      false,
      false,
      0,
      payload.booking.id,
    ];

    const tree = renderWithHookState(() =>
      BookingDetailDrawer({
        open: true,
        bookingId: payload.booking.id,
        cache: {
          get: () => payload,
          load: vi.fn(),
          invalidate: vi.fn(),
        } as never,
        onClose: vi.fn(),
      }),
    );
    const modal = findElement(tree, (element) => element.type === RescheduleModal);
    (modal.props?.onConfirm as (date: string, slot: string) => void)(
      "2026-07-27",
      "12:00",
    );
    await Promise.all(harness.pending);

    expect(harness.updateBooking).toHaveBeenCalledWith("booking-cross-date", {
      bookingDate: "2026-07-27",
      slotTime: "12:00",
    });
  });
});
