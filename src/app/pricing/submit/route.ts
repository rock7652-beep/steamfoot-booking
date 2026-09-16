import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fixed receiver: never accept an upstream URL or notification recipient from the form.
const RECEIVER = "https://script.google.com/macros/s/AKfycbyLTou6qvTiqPTGPShNRCY8F53FW98xr9PzbjRpE0n-ios3zdJAyAv_3aVdtTLJYwlr/exec";
const text = z.string().trim().max(2000).optional();
const payloadSchema = z.object({
  requestId: z.string().uuid(),
  storeName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  industry: z.string().trim().min(1).max(200),
  storeCount: text, staffCount: text, members: text, hasSystem: text,
  systemName: text, otherNeed: text, contactWay: text, time: text,
  bookingMode: z.enum(["固定時段，每個時段可接待固定人數", "依服務項目，安排技師／芳療師與服務時間", "不確定，希望協助判斷"]).optional(),
  phone: text, lineId: text, source: text, medium: text, campaign: text,
  content: text, landing: text, pageUrl: text, referrer: text, device: text,
  formVersion: z.literal("fitness-v2").optional(),
  priorityNeed: z.string().trim().max(200).optional(),
  needs: z.array(z.string().trim().min(1).max(200)).min(1),
  replaceReason: z.array(z.string().max(200)).max(20),
}).superRefine((data, ctx) => {
  const fitness = data.formVersion === "fitness-v2" && data.source === "fitness-intake";
  const noContact = fitness && data.contactWay === "目前暫不考慮";
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (data.formVersion && !fitness) invalid("Invalid form source");
  if (!fitness && data.needs.length > 3) invalid("Legacy forms allow three needs");
  if (new Set(data.needs).size !== data.needs.length) invalid("Duplicate needs");
  if (!noContact && (!data.contactName || !(data.phone || data.lineId))) invalid("Contact required");
  if (fitness) {
    if (!["申請體驗帳號", "預約 20 分鐘線上示範", "先透過 LINE 了解", "目前暫不考慮"].includes(data.contactWay || "")) invalid("Invalid intent");
    const unknown = data.needs.includes("還不確定，想先聊聊");
    if (unknown ? data.needs.length !== 1 || Boolean(data.priorityNeed) : !data.priorityNeed || !data.needs.includes(data.priorityNeed)) invalid("Invalid priority");
  }
});

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
    if (payload.formVersion === "fitness-v2") {
      // Apps Script is deployed separately. Never POST the new contract to an old receiver.
      let ready = false;
      try {
        const health = await fetch(RECEIVER, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const info = await health.json();
        ready = health.ok && info.ok === true && info.capabilities?.includes("fitness-v2")
          && (payload.needs.length <= 4 || info.capabilities?.includes("fitness-unlimited-needs"));
      } catch { /* No POST has occurred; the caller may safely retry later. */ }
      if (!ready) return reply({ ok: false, code: "RECEIVER_UPDATE_REQUIRED" }, 503);
      if (payload.contactWay === "目前暫不考慮") {
        payload.contactName = ""; payload.phone = ""; payload.lineId = ""; payload.time = "";
      }
    }
    // Do not retry POST: a lost response does not mean the row was not written.
    const response = await fetch(RECEIVER, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // Keep the answer visible in the existing receiver's notes column too.
      body: JSON.stringify({ ...payload, otherNeed: payload.bookingMode
        ? [`預約方式：${payload.bookingMode}`, payload.otherNeed].filter(Boolean).join("\n")
        : payload.otherNeed }),
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
