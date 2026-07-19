import { diagnosePr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";
import { pr2PreviewSmokeGuardReason } from "@/server/services/pr2-preview-smoke-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function maskId(value: string | undefined) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : undefined; }

export async function GET(_request: Request) {
  const reason = pr2PreviewSmokeGuardReason();
  if (reason) return Response.json({ status: "unavailable", reason }, { status: 404 });
  try {
    const result = await diagnosePr2SmokeFixture();
    return Response.json({ status: "diagnosed", counts: result.counts, consistent: result.consistent, ids: { customerId: maskId(result.ids.customerId), requestId: maskId(result.ids.requestId) } });
  } catch { return Response.json({ status: "unavailable", reason: "FIXTURE_GUARD_FAILED" }, { status: 404 }); }
}
