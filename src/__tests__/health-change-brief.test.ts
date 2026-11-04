// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthChangeBrief } from "@/components/health-change-brief";
import type { TrendPoint } from "@/lib/health-service";

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const point = (weight: number | null): TrendPoint => ({
  measuredAt: "2026-11-04T01:00:00Z", weight, bmi: null, bodyFat: null,
  muscleMass: null, boneMass: null, visceralFat: null, bmr: null,
  bodyWater: null, metabolicAge: null,
});
const container = document.createElement("div");
const root = createRoot(container);
afterEach(() => { act(() => root.render(null)); });
const render = (trend: TrendPoint[]) => act(() => root.render(React.createElement(HealthChangeBrief, { trend })));
const select = (count: number) => act(() => {
  const input = container.querySelector("select")!;
  input.value = String(count);
  input.dispatchEvent(new Event("change", { bubbles: true }));
});

describe("LIFF measurement change range", () => {
  it("defaults to the previous measurement on the same day and switches ranges", () => {
    render([point(82.6), point(82.8), point(82.6), point(83)]);
    expect(container.querySelector("select")?.value).toBe("2");
    expect(container.textContent).toContain("體重 +0.4kg");
    select(3);
    expect(container.textContent).toContain("體重 +0.2kg");
    select(4);
    expect(container.textContent).toContain("體重 +0.4kg");
    select(2);
    expect(container.querySelector("select")?.value).toBe("2");
  });

  it("keeps the range control usable when selected records lack common metrics", () => {
    render([point(80), point(null), point(83)]);
    expect(container.textContent).toContain("此範圍沒有可比較的共同指標");
    select(3);
    expect(container.textContent).toContain("體重 +3kg");
  });

  it("shows only available ranges and handles a shrinking history", () => {
    render([point(80), point(81), point(82), point(83)]);
    select(4);
    render([point(82), point(83)]);
    expect(container.querySelectorAll("option")).toHaveLength(1);
    expect(container.querySelector("select")?.value).toBe("2");
    expect(container.textContent).toContain("體重 +1kg");
    render([point(83)]);
    expect(container.innerHTML).toBe("");
    render([]);
    expect(container.innerHTML).toBe("");
  });
});
