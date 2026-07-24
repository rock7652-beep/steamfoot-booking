import { prisma } from "@/lib/db";
import { getLineBotInfo } from "@/lib/line";
import { requireAdminSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const HSINCHU_STORE_ID = "store-hsinchu";
const EXPECTED_BASIC_ID = "@059rrqpw";

/**
 * One-time, tightly bounded Production cutover.
 *
 * This endpoint cannot select a store or destination supplied by a caller.
 * It derives the destination from the configured Hsinchu LINE token, verifies
 * the expected OA identity, and only updates the single Hsinchu store row.
 * Once the cutover has been verified, this route is removed.
 */
export async function POST() {
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json({ ok: false, code: "PRODUCTION_ONLY" }, { status: 404 });
  }

  try {
    await requireAdminSession();
  } catch {
    return Response.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  const botInfo = await getLineBotInfo(HSINCHU_STORE_ID);
  if (!botInfo.ok) {
    return Response.json({ ok: false, code: botInfo.code }, { status: 503 });
  }
  if (botInfo.data.basicId !== EXPECTED_BASIC_ID) {
    return Response.json({ ok: false, code: "BASIC_ID_MISMATCH" }, { status: 409 });
  }

  const existingOwner = await prisma.store.findFirst({
    where: {
      lineDestination: botInfo.data.userId,
      id: { not: HSINCHU_STORE_ID },
    },
    select: { id: true },
  });
  if (existingOwner) {
    return Response.json({ ok: false, code: "DESTINATION_ALREADY_ASSIGNED" }, { status: 409 });
  }

  await prisma.store.update({
    where: { id: HSINCHU_STORE_ID },
    data: { lineDestination: botInfo.data.userId },
    select: { id: true },
  });

  const stores = await prisma.store.findMany({
    where: { id: { in: [HSINCHU_STORE_ID, "store-zhubei", "store-taichung"] } },
    select: { id: true, lineDestination: true },
  });
  const hsinchu = stores.find((store) => store.id === HSINCHU_STORE_ID);
  const destinations = stores
    .map((store) => store.lineDestination)
    .filter((value): value is string => Boolean(value));

  if (
    hsinchu?.lineDestination !== botInfo.data.userId ||
    new Set(destinations).size !== destinations.length
  ) {
    return Response.json({ ok: false, code: "POST_UPDATE_VERIFICATION_FAILED" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    basicId: botInfo.data.basicId,
    destinationSuffix: botInfo.data.userId.slice(-4),
    verifiedStoreCount: stores.length,
  });
}
