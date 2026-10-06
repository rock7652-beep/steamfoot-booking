import { expect, it } from "vitest";
import { redactAuditValue } from "@/lib/audit-redact";
it("redacts nested authentication material while retaining business evidence", () => {
  expect(redactAuditValue({ amount: 800, before: [{ passwordHash: "secret", access_token: "secret", name: "店長" }] })).toEqual({ amount: 800, before: [{ passwordHash: "[已隱藏]", access_token: "[已隱藏]", name: "店長" }] });
});
