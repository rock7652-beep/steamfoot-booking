import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const paymentModalFiles = [
  "src/app/(dashboard)/dashboard/bookings/collect-trial-modal.tsx",
  "src/app/(dashboard)/dashboard/bookings/collect-single-modal.tsx",
  "src/app/(dashboard)/dashboard/bookings/correct-trial-collection-modal.tsx",
  "src/app/(dashboard)/dashboard/payments/confirm-button.tsx",
];

describe("payment modal viewport scrolling", () => {
  it.each(paymentModalFiles)("keeps the confirm action reachable in %s", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    expect(source).toContain("overflow-y-auto bg-black/40 px-4 py-4");
    expect(source).toContain("max-h-[calc(100dvh-2rem)]");
    expect(source).toContain("overflow-y-auto overscroll-contain");
  });
});
