import { Prisma } from "@prisma/client";

const SENSITIVE_KEY = /(?:phone|mobile|tel|email|line(?:User)?Id|identity|contact)/i;
const TAIWAN_MOBILE = /(?:^|\D)(?:\+?886|0)9\d{8}(?!\d)/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const LINE_USER_ID = /\bU[0-9a-f]{32}\b/i;

/** Sensitive answers belong only in the encrypted phone columns, never JSON. */
export class DigitalButlerSensitiveAnswerError extends Error {
  constructor() {
    super("DIGITAL_BUTLER_SENSITIVE_ANSWER_JSON_REJECTED");
  }
}

function hasSensitiveString(value: string): boolean {
  const compact = value.replace(/[\s()\-]/g, "");
  return TAIWAN_MOBILE.test(compact) || EMAIL.test(value) || LINE_USER_ID.test(value);
}

function assertSafe(value: unknown): void {
  if (typeof value === "string") {
    if (hasSensitiveString(value)) throw new DigitalButlerSensitiveAnswerError();
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertSafe);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) throw new DigitalButlerSensitiveAnswerError();
      assertSafe(nestedValue);
    }
  }
}

/**
 * Defends both service and repository boundaries against accidental PII copies
 * in `submittedAnswers`; phone values must be supplied through encrypted fields.
 */
export function assertDigitalButlerSubmittedAnswersSafe(
  submittedAnswers: Prisma.InputJsonValue,
): void {
  assertSafe(submittedAnswers);
}
