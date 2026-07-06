import { z } from "zod";

import {
  HEALTHFLOW_CALLBACK_IDEMPOTENCY_HEADER,
  HEALTHFLOW_CALLBACK_SIGNATURE_HEADER,
  HEALTHFLOW_CALLBACK_TIMESTAMP_HEADER,
  reserveHealthflowCallbackIdempotencyKey,
  validateHealthflowCallbackIdempotencyKey,
  verifyHealthflowCallbackAuth,
} from "@/lib/healthflow-link-callback-auth";
import {
  validateHealthflowBridgeCallback,
  verifyHealthflowBridgeState,
} from "@/lib/healthflow-identity-bridge";
import { prisma } from "@/lib/db";

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

  const state = await verifyHealthflowBridgeState(parsedBody.data.state);
  if (!state.ok) {
    return json(callbackErrorStatus(state.reason), {
      status: "error",
      code: state.reason,
    });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: state.payload.customerId },
    select: { id: true, storeId: true },
  });

  const bridge = await validateHealthflowBridgeCallback({
    state: parsedBody.data.state,
    profileId: parsedBody.data.profileId,
    customer,
  });
  if (!bridge.ok) {
    return json(callbackErrorStatus(bridge.reason), {
      status: "error",
      code: bridge.reason,
    });
  }

  await reserveHealthflowCallbackIdempotencyKey(idempotency.key);

  return json(202, {
    status: "accepted",
    mode: "validated_only",
    linked: false,
    replayProtection: "contract_only",
  });
}
