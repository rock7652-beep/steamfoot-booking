import { dryRunPr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";
import { pr2PreviewSmokeGuardReason } from "@/server/services/pr2-preview-smoke-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request) {
  const reason = pr2PreviewSmokeGuardReason();
  if (reason) return Response.json({ status: "unavailable", reason }, { status: 404 });
  try { return Response.json({ status: "dry_run", result: await dryRunPr2SmokeFixture() }); }
  catch { return Response.json({ status: "unavailable", reason: "FIXTURE_GUARD_FAILED" }, { status: 404 }); }
}
