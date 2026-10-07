import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderPublicTrialList, PUBLIC_ADDON_GROUPS } from "@/lib/public-marketing-copy";

describe("public marketing consistency", () => {
  it("keeps the static application trial conditions aligned with shared page copy", () => {
    const html = readFileSync("public/pricing/apply.html", "utf8");
    const block = html.match(/<!-- public-trial-copy:start -->\n<ul>\n([\s\S]*?)\n<\/ul>\n<!-- public-trial-copy:end -->/);
    expect(block?.[1]).toBe(renderPublicTrialList());
  });
  it("gives every paid addon a working feature destination", () => {
    const featurePage = readFileSync("src/app/pricing/features/page.tsx", "utf8");
    const ids = PUBLIC_ADDON_GROUPS.flatMap(group => group.features.map(feature => feature.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(featurePage).toMatch(new RegExp(`id: "${id}"`));
  });
});
