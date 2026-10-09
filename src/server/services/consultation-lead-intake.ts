import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  payloadSchema,
  sanitizeConsultationPayload,
  type ConsultationPayload,
} from "@/lib/consultation-lead";
import { isPreview } from "@/lib/runtime-env";
import {
  consultationDatabaseAllowed,
  consultationPreviewIntakeEnabled,
} from "@/server/services/consultation-lead-access";

export function consultationHqEnabled(): boolean {
  return process.env.CONSULTATION_HQ_ENABLED === "true";
}

function requireConsultationDatabase() {
  if (!consultationHqEnabled()) throw new Error("CONSULTATION_HQ_DISABLED");
  if (!consultationDatabaseAllowed()) throw new Error("CONSULTATION_DATABASE_NOT_ALLOWED");
}

export class ConsultationRequestConflictError extends Error {
  constructor() {
    super("CONSULTATION_REQUEST_CONFLICT");
    this.name = "ConsultationRequestConflictError";
  }
}

/**
 * The schema fixes object-key order and strips unknown input. Arrays retain the
 * submitted order. Opt-out contact data is erased before it enters either the
 * snapshot or its fingerprint. Nothing is inferred from tracking URLs.
 */
export function consultationPayloadSnapshot(input: ConsultationPayload) {
  const payload = sanitizeConsultationPayload(payloadSchema.parse(input));
  const serialized = JSON.stringify(payload);
  return {
    payload,
    originalPayload: JSON.parse(serialized) as Prisma.InputJsonObject,
    payloadHash: createHash("sha256").update(serialized).digest("hex"),
  };
}

/** Durably save stage 1 before attempting the existing Sheet delivery. */
export async function saveConsultationLead(
  input: ConsultationPayload,
  options: { previewOnly?: boolean } = {},
) {
  requireConsultationDatabase();
  const previewOnly = options.previewOnly === true;
  if (previewOnly && !consultationPreviewIntakeEnabled()) {
    throw new Error("CONSULTATION_PREVIEW_INTAKE_DISABLED");
  }
  if (isPreview() && !previewOnly) throw new Error("CONSULTATION_PREVIEW_ONLY_REQUIRED");
  const { payload, originalPayload, payloadHash } = consultationPayloadSnapshot(input);
  try {
    const lead = await prisma.consultationLead.create({
      data: {
        requestId: payload.requestId,
        payloadHash,
        originalPayload,
        storeName: payload.storeName,
        contactName: payload.contactName || null,
        industry: payload.industry,
        phone: payload.phone || null,
        lineId: payload.lineId || null,
        contactWay: payload.contactWay || null,
        websiteUrl: payload.websiteUrl || null,
        facebookUrl: payload.facebookUrl || null,
        instagramUrl: payload.instagramUrl || null,
        sheetStatus: previewOnly ? "NOT_SENT_PREVIEW" : "PENDING",
      },
    });
    return { lead, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    // The unique requestId resolves concurrent creates. Never upsert/overwrite
    // the original payload, and never merge by store name or contact details.
    requireConsultationDatabase();
    const lead = await prisma.consultationLead.findUnique({ where: { requestId: payload.requestId } });
    if (!lead) throw error;
    if (lead.payloadHash !== payloadHash
      || (lead.sheetStatus === "NOT_SENT_PREVIEW") !== previewOnly) {
      throw new ConsultationRequestConflictError();
    }
    return { lead, created: false };
  }
}

/**
 * At most one POST can be claimed. SENDING intentionally has no timeout/lease:
 * a crash or lost response may already have written the Sheet. Only a lead for
 * which no POST has ever been attempted remains eligible for this claim.
 */
export async function claimConsultationDelivery(id: string): Promise<boolean> {
  requireConsultationDatabase();
  if (isPreview()) throw new Error("CONSULTATION_PREVIEW_DELIVERY_DISABLED");
  const result = await prisma.consultationLead.updateMany({
    where: { id, sheetStatus: "PENDING", sheetAttemptedAt: null },
    data: { sheetStatus: "SENDING", sheetAttemptedAt: new Date() },
  });
  return result.count === 1;
}

/** Finalize only the one in-flight attempt; terminal outcomes cannot be reset. */
export async function markConsultationDelivery(
  id: string,
  status: "CONFIRMED" | "UNKNOWN",
): Promise<boolean> {
  requireConsultationDatabase();
  if (isPreview()) throw new Error("CONSULTATION_PREVIEW_DELIVERY_DISABLED");
  // Guard the runtime boundary too, including callers written in JavaScript.
  if (status !== "CONFIRMED" && status !== "UNKNOWN") throw new Error("INVALID_CONSULTATION_SHEET_STATUS");
  const result = await prisma.consultationLead.updateMany({
    where: { id, sheetStatus: "SENDING" },
    data: {
      sheetStatus: status,
      ...(status === "CONFIRMED" ? { sheetConfirmedAt: new Date() } : {}),
    },
  });
  return result.count === 1;
}
