import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard sidebar navigation", () => {
  const source = readFileSync("src/components/sidebar.tsx", "utf8");

  it("uses full-page navigation for expanded and collapsed sidebar items", () => {
    expect(source.match(/<a\s+href=\{`\$\{dashboardPrefix\}\$\{item\.href\}`\}/g)).toHaveLength(2);
    expect(source).not.toContain("useLinkStatus");
    expect(source).not.toContain("NavItemPending");
  });
});
