import { describe, expect, it } from "vitest";
import { partitionPendingBookings, customerWalletSummary } from "@/app/(dashboard)/dashboard/customers/[id]/customer-detail-summary";

describe("customer detail summary", () => {
  const row = (date: string, slotTime: string) => ({ bookingDate: new Date(date + "T00:00:00Z"), slotTime });
  it("separates earlier dates and same-day elapsed times, sorting next appointment first", () => {
    const old = row("2026-07-20", "10:00"), earlier = row("2026-09-09", "09:00");
    const next = row("2026-09-09", "10:00"), later = row("2026-09-21", "10:00");
    expect(partitionPendingBookings([later, old, next, earlier], "2026-09-09", "10:00")).toEqual({ upcoming: [next,later], past: [earlier,old] });
  });
  it("keeps Taiwan date across UTC day boundary", () => {
    const b = { bookingDate: new Date("2026-09-08T16:00:00Z"), slotTime: "00:30" };
    expect(partitionPendingBookings([b], "2026-09-09", "00:00").upcoming).toEqual([b]);
  });
  it("does not impose the detail query's 20-row limit", () => {
    expect(partitionPendingBookings(Array.from({length:25},()=>row("2026-09-21","10:00")), "2026-09-09","10:00").upcoming).toHaveLength(25);
  });
  it("uses remaining balance for legacy wallets with no ledger", () => {
    expect(customerWalletSummary({remainingSessions:9,sessions:[]})).toEqual({available:9,pending:0,inconsistent:false});
  });
  it("counts reserved people for legacy wallets, excluding makeup and terminal bookings", () => {
    expect(customerWalletSummary({remainingSessions:9,sessions:[],bookings:[
      {bookingStatus:"PENDING",isMakeup:false,people:2},
      {bookingStatus:"CONFIRMED",isMakeup:false,people:1},
      {bookingStatus:"PENDING",isMakeup:true,people:1},
      {bookingStatus:"CANCELLED",isMakeup:false,people:2},
    ]})).toEqual({available:6,pending:3,inconsistent:false});
  });
  it("uses ledger statuses instead of counting bookings again", () => {
    expect(customerWalletSummary({remainingSessions:2,sessions:[{status:"AVAILABLE"},{status:"RESERVED"},{status:"COMPLETED"}],bookings:[{bookingStatus:"PENDING",isMakeup:false,people:9}]})).toEqual({available:1,pending:1,inconsistent:false});
  });
  it("flags a mismatched counter without inventing available sessions", () => {
    expect(customerWalletSummary({remainingSessions:9,sessions:[{status:"COMPLETED"}]})).toEqual({available:0,pending:0,inconsistent:true});
  });
});
