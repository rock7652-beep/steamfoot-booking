import { auth } from "@/lib/auth";
import { resolveAuthorizedConcreteStore } from "@/lib/store";
import { diagnoseMessengerGraph } from "@/server/services/messenger-graph-diagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 60_000;
const lastDiagnosisByActorAndStore = new Map<string, number>();

function respond(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return respond({ error: "unauthorized" }, 401);
  if (user.role !== "OWNER" && user.role !== "ADMIN") return respond({ error: "forbidden" }, 403);

  let storeId = "";
  try {
    const body: unknown = await request.json();
    storeId = body && typeof body === "object" && "storeId" in body && typeof body.storeId === "string" ? body.storeId.trim() : "";
  } catch { /* fail closed */ }
  if (!storeId) return respond({ error: "invalid_request" }, 400);

  let store: Awaited<ReturnType<typeof resolveAuthorizedConcreteStore>>;
  try { store = await resolveAuthorizedConcreteStore(user, storeId, "write"); } catch { return respond({ error: "forbidden" }, 403); }
  if (store.slug !== "zhubei") return respond({ error: "forbidden" }, 403);

  const key = `${user.id}:${store.id}`;
  const now = Date.now();
  if (now - (lastDiagnosisByActorAndStore.get(key) ?? 0) < MIN_INTERVAL_MS) return respond({ error: "rate_limited" }, 429);
  lastDiagnosisByActorAndStore.set(key, now);

  try {
    return respond(await diagnoseMessengerGraph({ actorUserId: user.id, storeId: store.id }));
  } catch {
    return respond({ error: "diagnosis_unavailable" }, 503);
  }
}

export function resetMessengerGraphDiagnosticRateLimitForTests(): void {
  lastDiagnosisByActorAndStore.clear();
}
