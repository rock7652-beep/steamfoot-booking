import { auth } from "@/lib/auth";
import { resolveAuthorizedConcreteStore } from "@/lib/store";
import { createMessengerAuditRun } from "@/server/services/messenger-production-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 60_000;
const lastAuditByActorAndStore = new Map<string, number>();

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isAuditAdministrator(role: string): boolean {
  return role === "ADMIN" || role === "OWNER";
}

async function authorizeAudit(storeId: string) {
  const session = await auth();
  const user = session?.user;
  if (!user) return { response: noStoreJson({ error: "unauthorized" }, 401) } as const;
  if (!isAuditAdministrator(user.role)) return { response: noStoreJson({ error: "forbidden" }, 403) } as const;

  try {
    const store = await resolveAuthorizedConcreteStore(user, storeId, "write");
    return { user, store } as const;
  } catch {
    return { response: noStoreJson({ error: "forbidden" }, 403) } as const;
  }
}

export async function POST(request: Request) {
  let storeId: string | null = null;
  try {
    const body: unknown = await request.json();
    storeId = body && typeof body === "object" && "storeId" in body && typeof body.storeId === "string"
      ? body.storeId.trim()
      : null;
  } catch {
    // Invalid JSON is deliberately handled as a generic invalid request.
  }
  if (!storeId) return noStoreJson({ error: "invalid_request" }, 400);

  const authorization = await authorizeAudit(storeId);
  if ("response" in authorization) return authorization.response!;

  const key = `${authorization.user.id}:${authorization.store.id}`;
  const now = Date.now();
  const lastAuditAt = lastAuditByActorAndStore.get(key) ?? 0;
  if (now - lastAuditAt < MIN_INTERVAL_MS) return noStoreJson({ error: "rate_limited" }, 429);
  lastAuditByActorAndStore.set(key, now);

  try {
    const run = await createMessengerAuditRun({
      storeId: authorization.store.id,
      storeSlug: authorization.store.slug,
      requestedByUserId: authorization.user.id,
    });
    return noStoreJson({ auditRunId: run.id });
  } catch {
    return noStoreJson({ error: "audit_unavailable" }, 503);
  }
}

export function resetMessengerAuditRateLimitForTests(): void {
  lastAuditByActorAndStore.clear();
}
