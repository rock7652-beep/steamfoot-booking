import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("booking request-key client wiring", () => {
  it.each([
    ["Web customer form", "app/(customer)/book/booking-form.tsx", "web-customer"],
    ["Web calendar form", "app/(customer)/book/new/booking-calendar-view.tsx", "web-customer"],
    ["Customer detail staff form", "app/(dashboard)/dashboard/customers/[id]/create-booking-form.tsx", "customer-detail"],
  ])("%s uses one lifecycle key and resets it after success", (_name, path, submissionSource) => {
    const contents = source(path);
    expect(contents).toContain("useBookingRequestKey()");
    expect(contents).toContain("requestKey.current()");
    expect(contents).toContain(`source: "${submissionSource}"`);
    expect(contents).toContain("requestKey.complete()");
    expect(contents).toContain("requestKey.handleError(result.error)");
  });

  it.each([
    ["LIFF member", "app/(liff)/liff/member-booking/member-booking-form.tsx"],
    ["LIFF trial", "app/(liff)/liff/trial-booking/trial-booking-form.tsx"],
  ])("%s forwards the stable key through its wrapper", (_name, path) => {
    const contents = source(path);
    expect(contents).toContain("useBookingRequestKey()");
    expect(contents).toContain("requestKey: requestKey.current()");
    expect(contents).toContain('case "ok":');
    expect(contents).toContain("requestKey.complete()");
    expect(contents).toContain('case "idempotency_key_reused":');
    expect(contents).toContain('requestKey.handleError("IDEMPOTENCY_KEY_REUSED")');
  });

  it("staff trial drawer starts a new key on open and resets after success", () => {
    const contents = source("app/(dashboard)/dashboard/_components/trial-booking-drawer.tsx");
    expect(contents).toContain("useBookingRequestKey()");
    expect(contents).toContain("requestKey.complete();");
    expect(contents).toContain("requestKey: requestKey.current()");
    expect(contents).toContain("requestKey.handleError(r.error)");
  });

  it("server-rendered staff booking form carries a hydrated UUID hidden field", () => {
    const page = source("app/(dashboard)/dashboard/bookings/new/page.tsx");
    const field = source("components/booking-request-key-field.tsx");
    expect(page).toContain("<BookingRequestKeyField />");
    expect(page).toContain('formData.get("requestKey")');
    expect(page).toContain('source: "staff-booking"');
    expect(field).toContain('name="requestKey"');
    expect(field).toContain("useState(createBookingRequestKey)");
  });
});
