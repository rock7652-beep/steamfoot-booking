import { recoverPr2SmokeOrphan } from "@/server/services/line-rebind-smoke-fixture";
import { pr2PreviewSmokeGuardReason } from "@/server/services/pr2-preview-smoke-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request) {
  const reason = pr2PreviewSmokeGuardReason();
  if (reason) return Response.json({ status: "unavailable", reason }, { status: 404 });
  try {
    const result = await recoverPr2SmokeOrphan();
    return Response.json({ status: result.removed ? "recovered" : "absent" });
  } catch { return Response.json({ status: "unavailable", reason: "FIXTURE_GUARD_FAILED" }, { status: 404 }); }
}
