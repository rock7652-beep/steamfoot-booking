import { createPr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";
import { assertPr2PreviewSmokeRuntime } from "@/server/services/pr2-preview-smoke-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function maskId(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }

/** Temporary Preview-only endpoint. Vercel Deployment Protection is the sole access boundary. */
export async function GET(_request: Request) {
  try {
    assertPr2PreviewSmokeRuntime();
    const fixture = await createPr2SmokeFixture();
    return Response.json({ status: "created", customerId: maskId(fixture.customerId), requestId: maskId(fixture.requestId), expiresAt: fixture.expiresAt });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 404 });
  }
}
