import { describe, expect, it } from "vitest";
import {
  addMinutes,
  canProviderPerformServices,
  composeSpaServices,
  hasContinuousAvailability,
  summarizeSpaServices,
} from "@/lib/spa-scheduling";

describe("SPA multi-service scheduling", () => {
  it("adds a 60-minute main treatment and two 30-minute add-ons", () => {
    const items = composeSpaServices("aroma_body_60", ["head_30", "foot_30"]);
    expect(items.map((item) => item.durationMinutes)).toEqual([60, 30, 30]);
    expect(summarizeSpaServices(items)).toEqual({ durationMinutes: 120, price: 2_300 });
    expect(addMinutes("10:00", 120)).toBe("12:00");
  });

  it("uses the fixed combo duration and price without double-counting included items", () => {
    const items = composeSpaServices("sleep_combo_120", ["facial_addon_30"]);
    expect(items).toHaveLength(1);
    expect(summarizeSpaServices(items)).toEqual({ durationMinutes: 120, price: 2_200 });
    expect(canProviderPerformServices(["body", "head", "foot"], items)).toBe(true);
    expect(canProviderPerformServices(["body", "head"], items)).toBe(false);
  });

  it("requires the full continuous service and buffer window to be empty", () => {
    const occupiedRanges = [{ startTime: "12:00", durationMinutes: 30 }];
    expect(hasContinuousAvailability({
      startTime: "10:00",
      serviceMinutes: 90,
      bufferMinutes: 30,
      closeTime: "21:00",
      occupiedRanges,
    })).toBe(true);
    expect(hasContinuousAvailability({
      startTime: "10:00",
      serviceMinutes: 120,
      bufferMinutes: 30,
      closeTime: "21:00",
      occupiedRanges,
    })).toBe(false);
  });

  it("rejects a service that would run past closing time", () => {
    expect(hasContinuousAvailability({
      startTime: "20:00",
      serviceMinutes: 90,
      closeTime: "21:00",
      occupiedRanges: [],
    })).toBe(false);
  });

  it("does not allow an add-on to be booked by itself", () => {
    expect(() => composeSpaServices("head_30")).toThrow("加購項目不能單獨成為主療程");
  });
});
