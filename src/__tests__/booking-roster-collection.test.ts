// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type { BookingDrawerPayload } from "@/server/actions/booking-drawer";
const mocks = vi.hoisted(() => ({ read: vi.fn(), complete: vi.fn(), revert: vi.fn(),collect:vi.fn() }));
vi.mock("@/server/actions/booking", () => ({ markCompleted: mocks.complete, markNoShow: vi.fn(), cancelBooking: vi.fn(), revertBookingStatus: vi.fn(), updateBooking: vi.fn() }));
vi.mock("@/server/actions/booking-drawer", () => ({ fetchBookingDetail: mocks.read }));
vi.mock("@/lib/booking-client-transport", () => ({ readBookingDetail: mocks.read, collectBookingTrialPayment:mocks.collect,correctBookingTrialCollection:vi.fn(), updateBookingStatus: (id: string, operation: string, input?: unknown) => operation === "complete" ? mocks.complete(id, input) : mocks.revert(id) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/admin/right-sheet", () => ({ RightSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? children : null }));
vi.mock("@/components/customer-page-link", () => ({ CustomerPageLink: ({children}: {children: React.ReactNode}) => children }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: ({children}: {children: React.ReactNode}) => children }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-note-editor", () => ({ BookingNoteEditor: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/booking-service-note-editor", () => ({ BookingServiceNoteEditor: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/no-show-modal", () => ({ NoShowModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-trial-modal", () => ({ CollectTrialModal: ({open,onClose}:{open:boolean;onClose:()=>void}) => open ? React.createElement("button",{"data-payment":"trial",onClick:onClose},"取消收款") : null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal", () => ({ CorrectTrialCollectionModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/attendance-modal", () => ({ AttendanceModal: ({open}:{open:boolean}) => open ? React.createElement("div",{"data-payment":"attendance"},"實到人數") : null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/collect-single-modal", () => ({ CollectSingleModal: ({open}:{open:boolean}) => open ? React.createElement("div",{"data-payment":"single"},"單次收款") : null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/adjust-checkout-modal", () => ({ AdjustCheckoutModal: () => null }));
vi.mock("@/app/(dashboard)/dashboard/bookings/reschedule-modal", () => ({ RescheduleModal: () => null }));
vi.mock("@/components/customer-labels",()=>({CustomerLabels:()=>null}));
vi.mock("@/components/operation-history-button",()=>({OperationHistoryButton:()=>null}));
import { BookingDetailDrawer } from "@/app/(dashboard)/dashboard/bookings/booking-detail-drawer";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  mocks.read.mockReset();
  mocks.complete.mockReset();
  mocks.revert.mockReset();
});

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




function collectible(type="FIRST_TRIAL",people=1,collected=false):BookingDrawerPayload {
 const payload=bookingPayload();payload.booking.bookingType=type;payload.booking.people=people;
 if(type==="FIRST_TRIAL")payload.trial={collected,collectedAmount:null,collectedMethod:null,collectedAt:null,collectedTransactionId:null,canCorrect:false,settings:{allowEdit:false,defaultPrice:499,minPrice:499,maxPrice:499}};
 else payload.single={collected,collectedAmount:null,collectedOriginalAmount:null,collectedDiscountAmount:null,collectedMethod:null,collectedAt:null,defaultPrice:799};
 return payload;
}
it.each([["FIRST_TRIAL",1,"trial"],["FIRST_TRIAL",2,"attendance"],["SINGLE",1,"single"]])("routes %s %i people to the existing %s confirmation",async(type,people,modal)=>{
 const payload=collectible(String(type),Number(people));mocks.read.mockResolvedValue(payload);const host=document.createElement("div"),root=createRoot(host);
 try {await act(async()=>root.render(React.createElement(BookingDetailDrawer,{open:true,bookingId:payload.booking.id,initialIntent:"collect",onClose:()=>{}})));expect(host.querySelector(`[data-payment="${modal}"]`)).toBeTruthy();expect(mocks.complete).not.toHaveBeenCalled();}
 finally {await act(async()=>root.unmount());}
});
it.each(["collected","COMPLETED","readonly"])("does not open payment for %s",async(condition)=>{
 const payload=collectible("FIRST_TRIAL",1,condition==="collected");if(condition==="COMPLETED")payload.booking.bookingStatus=condition;
 mocks.read.mockResolvedValue(payload);const host=document.createElement("div"),root=createRoot(host);
 try {await act(async()=>root.render(React.createElement(BookingDetailDrawer,{open:true,bookingId:payload.booking.id,initialIntent:"collect",readOnly:condition==="readonly",onClose:()=>{}})));expect(host.querySelector("[data-payment]")).toBeNull();}
 finally {await act(async()=>root.unmount());}
});
it("waits for full detail and does not reopen a cancelled collection on rerender",async()=>{
 let resolve!:(payload:BookingDrawerPayload)=>void;mocks.read.mockReturnValue(new Promise(r=>resolve=r));const payload=collectible();const host=document.createElement("div"),root=createRoot(host);
 const render=()=>root.render(React.createElement(BookingDetailDrawer,{open:true,bookingId:payload.booking.id,initialIntent:"collect",onClose:()=>{}}));
 try {await act(async()=>render());expect(host.querySelector("[data-payment]")).toBeNull();await act(async()=>resolve(payload));expect(host.querySelector('[data-payment="trial"]')).toBeTruthy();await act(async()=>host.querySelector<HTMLButtonElement>('[data-payment="trial"]')!.click());await act(async()=>render());expect(host.querySelector("[data-payment]")).toBeNull();expect(mocks.complete).not.toHaveBeenCalled();}
 finally {await act(async()=>root.unmount());}
});
