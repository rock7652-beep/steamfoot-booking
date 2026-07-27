import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logDigitalButlerPublishFailure } from "@/lib/digital-butler-publish-diagnostics";

describe("digital butler publish diagnostics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs Prisma details with a diagnostic ID and redacts sensitive metadata", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Prisma.PrismaClientKnownRequestError("draftDefinition={phone:0912345678}", {
      code: "P2002",
      clientVersion: "test",
      meta: {
        target: ["flowId", "version"],
        draftDefinition: { phone: "0912345678" },
        channelSecret: "do-not-log",
      },
    });

    logDigitalButlerPublishFailure({
      diagnosticId: "DBP-ABC123DEF456",
      storeId: "store-zhubei",
      flowId: "flow-1",
      error,
      occurredAt: new Date("2026-07-27T00:00:00.000Z"),
    });

    expect(log).toHaveBeenCalledWith("digital_butler_publish_failure", expect.objectContaining({
      operation: "digital_butler_publish",
      diagnosticId: "DBP-ABC123DEF456",
      storeId: "store-zhubei",
      flowId: "flow-1",
      prismaErrorCode: "P2002",
      prismaErrorMeta: {
        target: ["flowId", "version"],
        draftDefinition: "[REDACTED]",
        channelSecret: "[REDACTED]",
      },
      errorMessage: "[REDACTED_SENSITIVE_ERROR_TEXT]",
      stack: "[REDACTED_SENSITIVE_ERROR_TEXT]",
      occurredAt: "2026-07-27T00:00:00.000Z",
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("draftDefinition={phone:0912345678}");
    expect(JSON.stringify(log.mock.calls)).not.toContain("0912345678");
    expect(JSON.stringify(log.mock.calls)).not.toContain("do-not-log");
  });
});
