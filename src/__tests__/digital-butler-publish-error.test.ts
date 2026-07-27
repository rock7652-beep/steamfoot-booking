import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { digitalButlerPublishErrorMessage } from "@/lib/digital-butler-publish-error";

describe("digital butler publish errors", () => {
  it("translates a version unique conflict without exposing Prisma invocation details", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });

    expect(digitalButlerPublishErrorMessage(error)).toBe(
      "流程版本發生衝突（P2002），請重新整理後再試。",
    );
  });

  it("identifies a transaction serialization conflict as retryable", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Transaction failed", {
      code: "P2034",
      clientVersion: "test",
    });

    expect(digitalButlerPublishErrorMessage(error)).toBe(
      "流程發布遇到並行更新（P2034），請重新整理後再試。",
    );
  });
});
