import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync(
  "src/app/(customer)/health/new/health-record-form.tsx",
  "utf8",
);

describe("health record form mobile date layout", () => {
  it("constrains the native date input inside its card on narrow iOS screens", () => {
    expect(form).toContain(
      'className="mt-2 block w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-earth-200"',
    );
    expect(form).toContain(
      'className="block min-h-[52px] w-full min-w-0 max-w-full appearance-none border-0 bg-white px-4 text-base text-earth-900"',
    );
  });
});
