import { describe, expect, it } from "vitest";
import { createLatestRequestGate } from "@/lib/latest-request-gate";

describe("latest request gate", () => {
  it("prevents an older date response from replacing the latest slots", async () => {
    const gate = createLatestRequestGate();
    const visibleSlots: string[] = [];
    let finishOlderRequest!: () => void;

    const olderRequest = gate.issue();
    const olderResponse = new Promise<void>((resolve) => {
      finishOlderRequest = resolve;
    }).then(() => {
      if (gate.isCurrent(olderRequest)) visibleSlots.splice(0, visibleSlots.length, "09:00");
    });

    const newerRequest = gate.issue();
    if (gate.isCurrent(newerRequest)) visibleSlots.splice(0, visibleSlots.length, "14:00");
    finishOlderRequest();
    await olderResponse;

    expect(visibleSlots).toEqual(["14:00"]);
  });

  it("invalidates an in-flight response as soon as the date changes", () => {
    const gate = createLatestRequestGate();
    const requestId = gate.issue();

    gate.invalidate();

    expect(gate.isCurrent(requestId)).toBe(false);
  });
});
