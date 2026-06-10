import { describe, expect, it } from "vitest";
import {
  remainingSessionsState,
  LOW_SESSIONS_THRESHOLD,
} from "@/lib/remaining-sessions-label";

describe("remainingSessionsState", () => {
  it("0 堂 → 無有效方案（hasValid=false、isLow=false）", () => {
    expect(remainingSessionsState(0)).toEqual({
      total: 0,
      hasValid: false,
      isLow: false,
    });
  });

  it("1 堂 → 有效且進入提醒區間", () => {
    const s = remainingSessionsState(1);
    expect(s).toEqual({ total: 1, hasValid: true, isLow: true });
  });

  it("3 堂（門檻邊界）→ 仍為提醒", () => {
    const s = remainingSessionsState(LOW_SESSIONS_THRESHOLD);
    expect(s).toEqual({ total: 3, hasValid: true, isLow: true });
  });

  it("4 堂（門檻外）→ 有效但非提醒", () => {
    const s = remainingSessionsState(4);
    expect(s).toEqual({ total: 4, hasValid: true, isLow: false });
  });

  it("大數值 → 有效非提醒", () => {
    const s = remainingSessionsState(22);
    expect(s).toEqual({ total: 22, hasValid: true, isLow: false });
  });

  it("防呆：負數視為 0（無有效方案）", () => {
    const s = remainingSessionsState(-5);
    expect(s).toEqual({ total: 0, hasValid: false, isLow: false });
  });

  it("防呆：非整數向下取整", () => {
    const s = remainingSessionsState(2.9);
    expect(s).toEqual({ total: 2, hasValid: true, isLow: true });
  });

  it("防呆：NaN 視為 0", () => {
    const s = remainingSessionsState(Number.NaN);
    expect(s).toEqual({ total: 0, hasValid: false, isLow: false });
  });
});
