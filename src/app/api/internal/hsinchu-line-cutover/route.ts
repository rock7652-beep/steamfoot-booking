import { prisma } from "@/lib/db";
import { getLineBotInfo } from "@/lib/line";

export const dynamic = "force-dynamic";

const HSINCHU_STORE_ID = "store-hsinchu";
const ZHUBEI_STORE_ID = "e182e256-98ca-4c78-970b-d4b118066c51";
const TAICHUNG_STORE_ID = "store-taichung";
const EXPECTED_BASIC_ID = "@059rrqpw";
const EXPECTED_OLD_DESTINATION = "Ufa6a3615f9acb1c52437b7ddf0eba25c";

/**
 * One-time, tightly bounded Production cutover.
 *
 * This endpoint cannot select a store or destination supplied by a caller and
 * is only available while Hsinchu still has the exact pre-cutover destination.
 * It derives the destination from the configured Hsinchu LINE token, verifies
 * the expected OA identity, and only updates the single Hsinchu store row.
 * Once the cutover has been verified, this route is removed.
 */
export async function POST() {
  if (process.env.VERCEL_ENV !== "production") {
    return Response.json({ ok: false, code: "PRODUCTION_ONLY" }, { status: 404 });
  }

  const current = await prisma.store.findUnique({
    where: { id: HSINCHU_STORE_ID },
    select: { lineDestination: true },
  });
  if (current?.lineDestination !== EXPECTED_OLD_DESTINATION) {
    return Response.json({ ok: false, code: "CUTOVER_NOT_AVAILABLE" }, { status: 410 });
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

  const updated = await prisma.store.updateMany({
    where: {
      id: HSINCHU_STORE_ID,
      lineDestination: EXPECTED_OLD_DESTINATION,
    },
    data: { lineDestination: botInfo.data.userId },
  });
  if (updated.count !== 1) {
    return Response.json({ ok: false, code: "CUTOVER_NOT_AVAILABLE" }, { status: 410 });
  }

  const stores = await prisma.store.findMany({
    where: { id: { in: [HSINCHU_STORE_ID, ZHUBEI_STORE_ID, TAICHUNG_STORE_ID] } },
    select: { id: true, lineDestination: true },
  });
  const hsinchu = stores.find((store) => store.id === HSINCHU_STORE_ID);
  const destinations = stores
    .map((store) => store.lineDestination)
    .filter((value): value is string => Boolean(value));

  if (
    hsinchu?.lineDestination !== botInfo.data.userId ||
    stores.length !== 3 ||
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
