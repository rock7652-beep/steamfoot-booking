import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/(dashboard)/dashboard/bookings/new/page.tsx", import.meta.url), "utf8");
const form = readFileSync(new URL("../app/(dashboard)/dashboard/bookings/new/booking-create-form.tsx", import.meta.url), "utf8");

describe("staff booking failure retention wiring", () => {
  it("opts STEAMFOOT in without changing the SPA action flow", () => {
    expect(page).toContain("preserveOnFailure={!isSpaStore}");
    expect(form).toContain("preserveOnFailure = false");
    expect(page).toContain("if (isSpaStore) {");
    expect(page).toContain("/dashboard/spa-schedule?date=");
  });

  it("returns a business error without redirecting away from the draft", () => {
    const errorBranch = page.slice(page.indexOf("if (!result.success)"), page.indexOf("return (\n    <PageShell>"));
    expect(errorBranch).toContain('return { error: result.error || "預約建立失敗" }');
    expect(errorBranch).not.toContain("/dashboard/bookings/new?");
    expect(errorBranch).toContain("/dashboard/bookings?view=day");
  });

  it("avoids native action reset and retains uncontrolled field nodes", () => {
    expect(form).toContain("action={preserveOnFailure ? undefined");
    expect(form).toContain("event.preventDefault()");
    expect(form).toContain("const result = await action(data)");
    expect(form).not.toContain(".reset()");
    expect(form).not.toContain("localStorage");
    expect(form).toContain('role="alert"');
  });

  it("locks duplicate submits and disables fields while pending", () => {
    expect(form).toContain("if (submissionLock.current) return");
    expect(form.indexOf("submissionLock.current = true")).toBeLessThan(form.indexOf("await action(data)"));
    expect(form).toContain("<fieldset disabled={!hydrated || submitting}");
    expect(form).toContain('method={preserveOnFailure ? "post" : undefined}');
    expect(form).toContain("disabled={submitting}");
    expect(form).toContain("finally {");
  });

  it("keeps the request key after uncertain network failures and preserves framework redirects", () => {
    const handler = form.slice(form.indexOf("} catch (error)"), form.indexOf("const value = useMemo"));
    expect(handler).toContain("unstable_rethrow(error)");
    expect(handler).not.toContain("setRequestKey");
    expect(form).toContain("isBookingRequestKeyMismatch(result.error)");
  });
});
