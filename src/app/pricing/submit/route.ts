import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fixed receiver: never accept an upstream URL or notification recipient from the form.
const RECEIVER = "https://script.google.com/macros/s/AKfycbyLTou6qvTiqPTGPShNRCY8F53FW98xr9PzbjRpE0n-ios3zdJAyAv_3aVdtTLJYwlr/exec";
const text = z.string().trim().max(2000).optional();
const payloadSchema = z.object({
  requestId: z.string().uuid(),
  storeName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  industry: z.string().trim().min(1).max(200),
  storeCount: text, staffCount: text, members: text, hasSystem: text,
  systemName: text, otherNeed: text, contactWay: text, time: text,
  phone: text, lineId: text, source: text, medium: text, campaign: text,
  content: text, landing: text, pageUrl: text, referrer: text, device: text,
  needs: z.array(z.string().max(200)).min(1).max(3),
  replaceReason: z.array(z.string().max(200)).max(20),
}).refine((data) => Boolean(data.phone || data.lineId));

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // The public form submits only from the same origin. No CORS proxy is exposed.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return reply({ ok: false, code: "INVALID_ORIGIN" }, 403);
  }
  let payload: z.infer<typeof payloadSchema>;
  try {
    const raw = await request.text();
    if (raw.length > 24000) return reply({ ok: false, code: "INVALID_INPUT" }, 400);
    payload = payloadSchema.parse(JSON.parse(raw));
  } catch {
    return reply({ ok: false, code: "INVALID_INPUT" }, 400);
  }

  try {
    // Do not retry POST: a lost response does not mean the row was not written.
    const response = await fetch(RECEIVER, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(50000),
    });
    if (!response.ok) throw new Error("Receiver HTTP error");
    const result = await response.json();
    // Legacy receiver returns ok:true only after appendRow and MailApp succeed.
    // V2 additionally confirms the saved row and echoes this submission's ID.
    const confirmed = result?.ok === true && (result.version === undefined
      ? result.saved === undefined
      : result.version === 2 && result.saved === true && result.requestId === payload.requestId);
    if (!confirmed) throw new Error("Save unconfirmed");
    if (result.notification === "failed") console.error("Store check saved; notification failed");
    return reply({ ok: true, saved: true, requestId: payload.requestId });
  } catch {
    // Never leak upstream errors or claim that the record was not saved.
    return reply({ ok: false, code: "SAVE_UNCONFIRMED" }, 502);
  }
}
