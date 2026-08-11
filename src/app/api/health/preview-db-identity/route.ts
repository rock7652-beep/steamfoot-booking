import { prisma } from "@/lib/db";
import { isPreview } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const PREVIEW_PROJECT_REF = "ttworfzgwejdeolegkxl";

function projectRef(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const direct = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
    const pooled = url.username.match(/^postgres\.([a-z0-9]+)$/i)?.[1];
    return direct ?? pooled ?? null;
  } catch {
    return null;
  }
}

/**
 * Preview-only guard for controlled acceptance testing. It never returns a
 * database URL, database name, credentials, customer data, or raw query data.
 */
export async function GET() {
  if (!isPreview()) return new Response(null, { status: 404 });
  if (
    projectRef(process.env.DATABASE_URL) !== PREVIEW_PROJECT_REF ||
    projectRef(process.env.DIRECT_URL) !== PREVIEW_PROJECT_REF
  ) {
    return Response.json({ ok: false }, { status: 503 });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, projectRef: PREVIEW_PROJECT_REF });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
