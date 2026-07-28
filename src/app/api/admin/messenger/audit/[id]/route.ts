import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveAuthorizedConcreteStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isAuditAdministrator(role: string): boolean {
  return role === "ADMIN" || role === "OWNER";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user;
  if (!user) return noStoreJson({ error: "unauthorized" }, 401);
  if (!isAuditAdministrator(user.role)) return noStoreJson({ error: "forbidden" }, 403);

  const { id } = await context.params;
  const run = await prisma.messengerAuditRun.findUnique({ where: { id } });
  if (!run) return noStoreJson({ error: "not_found" }, 404);

  try {
    await resolveAuthorizedConcreteStore(user, run.storeId, "read");
  } catch {
    return noStoreJson({ error: "forbidden" }, 403);
  }

  return noStoreJson({
    id: run.id,
    storeId: run.storeId,
    requestedByUserId: run.requestedByUserId,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    status: run.status,
    appValidated: run.appValidated,
    pageTokenMatches: run.pageTokenMatches,
    callbackMatches: run.callbackMatches,
    configuredFields: run.configuredFields,
    missingFields: run.missingFields,
    pageAttached: run.pageAttached,
    callsSafeSummary: run.callsSafeSummary,
    errorCode: run.errorCode,
  });
}
