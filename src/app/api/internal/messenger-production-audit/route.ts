import { timingSafeEqual } from "node:crypto";
import { missingMessengerProductionAuditConfig, runMessengerProductionAudit } from "@/lib/messenger-production-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 60_000;
let lastAuditAt = 0;

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function noStoreEmpty(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

function tokenMatches(request: Request): boolean {
  const expected = process.env.MESSENGER_AUDIT_TOKEN?.trim();
  const supplied = request.headers.get("authorization");
  if (!expected || !supplied?.startsWith("Bearer ")) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied.slice("Bearer ".length), "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (process.env.MESSENGER_AUDIT_ENABLED !== "true") return noStoreEmpty(404);
  if (!tokenMatches(request)) return noStoreEmpty(401);

  const now = Date.now();
  if (now - lastAuditAt < MIN_INTERVAL_MS) return noStoreJson({ error: "rate_limited" }, 429);
  lastAuditAt = now;

  const missingConfig = missingMessengerProductionAuditConfig("zhubei");
  if (missingConfig.length > 0) return noStoreJson({ error: "audit_configuration_incomplete", missingConfig }, 503);

  try {
    return noStoreJson(await runMessengerProductionAudit("zhubei"));
  } catch {
    return noStoreJson({ error: "audit_unavailable" }, 503);
  }
}
