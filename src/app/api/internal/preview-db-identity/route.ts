import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";

function identity(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const userRef = url.username.match(/^postgres\.([a-z0-9]+)$/)?.[1];
    const hostRef = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    return { host: url.hostname, port: url.port, ref: userRef ?? hostRef ?? null };
  } catch { return null; }
}

/** Temporary, Preview-only and secret-protected runtime connection diagnostic. */
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse(null, { status: 404 });
  }
  const database = identity(process.env.DATABASE_URL);
  const direct = identity(process.env.DIRECT_URL);
  const [mainQuery, spaQuery] = await Promise.all([
    prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
    spaPrisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
  ]);
  // Do not expose even non-sensitive infrastructure identifiers to callers.
  // Project members with Vercel runtime-log access perform the one-time check.
  console.info("[preview-db-identity]", {
    database,
    direct,
    refsMatch: database?.ref === direct?.ref,
    mainQuery: mainQuery.length === 1,
    spaQuery: spaQuery.length === 1,
  });
  return new NextResponse(null, { status: 204 });
}
