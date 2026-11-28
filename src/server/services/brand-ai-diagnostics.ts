export type BrandAiStage =
  | "provider"
  | "configuration"
  | "budget"
  | "transport"
  | "envelope"
  | "validation"
  | "storage"
  | "delivery"
  | "memory";
export type BrandAiDiagnostic = {
  attempt: number;
  stage: BrandAiStage;
  code: string;
  sourceIds: string[];
};
export type BrandAiDiagnostics = {
  model: string;
  availableSourceIds: string[];
  usage: {
    attempt: number;
    inputTokens: number | null;
    outputTokens: number | null;
  }[];
  attempts: number;
  route: "generated" | "repaired" | "knowledge_fallback" | "uncertain";
  failures: BrandAiDiagnostic[];
};
const validationCodes = new Set([
  "INVALID_HANDOFF",
  "INVALID_SOURCES",
  "MISSING_SUBSCRIPTION_TERM",
  "UNAPPROVED_URL",
  "INVALID_TEXT",
  "UNVERIFIED_REFUND_POLICY",
  "UNAPPROVED_PRICE",
  "UNVERIFIABLE_PRICE",
  "PLAN_PRICE_MISMATCH",
  "UNAPPROVED_TERMS",
  "UNSUPPORTED_CLAIM",
  "OPERATION_CLAIM",
  "UNAVAILABLE_SERVICE_PROMISE",
  "PRIVATE_DATA",
]);
export function brandAiValidationCode(error: unknown) {
  return error instanceof Error && validationCodes.has(error.message)
    ? error.message
    : "OUTPUT_SCHEMA";
}
