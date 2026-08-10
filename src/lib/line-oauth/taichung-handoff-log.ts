import { createHash } from "node:crypto";

type HandoffContext = {
  attemptId?: string;
  customerId?: string;
  storeId?: string;
  errorCode?: string;
};

function stageFor(event: string) {
  if (event.startsWith("activation_")) return "first_activation";
  if (event.startsWith("auth_session_") || event.startsWith("coordinator_") || event.startsWith("login_")) return "login";
  if (event.startsWith("bridge_")) return "oauth_bridge";
  if (event.startsWith("completion_") || event.startsWith("finalize_")) return "completion";
  if (event.startsWith("final_redirect_")) return "redirect";
  return "line_handoff";
}

/**
 * Security telemetry for the Taichung LINE Login handoff.
 *
 * It logs only fixed event/error codes, the store identifier, a timestamp, and
 * short one-way correlation values. Never add names, phone numbers, LINE IDs,
 * OAuth tokens, passwords, or any other credentials to this context.
 */
export function logTaichungLineHandoff(event: string, context: HandoffContext = {}) {
  const shortHash = (value: string | undefined) =>
    value ? createHash("sha256").update(value).digest("hex").slice(0, 12) : undefined;
  console.info(JSON.stringify({
    event,
    stage: stageFor(event),
    timestamp: new Date().toISOString(),
    attempt: shortHash(context.attemptId),
    customer: shortHash(context.customerId),
    storeId: context.storeId,
    errorCode: context.errorCode,
  }));
}
