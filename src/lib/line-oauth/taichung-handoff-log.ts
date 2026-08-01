import { createHash } from "node:crypto";

type HandoffContext = {
  attemptId?: string;
  customerId?: string;
  storeId?: string;
  errorCode?: string;
};

/** Logs only short, one-way correlation values; never log LINE IDs or credentials. */
export function logTaichungLineHandoff(event: string, context: HandoffContext = {}) {
  const shortHash = (value: string | undefined) =>
    value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : undefined;
  console.info(JSON.stringify({
    event,
    attempt: shortHash(context.attemptId),
    customer: shortHash(context.customerId),
    storeId: context.storeId,
    errorCode: context.errorCode,
  }));
}
