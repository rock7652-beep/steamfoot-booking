import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({permission:vi.fn(),query:vi.fn(),booking:vi.fn()}));
vi.mock("@/lib/permissions",()=>({requirePermission:m.permission,checkPermission:vi.fn()}));
vi.mock("@/lib/session",()=>({requireSession:vi.fn(),requireStaffSession:vi.fn()}));
vi.mock("@/lib/db",()=>({prisma:{customer:{findMany:m.query}}}));
vi.mock("@/lib/spa-db",()=>({spaPrisma:{}}));
vi.mock("@/server/queries/booking",()=>({getBookingDetailForUser:m.booking}));
import { searchCustomers } from "@/server/queries/customer";
import { fetchBookingDetail } from "@/server/actions/booking-drawer";
beforeEach(()=>{vi.clearAllMocks();m.permission.mockRejectedValue(new Error("feature unavailable"));});
it("blocks hidden customer search before disclosing personal data",async()=>{
 await expect(searchCustomers("林",10,"store-a")).rejects.toThrow("feature unavailable");
 expect(m.permission).toHaveBeenCalledWith("customer.read");
 expect(m.query).not.toHaveBeenCalled();
});
it("blocks direct booking drawer actions before loading details",async()=>{
 await expect(fetchBookingDetail("booking-a","store-a")).rejects.toThrow("feature unavailable");
 expect(m.permission).toHaveBeenCalledWith("booking.read",undefined,{storeId:"store-a"});
 expect(m.booking).not.toHaveBeenCalled();
});
