import { cleanupPr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";
import { assertPr2PreviewSmokeRuntime } from "@/server/services/pr2-preview-smoke-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Temporary Preview-only endpoint. Vercel Deployment Protection is the sole access boundary. */
export async function GET(_request: Request) {
  try {
    assertPr2PreviewSmokeRuntime();
    const fixture = await cleanupPr2SmokeFixture();
    return Response.json({ status: fixture.removed ? "cleaned" : "absent" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 404 });
  }
}
