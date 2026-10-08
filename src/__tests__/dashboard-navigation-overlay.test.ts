import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "vitest";

const sidebar = readFileSync("src/components/sidebar.tsx", "utf8");
const guide = readFileSync("src/components/operation-guide-shell.tsx", "utf8");

describe("dashboard navigation overlay layering", () => {
  it("marks the whole mobile overlay, including its backdrop, without changing desktop navigation", () => {
    assert.match(sidebar, /<div data-dashboard-navigation-overlay className=\{industryModule === "spa" \? "fixed inset-0 z-40 md:hidden" : "fixed inset-0 z-40 lg:hidden"\}>/);
    assert.equal(sidebar.match(/data-dashboard-navigation-overlay/g)?.length, 1);
    assert.doesNotMatch(sidebar, /<aside[^>]*data-dashboard-navigation-overlay/);
  });

  it("keeps navigation above the guide's raised header and below its dialog", () => {
    const layer = (marker: string) => Number(guide.match(new RegExp(`\\[data-operation-guide-shell\\] \\[${marker}\\] \\{ z-index: (\\d+); \\}`))?.[1]);
    const header = layer("data-dashboard-header");
    const navigation = layer("data-dashboard-navigation-overlay");
    const dialog = Number(guide.match(/<dialog[\s\S]*?className="[^"]*\bz-\[(\d+)\]/)?.[1]);
    assert.ok(header > 0);
    assert.ok(navigation > header);
    assert.ok(navigation < dialog);
  });
});
