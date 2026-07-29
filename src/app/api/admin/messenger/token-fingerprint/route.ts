import { auth } from "@/lib/auth";
import { resolveAuthorizedConcreteStore } from "@/lib/store";
import { diagnoseMessengerPageToken, getTokenFormat } from "@/server/services/messenger-token-fingerprint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 60_000;
const lastDiagnosisByActorAndStore = new Map<string, number>();

function respond(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function validFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{12}$/.test(value);
}

function validFormat(value: unknown): value is ReturnType<typeof getTokenFormat> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).tokenLength === "number"
    && typeof (value as Record<string, unknown>).hasWrappingQuotes === "boolean"
    && typeof (value as Record<string, unknown>).hasNewline === "boolean"
    && typeof (value as Record<string, unknown>).trimChangesLength === "boolean";
}

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return respond({ error: "unauthorized" }, 401);
  if (user.role !== "OWNER" && user.role !== "ADMIN") return respond({ error: "forbidden" }, 403);

  let body: { storeId?: unknown; localFingerprint?: unknown; localFormat?: unknown } = {};
  try { body = await request.json() as typeof body; } catch { /* fail closed */ }
  const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
  if (!storeId || !validFingerprint(body.localFingerprint) || !validFormat(body.localFormat)) return respond({ error: "invalid_request" }, 400);

  let store: Awaited<ReturnType<typeof resolveAuthorizedConcreteStore>>;
  try { store = await resolveAuthorizedConcreteStore(user, storeId, "write"); } catch { return respond({ error: "forbidden" }, 403); }
  if (store.slug !== "zhubei") return respond({ error: "forbidden" }, 403);

  const key = `${user.id}:${store.id}`;
  const now = Date.now();
  if (now - (lastDiagnosisByActorAndStore.get(key) ?? 0) < MIN_INTERVAL_MS) return respond({ error: "rate_limited" }, 429);
  lastDiagnosisByActorAndStore.set(key, now);

  try {
    return respond(await diagnoseMessengerPageToken({ actorUserId: user.id, storeId: store.id, localFingerprint: body.localFingerprint, localFormat: body.localFormat }));
  } catch {
    return respond({ error: "diagnosis_unavailable" }, 503);
  }
}

export function resetMessengerTokenFingerprintRateLimitForTests(): void {
  lastDiagnosisByActorAndStore.clear();
}
