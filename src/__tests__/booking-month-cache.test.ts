import { expect, it, vi } from "vitest";
import { createBookingMonthCache } from "@/app/(dashboard)/dashboard/bookings/booking-month-cache";
it("deduplicates preloading and navigation", async () => {
 const cache = createBookingMonthCache<number>();
 let resolve!: (value: number) => void;
 const loader = vi.fn(() => new Promise<number>(r => { resolve = r; }));
 const a = cache.load("2026-9", loader);
 const b = cache.load("2026-9", loader);
 expect(a).toBe(b); expect(loader).toHaveBeenCalledOnce();
 resolve(4); await a; expect(cache.get("2026-9")).toBe(4);
});
it("does not resurrect a pre-mutation response and preserves the replacement request", async () => {
 const cache = createBookingMonthCache<number>();
 let resolve!: (value: number) => void;
 const old = cache.load("month", () => new Promise<number>(r => { resolve = r; }));
 cache.invalidate();
 const fresh = cache.load("month", async () => 2);
 await fresh; resolve(9); await old;
 expect(cache.get("month")).toBe(2);
});
it("bounds snapshots and isolates store instances", () => {
 const a = createBookingMonthCache<number>(2); const b = createBookingMonthCache<number>();
 a.put("1", 1); a.put("2", 2); a.put("3", 3);
 expect(a.get("1")).toBeUndefined(); expect(b.get("3")).toBeUndefined();
 a.invalidate(); expect(a.get("3")).toBeUndefined();
});
