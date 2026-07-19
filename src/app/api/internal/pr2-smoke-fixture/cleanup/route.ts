import { cleanupPr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";
import { pr2PreviewSmokeGuardReason } from "@/server/services/pr2-preview-smoke-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Temporary Preview-only endpoint. Vercel Deployment Protection is the sole access boundary. */
export async function GET(_request: Request) {
  const reason = pr2PreviewSmokeGuardReason();
  if (reason) {
    console.info("PR2_SMOKE_FIXTURE_ROUTE", { reason, environment: process.env.VERCEL_ENV ?? "undefined" });
    return Response.json({ status: "unavailable", reason }, { status: 404 });
  }
  try {
    const fixture = await cleanupPr2SmokeFixture();
    return Response.json({ status: fixture.removed ? "cleaned" : "absent" });
  } catch {
    const failureReason = "FIXTURE_GUARD_FAILED";
    console.info("PR2_SMOKE_FIXTURE_ROUTE", { reason: failureReason, environment: process.env.VERCEL_ENV ?? "undefined" });
    return Response.json({ status: "unavailable", reason: failureReason }, { status: 404 });
  }
}
