import { auth } from "@/lib/auth";
import { resolveAuthorizedConcreteStore } from "@/lib/store";
import { repairMessengerPageBinding } from "@/server/services/messenger-page-repair";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 5 * 60_000;
const lastRepairByActorAndStore = new Map<string, number>();

function respond(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user) return respond({ error: "unauthorized" }, 401);
  if (user.role !== "OWNER" && user.role !== "ADMIN") return respond({ error: "forbidden" }, 403);
  let storeId: string | null = null;
  try {
    const body: unknown = await request.json();
    storeId = body && typeof body === "object" && "storeId" in body && typeof body.storeId === "string" ? body.storeId.trim() : null;
  } catch { /* fail closed */ }
  if (!storeId) return respond({ error: "invalid_request" }, 400);

  let store: Awaited<ReturnType<typeof resolveAuthorizedConcreteStore>>;
  try {
    store = await resolveAuthorizedConcreteStore(user, storeId, "write");
  } catch {
    return respond({ error: "forbidden" }, 403);
  }
  if (store.slug !== "zhubei") return respond({ error: "forbidden" }, 403);
  try {
    const key = `${user.id}:${store.id}`;
    const now = Date.now();
    if (now - (lastRepairByActorAndStore.get(key) ?? 0) < MIN_INTERVAL_MS) return respond({ error: "rate_limited" }, 429);
    lastRepairByActorAndStore.set(key, now);
    const result = await repairMessengerPageBinding({ storeId: store.id, storeSlug: store.slug, requestedByUserId: user.id });
    return respond(result, result.status === "repaired" ? 200 : result.status === "blocked" ? 422 : 502);
  } catch {
    return respond({ error: "repair_unavailable" }, 503);
  }
}

export function resetMessengerRepairRateLimitForTests(): void {
  lastRepairByActorAndStore.clear();
}
