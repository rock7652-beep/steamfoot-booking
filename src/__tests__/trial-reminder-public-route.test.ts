import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: (handler: unknown) => handler }));
import { proxy } from "@/proxy";

const invoke = proxy as unknown as (request: NextRequest & { auth: null }) => Response;
describe("signed trial reminder entry", () => {
  for (const store of ["zhubei", "hsinchu", "taichung"]) {
    for (const action of ["confirm", "reschedule", "cancel"]) {
      for (const method of ["GET", "POST"]) {
        it(`${store} ${action} ${method} reaches token validation without login`, () => {
          const request = new NextRequest(`https://www.steamfoot.com/trial-booking/manage?token=booking.${store}.expiry.signature&action=${action}`, { method, headers: { cookie: "store-slug=zhubei" } });
          Object.assign(request, { auth: null });
          const response = invoke(request as NextRequest & { auth: null });
          expect(response.headers.get("location")).toBeNull();
          expect(response.headers.get("x-middleware-next")).toBe("1");
          expect(request.nextUrl.searchParams.get("token")).toContain(store);
        });
      }
    }
  }
  it("does not expose other trial routes", () => {
    const request = new NextRequest("https://www.steamfoot.com/trial-booking/private");
    Object.assign(request, { auth: null });
    expect(invoke(request as NextRequest & { auth: null }).status).toBe(307);
  });
});
