import { createPr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";
import { pr2PreviewSmokeGuardReason } from "@/server/services/pr2-preview-smoke-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function maskId(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }

/** Temporary Preview-only endpoint. Vercel Deployment Protection is the sole access boundary. */
export async function GET(_request: Request) {
  const reason = pr2PreviewSmokeGuardReason();
  if (reason) {
    console.info("PR2_SMOKE_FIXTURE_ROUTE", { reason, environment: process.env.VERCEL_ENV ?? "undefined" });
    return Response.json({ status: "unavailable", reason }, { status: 404 });
  }
  try {
    const fixture = await createPr2SmokeFixture();
    return Response.json({ status: "created", customerId: maskId(fixture.customerId), requestId: maskId(fixture.requestId), expiresAt: fixture.expiresAt });
  } catch {
    const failureReason = "FIXTURE_GUARD_FAILED";
    console.info("PR2_SMOKE_FIXTURE_ROUTE", { reason: failureReason, environment: process.env.VERCEL_ENV ?? "undefined" });
    return Response.json({ status: "unavailable", reason: failureReason }, { status: 404 });
  }
}
