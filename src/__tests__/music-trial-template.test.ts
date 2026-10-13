import { describe, expect, it } from "vitest";
import { isMusicTrialTemplate } from "@/lib/music-trial-template";

describe("music trial teaching item recognition", () => {
  it.each([
    [{ musicTrialMode: "FREE" }, true],
    [{ musicTrialMode: "PAID" }, true],
    [{ category: "體驗" }, true],
    [{ category: "體驗課" }, true],
    [{ category: "TRIAL" }, true],
    [{ category: "吉他" }, false],
    [{ classType: "GROUP", category: "團體班" }, false],
    [null, false],
  ])("recognizes %j consistently", (template, expected) => {
    expect(isMusicTrialTemplate(template)).toBe(expected);
  });
});
