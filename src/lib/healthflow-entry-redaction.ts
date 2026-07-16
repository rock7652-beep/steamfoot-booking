const REDACTION_FAILED = "[REDACTION_FAILED]";
const REDACTED = "[REDACTED]";
const MAX_STACK_LINES = 6;

const SENSITIVE_QUERY_PARAM =
  /([?&](?:access_token|auth|code|credential|jwt|key|secret|signature|state|token)=)[^&#\s]+/gi;
const SENSITIVE_KEY_VALUE =
  /((?:access_token|authorization|code|credential|customer_?name|display_?name|full_?name|jwt|name|password|secret|signature|state|token)\s*[=:]\s*)[^,\s}\]]+/gi;
const SQL_VALUES =
  /((?:bind(?:ings)?|parameters|query values|sql values|values)\s*[=:]\s*)(?:\[[^\]\r\n]*\]|\{[^}\r\n]*\})/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TAIWAN_MOBILE = /(?<!\d)(?:\+?886[-\s]?9|09)\d(?:[-\s]?\d){7}(?!\d)/g;
const TAIWAN_PHONE =
  /(?<!\d)(?:\+?886[-\s]?)?(?:\(?0?\d{1,2}\)?[-\s]?)\d{3,4}[-\s]?\d{4}(?!\d)/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\b[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;

export type SanitizedHealthflowException = {
  name: string;
  message: string;
  stack: string | null;
};

export function sanitizeHealthflowLogValue(
  value: unknown,
  sensitiveValues: ReadonlyArray<string | null | undefined> = [],
): string {
  try {
    let sanitized = typeof value === "string" ? value : String(value ?? "");
    for (const sensitive of sensitiveValues) {
      if (sensitive) sanitized = sanitized.replaceAll(sensitive, REDACTED);
    }
    return sanitized
      .replace(SENSITIVE_QUERY_PARAM, `$1${REDACTED}`)
      .replace(SENSITIVE_KEY_VALUE, `$1${REDACTED}`)
      .replace(SQL_VALUES, `$1${REDACTED}`)
      .replace(EMAIL, REDACTED)
      .replace(TAIWAN_MOBILE, REDACTED)
      .replace(TAIWAN_PHONE, REDACTED)
      .replace(BEARER, `Bearer ${REDACTED}`)
      .replace(JWT, REDACTED);
  } catch {
    return REDACTION_FAILED;
  }
}

export function sanitizeHealthflowException(
  error: unknown,
  sensitiveValues: ReadonlyArray<string | null | undefined> = [],
): SanitizedHealthflowException {
  try {
    const exception = error instanceof Error ? error : new Error(String(error));
    const name = sanitizeHealthflowLogValue(exception.name, sensitiveValues);
    const message = sanitizeHealthflowLogValue(exception.message, sensitiveValues);
    const rawStack = typeof exception.stack === "string" ? exception.stack : null;
    const stack = rawStack
      ? sanitizeHealthflowLogValue(
          rawStack.split("\n").slice(0, MAX_STACK_LINES).join("\n"),
          sensitiveValues,
        )
      : null;
    return { name, message, stack };
  } catch {
    return {
      name: REDACTION_FAILED,
      message: REDACTION_FAILED,
      stack: REDACTION_FAILED,
    };
  }
}
