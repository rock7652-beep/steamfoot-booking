import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { logTaichungLineHandoff } from "@/lib/line-oauth/taichung-handoff-log";

describe("Taichung LINE handoff security telemetry", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits structured login failure telemetry without raw correlation identifiers", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const attemptId = "attempt-private-value";
    const customerId = "customer-private-value";

    logTaichungLineHandoff("login_gate_rejected", {
      attemptId,
      customerId,
      storeId: "store-taichung",
      errorCode: "line_login_conflict",
    });

    const record = JSON.parse(String(info.mock.calls[0][0]));
    expect(record).toMatchObject({
      event: "login_gate_rejected",
      stage: "login",
      storeId: "store-taichung",
      errorCode: "line_login_conflict",
    });
    expect(Date.parse(record.timestamp)).not.toBeNaN();
    expect(record.attempt).toBe(createHash("sha256").update(attemptId).digest("hex").slice(0, 12));
    expect(record.customer).toBe(createHash("sha256").update(customerId).digest("hex").slice(0, 12));
    expect(JSON.stringify(record)).not.toContain(attemptId);
    expect(JSON.stringify(record)).not.toContain(customerId);
  });
});
