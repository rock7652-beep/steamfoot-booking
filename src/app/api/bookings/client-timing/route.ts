import { z } from "zod";
import { requirePermission } from "@/lib/permissions";

const schema = z.object({
  operation: z.enum(["complete", "revert"]),
  outcome: z.enum(["saved", "error", "unknown"]),
  responseMs: z.number().int().min(0).max(600_000),
  committedMs: z.number().int().min(0).max(600_000),
}).strict();
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403, headers });
  }
  // Only fixed labels and bounded durations; never log request bodies or IDs.
  let payload: z.infer<typeof schema>;
  try {
    const body = await request.text();
    if (body.length > 512) return new Response(null, { status: 400, headers });
    payload = schema.parse(JSON.parse(body));
  } catch { return new Response(null, { status: 400, headers }); }
  try { await requirePermission("booking.read"); }
  catch { return new Response(null, { status: 403, headers }); }
  console.info("[BOOKING_CLIENT_PERF]", JSON.stringify(payload));
  return new Response(null, { status: 204, headers });
}
