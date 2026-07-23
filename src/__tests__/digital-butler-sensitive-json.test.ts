import { describe, expect, it } from "vitest";
import {
  assertDigitalButlerSubmittedAnswersSafe,
  DigitalButlerSensitiveAnswerError,
} from "@/lib/digital-butler-sensitive-json";

describe("Digital Butler submitted answer JSON guard", () => {
  it("allows non-sensitive answer snapshots", () => {
    expect(() => assertDigitalButlerSubmittedAnswersSafe({
      treatmentGoal: { value: "放鬆", label: "想改善疲勞" },
    })).not.toThrow();
  });

  it.each([
    { phone: "0912345678" },
    { answer: "請聯繫我 0912-345-678" },
    { email: "member@example.com" },
    { answer: "member@example.com" },
    { lineUserId: "U1234567890abcdef1234567890abcdef" },
  ])("rejects sensitive plaintext in submittedAnswers", (value) => {
    expect(() => assertDigitalButlerSubmittedAnswersSafe(value)).toThrow(
      DigitalButlerSensitiveAnswerError,
    );
  });
});
