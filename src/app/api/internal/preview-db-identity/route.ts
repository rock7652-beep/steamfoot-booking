import { NextResponse } from "next/server";

function identity(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const userRef = url.username.match(/^postgres\.([a-z0-9]+)$/)?.[1];
    const hostRef = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    return { host: url.hostname, port: url.port, ref: userRef ?? hostRef ?? null };
  } catch { return null; }
}

/** Temporary Preview-only diagnostic; never exposes URL credentials or executes queries. */
export function GET() {
  if (process.env.VERCEL_ENV !== "preview") return new NextResponse(null, { status: 404 });
  const database = identity(process.env.DATABASE_URL);
  const direct = identity(process.env.DIRECT_URL);
  return NextResponse.json({ database, direct, refsMatch: database?.ref === direct?.ref });
}
