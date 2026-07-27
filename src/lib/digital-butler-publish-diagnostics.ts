import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

const SENSITIVE_KEY = /token|secret|password|phone|email|line.*id|draft.?definition|answer|customer/i;
const MAX_DIAGNOSTIC_TEXT_LENGTH = 12_000;

function sanitizeText(value: string): string {
  if (/draft.?definition|submitted.?answers|channel.?secret|access.?token/i.test(value)) {
    return "[REDACTED_SENSITIVE_ERROR_TEXT]";
  }
  return value
    .replace(/(?:postgres(?:ql)?:\/\/|mysql:\/\/|mongodb(?:\+srv)?:\/\/)[^\s"']+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b09\d{8}\b/g, "[REDACTED_PHONE]")
    .replace(/\bU[a-f\d]{32}\b/gi, "[REDACTED_LINE_USER_ID]")
    .slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH);
}

function sanitizeMeta(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (depth >= 4) return "[TRUNCATED]";
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeMeta(item, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeMeta(entryValue, entryKey, depth + 1),
      ]),
    );
  }
  return String(value);
}

function prismaDetails(error: unknown): { code: string | null; meta: unknown } {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { code: error.code, meta: sanitizeMeta(error.meta ?? null) };
  }
  const candidate = error as { code?: unknown; meta?: unknown };
  return {
    code: typeof candidate?.code === "string" ? candidate.code : null,
    meta: sanitizeMeta(candidate?.meta ?? null),
  };
}

export function createDigitalButlerPublishDiagnosticId(): string {
  return `DBP-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

export function logDigitalButlerPublishFailure(input: {
  diagnosticId: string;
  storeId: string | null;
  flowId: string;
  error: unknown;
  occurredAt?: Date;
}): void {
  const details = prismaDetails(input.error);
  const errorName = input.error instanceof Error ? input.error.name : "UnknownError";
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);
  const stack = input.error instanceof Error ? input.error.stack ?? null : null;

  console.error("digital_butler_publish_failure", {
    operation: "digital_butler_publish",
    diagnosticId: input.diagnosticId,
    storeId: input.storeId,
    flowId: input.flowId,
    prismaErrorCode: details.code,
    prismaErrorMeta: details.meta,
    errorName: sanitizeText(errorName),
    errorMessage: sanitizeText(errorMessage),
    stack: stack ? sanitizeText(stack) : null,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
  });
}
