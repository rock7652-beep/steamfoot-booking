import { describe, expect, it, vi } from "vitest";
import {
  acquireBookingSlotLocks,
  bookingSlotTimeVariants,
  canonicalizeBookingSlotTime,
} from "@/server/services/booking-slot-lock";

describe("booking slot transaction lock", () => {
  it("normalizes the accepted legacy seconds format", () => {
    expect(canonicalizeBookingSlotTime("10:00")).toBe("10:00");
    expect(canonicalizeBookingSlotTime("10:00:00")).toBe("10:00");
    expect(bookingSlotTimeVariants("10:00")).toEqual(["10:00", "10:00:00"]);
  });

  it("rejects non-canonical slot values", () => {
    expect(() => canonicalizeBookingSlotTime("10:00:30")).toThrow();
    expect(() => canonicalizeBookingSlotTime("9:00")).toThrow();
  });

  it("deduplicates and sorts identities before acquiring locks", async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, identity: string) => {
        calls.push(identity);
        return [{ pg_advisory_xact_lock: null }];
      }),
    };

    await acquireBookingSlotLocks(tx as never, [
      { storeId: "store-b", bookingDate: "2026-08-01", slotTime: "10:00" },
      { storeId: "store-a", bookingDate: "2026-08-01", slotTime: "11:00" },
      { storeId: "store-a", bookingDate: "2026-08-01", slotTime: "10:00:00" },
      { storeId: "store-a", bookingDate: "2026-08-01", slotTime: "10:00" },
    ]);

    expect(calls).toEqual([
      "store-a\u001f2026-08-01\u001f10:00",
      "store-a\u001f2026-08-01\u001f11:00",
      "store-b\u001f2026-08-01\u001f10:00",
    ]);
  });
});
