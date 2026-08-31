import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("booking calendar route store scope", () => {
  const source = readFileSync(
    "src/app/(dashboard)/dashboard/bookings/page.tsx",
    "utf8",
  );

  it("does not reapply a stale viewed-store cookie over the route store", () => {
    expect(source).toContain("const fallbackStoreId = activeStoreId");
    expect(source).not.toContain(
      "const fallbackStoreId = storeIdForViewContext(",
    );
  });
});
