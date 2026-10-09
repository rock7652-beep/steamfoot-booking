import { payloadSchema, sanitizeConsultationPayload, type ConsultationPayload } from "@/lib/consultation-lead";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { consultationDatabaseAllowed } from "@/server/services/consultation-lead-access";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fixed receiver: never accept an upstream URL or notification recipient from the form.
const RECEIVER = "https://script.google.com/macros/s/AKfycbyLTou6qvTiqPTGPShNRCY8F53FW98xr9PzbjRpE0n-ios3zdJAyAv_3aVdtTLJYwlr/exec";

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // The public form submits only from the same origin. No CORS proxy is exposed.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return reply({ ok: false, code: "INVALID_ORIGIN" }, 403);
  }
  let payload: ConsultationPayload;
  try {
    const raw = await request.text();
    if (raw.length > 24000) return reply({ ok: false, code: "INVALID_INPUT" }, 400);
    payload = sanitizeConsultationPayload(payloadSchema.parse(JSON.parse(raw)));
  } catch {
    return reply({ ok: false, code: "INVALID_INPUT" }, 400);
  }

  const sheetPayload = { ...payload, otherNeed: [
    payload.bookingMode && `預約方式：${payload.bookingMode}`,
    payload.courseFormat && `授課型態：${payload.courseFormat}`,
    payload.websiteUrl && `店家官網：${payload.websiteUrl}`,
    payload.facebookUrl && `Facebook：${payload.facebookUrl}`,
    payload.instagramUrl && `Instagram：${payload.instagramUrl}`,
    payload.otherNeed,
  ].filter(Boolean).join("\n") };
  // Existing receivers keep these in the notes column; avoid sending two copies.
  delete sheetPayload.websiteUrl; delete sheetPayload.facebookUrl; delete sheetPayload.instagramUrl;
  const sheetBody = JSON.stringify(sheetPayload);
  if (sheetBody.length > 24000) return reply({ ok: false, code: "INVALID_INPUT" }, 400);
  // Only an authenticated HQ synthetic check may save to the explicitly isolated
  // Preview database. Preview never reaches the external receiver or notifications.
  const preview = isPreviewExternalIntegrationBlocked();
  const hqEnabled = process.env.CONSULTATION_HQ_ENABLED === "true";
  if (process.env.CONSULTATION_PREVIEW_INTAKE_ENABLED === "true" && !preview)
    return reply({ ok: false, code: "PREVIEW_CONTEXT_REQUIRED" }, 503);
  if (preview && (!hqEnabled || process.env.CONSULTATION_PREVIEW_INTAKE_ENABLED !== "true"))
    return reply({ ok: false, code: "PREVIEW_DELIVERY_DISABLED" }, 503);
  if (hqEnabled && !consultationDatabaseAllowed()) return reply({ ok: false, code: "INTAKE_UNAVAILABLE" }, 503);
  if (preview) {
    if (!payload.storeName.startsWith("【HQ測試】")) return reply({ ok: false, code: "SYNTHETIC_TEST_ONLY" }, 400);
    try {
      const { requireAdminSession } = await import("@/lib/session");
      const { requirePermission } = await import("@/lib/permissions");
      const user = await requireAdminSession();
      if (user.role !== "ADMIN") return reply({ ok: false, code: "HQ_REQUIRED" }, 403);
      await requirePermission("staff.manage");
    } catch { return reply({ ok: false, code: "HQ_REQUIRED" }, 403); }
  }
  let savedHqId: string | undefined;
  let intake: typeof import("@/server/services/consultation-lead-intake") | undefined;
  try {
    if (hqEnabled) {
      intake = await import("@/server/services/consultation-lead-intake");
      const { lead } = await intake.saveConsultationLead(payload, preview ? { previewOnly: true } : undefined);
      savedHqId = lead.id;
      if (preview) return reply({ ok: true, saved: true, requestId: payload.requestId,
        hqSaved: true, sheetStatus: "NOT_SENT_PREVIEW" });
      if (lead.sheetStatus !== "PENDING") {
        return reply({ ok: true, saved: true, requestId: payload.requestId,
          hqSaved: true, sheetStatus: lead.sheetStatus === "CONFIRMED" || lead.sheetStatus === "LEGACY_IMPORTED" ? lead.sheetStatus : "UNKNOWN" });
      }
    }
    if (payload.formVersion === "fitness-v2") {
      // Apps Script is deployed separately. Never POST the new contract to an old receiver.
      let ready = false;
      try {
        const health = await fetch(RECEIVER, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const info = await health.json();
        ready = health.ok && info.ok === true && info.capabilities?.includes("fitness-v2")
          && (payload.needs.length <= 4 || info.capabilities?.includes("fitness-unlimited-needs"));
      } catch { /* No POST has occurred; the caller may safely retry later. */ }
      if (!ready) return savedHqId
        ? reply({ ok: true, saved: true, requestId: payload.requestId, hqSaved: true, sheetStatus: "PENDING" })
        : reply({ ok: false, code: "RECEIVER_UPDATE_REQUIRED" }, 503);
      if (payload.contactWay === "目前暫不考慮") {
        payload.contactName = ""; payload.phone = ""; payload.lineId = ""; payload.time = "";
      }
    }
    if (savedHqId && intake && !(await intake.claimConsultationDelivery(savedHqId))) {
      // A concurrent request may already have sent the Sheet POST. Never resend.
      return reply({ ok: true, saved: true, requestId: payload.requestId, hqSaved: true, sheetStatus: "UNKNOWN" });
    }
    // Do not retry POST: a lost response does not mean the row was not written.
    const response = await fetch(RECEIVER, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // Keep the answer visible in the existing receiver's notes column too.
      body: sheetBody,
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
    if (savedHqId && intake) {
      const marked = await intake.markConsultationDelivery(savedHqId, "CONFIRMED");
      return reply({ ok: true, saved: true, requestId: payload.requestId, hqSaved: true,
        sheetStatus: marked ? "CONFIRMED" : "UNKNOWN" });
    }
    return reply({ ok: true, saved: true, requestId: payload.requestId });
  } catch (error) {
    if (intake && error instanceof intake.ConsultationRequestConflictError)
      return reply({ ok: false, code: "REQUEST_CONFLICT" }, 409);
    if (savedHqId && intake) {
      try { await intake.markConsultationDelivery(savedHqId, "UNKNOWN"); } catch { /* Do not undo durable HQ receipt. */ }
      return reply({ ok: true, saved: true, requestId: payload.requestId, hqSaved: true, sheetStatus: "UNKNOWN" });
    }
    // Never leak upstream errors or claim that the record was not saved.
    return reply({ ok: false, code: "SAVE_UNCONFIRMED" }, 502);
  }
}
