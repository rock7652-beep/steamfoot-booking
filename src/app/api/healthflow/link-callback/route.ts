import { z } from "zod";

import {
  HEALTHFLOW_CALLBACK_IDEMPOTENCY_HEADER,
  HEALTHFLOW_CALLBACK_SIGNATURE_HEADER,
  HEALTHFLOW_CALLBACK_TIMESTAMP_HEADER,
  validateHealthflowCallbackIdempotencyKey,
  verifyHealthflowCallbackAuth,
} from "@/lib/healthflow-link-callback-auth";
import { recordHealthflowCallbackReplayAndLinkCustomer } from "@/lib/healthflow-link-callback-replay";
import {
  fingerprintHealthflowBridgeState,
  validateHealthflowBridgeCallback,
  verifyHealthflowBridgeState,
} from "@/lib/healthflow-identity-bridge";
import { prisma } from "@/lib/db";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  profileId: z.string().min(1),
  state: z.string().min(1),
});

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

function callbackErrorStatus(reason: string): number {
  if (
    reason === "missing_callback_secret" ||
    reason === "missing_secret"
  ) {
    return 500;
  }
  if (
    reason === "missing_signature" ||
    reason === "invalid_signature" ||
    reason === "missing_timestamp" ||
    reason === "invalid_timestamp" ||
    reason === "stale_timestamp"
  ) {
    return 401;
  }
  if (reason === "customer_not_found") return 404;
  if (reason === "requested_store_not_found") return 404;
  if (reason === "feature_unavailable") return 403;
  if (
    reason === "idempotency_key_conflict" ||
    reason === "state_jti_replay"
  ) {
    return 409;
  }
  return 400;
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const idempotency = validateHealthflowCallbackIdempotencyKey(
    req.headers.get(HEALTHFLOW_CALLBACK_IDEMPOTENCY_HEADER),
  );
  if (!idempotency.ok) {
    return json(400, { status: "error", code: idempotency.reason });
  }

  const auth = await verifyHealthflowCallbackAuth({
    rawBody,
    signature: req.headers.get(HEALTHFLOW_CALLBACK_SIGNATURE_HEADER),
    timestamp: req.headers.get(HEALTHFLOW_CALLBACK_TIMESTAMP_HEADER),
  });
  if (!auth.ok) {
    return json(callbackErrorStatus(auth.reason), {
      status: "error",
      code: auth.reason,
    });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return json(400, { status: "error", code: "invalid_json" });
  }

  const parsedBody = bodySchema.safeParse(parsedJson);
  if (!parsedBody.success) {
    return json(400, { status: "error", code: "invalid_body" });
  }
  const fingerprint = await fingerprintHealthflowBridgeState(parsedBody.data.state);
  console.info("[healthflow bridge] state trace", {
    phase: "callback_received",
    fingerprint,
  });

  const state = await verifyHealthflowBridgeState(parsedBody.data.state);
  if (!state.ok) {
    console.warn("[healthflow bridge] state trace", {
      phase: "state_verification",
      code: state.reason,
      status: callbackErrorStatus(state.reason),
      fingerprint,
    });
    return json(callbackErrorStatus(state.reason), {
      status: "error",
      code: state.reason,
    });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: state.payload.identityCustomerId },
    select: { id: true },
  });

  const requestedStore = await prisma.store.findUnique({
    where: { id: state.payload.requestedStoreId },
    select: { id: true },
  });
  if (!requestedStore) {
    return json(callbackErrorStatus("requested_store_not_found"), {
      status: "error",
      code: "requested_store_not_found",
    });
  }
  try {
    await requireStoreFeature(
      requestedStore.id,
      FEATURES.AI_HEALTH_SUMMARY,
    );
  } catch {
    return json(callbackErrorStatus("feature_unavailable"), {
      status: "error",
      code: "feature_unavailable",
    });
  }

  const bridge = await validateHealthflowBridgeCallback({
    state: parsedBody.data.state,
    profileId: parsedBody.data.profileId,
    customer,
  });
  if (!bridge.ok) {
    console.warn("[healthflow bridge] state trace", {
      phase: "state_verification",
      code: bridge.reason,
      status: callbackErrorStatus(bridge.reason),
      fingerprint,
    });
    return json(callbackErrorStatus(bridge.reason), {
      status: "error",
      code: bridge.reason,
    });
  }

  const replay = await recordHealthflowCallbackReplayAndLinkCustomer({
    idempotencyKey: idempotency.key,
    stateJti: bridge.payload.jti,
    callbackTimestampMs: auth.timestampMs,
    linkedAtMs: Date.now(),
    profileId: bridge.profileId,
    customerId: bridge.payload.identityCustomerId,
    storeId: bridge.payload.requestedStoreId,
    rawBody,
    state: parsedBody.data.state,
  });
  if (!replay.ok) {
    console.warn("[healthflow bridge] state trace", {
      phase: "state_verification",
      code: replay.reason,
      status: callbackErrorStatus(replay.reason),
      fingerprint,
    });
    return json(callbackErrorStatus(replay.reason), {
      status: "error",
      code: replay.reason,
    });
  }

  console.info("[healthflow bridge] state trace", {
    phase: "state_verification",
    code: null,
    status: 202,
    fingerprint,
  });
  return json(202, {
    status: "accepted",
    mode: "linked",
    linked: true,
    replayProtection:
      replay.mode === "duplicate" ? "durable_duplicate" : "durable_consumed",
  });
}
