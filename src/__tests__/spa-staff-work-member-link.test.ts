import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SPA staff work member switch", () => {
  it("returns web OAuth sessions to the shared member portal", () => {
    const source = readFileSync(
      "src/app/(liff)/liff/spa-work/staff-work-screen.tsx",
      "utf8",
    );

    expect(source).toContain('href={`/s/${storeSlug}/book`}');
    expect(source).not.toContain('href={`/s/${storeSlug}/liff`}');
  });
});
