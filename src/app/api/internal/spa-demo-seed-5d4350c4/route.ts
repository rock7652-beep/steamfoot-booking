import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runSpaDemoSeed } from "../../../../../prisma/seed-spa-demo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_TOKEN_HASH = "5d4350c4fabf57e508e1685f7eed285d188c52879c4a9208689836878c7cf501";

function isAuthorized(token: string | null): boolean {
  if (!token) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(EXPECTED_TOKEN_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "feat/spa-demo-store" ||
    !isAuthorized(request.nextUrl.searchParams.get("token"))
  ) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const apply = request.nextUrl.searchParams.get("mode") === "apply";
  try {
    const result = await runSpaDemoSeed(apply);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SPA_DEMO_SEED_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
