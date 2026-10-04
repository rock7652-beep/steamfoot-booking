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

    if (source.includes("<ModalPanel")) {
      // Shared panels own viewport limits; payment content owns its local scroll.
      const shell = readFileSync(resolve(process.cwd(), "src/components/admin/modal-panel.tsx"), "utf8");
      const geometry = readFileSync(resolve(process.cwd(), "src/components/admin/right-sheet.module.css"), "utf8");
      expect(shell).toContain("<RightSheet");
      expect(geometry).toContain("max-height: calc(100dvh - 3rem)");
      expect(geometry).toContain("100dvh");
    } else {
      expect(source).toContain("overflow-y-auto bg-black/40 px-4 py-4");
      expect(source).toContain("max-h-[calc(100dvh-2rem)]");
    }
    expect(source).toContain("overflow-y-auto overscroll-contain");
  });
});
