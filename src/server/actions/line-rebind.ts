"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { normalizePhone } from "@/lib/normalize";
import { AppError, handleActionError } from "@/lib/errors";
import { cancelLineRebindRequest, createLineRebindRequest } from "@/server/services/line-rebind";
import { runLineRebindDryRun, type LineRebindDryRunResult } from "@/server/services/line-rebind-dry-run";
import { cleanupPr2SmokeFixture, createPr2SmokeFixture } from "@/server/services/line-rebind-smoke-fixture";
import type { ActionResult } from "@/types";

const createSchema = z.object({
  customerId: z.string().cuid(),
  reason: z.string().trim().min(20).max(500),
});

function requireRebindAdministrator(actor: { role: string }) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "僅限 OWNER 或 ADMIN 管理 LINE 重新綁定申請");
  }
}

function requirePreviewSmokeRuntime() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const directUrl = process.env.DIRECT_URL ?? "";
  if (process.env.VERCEL_ENV !== "preview" || !databaseUrl.includes("ttworfzgwejdeolegkxl") || !directUrl.includes("ttworfzgwejdeolegkxl") || databaseUrl.includes("qijlnhtpbintanzpxkvf") || directUrl.includes("qijlnhtpbintanzpxkvf")) {
    throw new AppError("FORBIDDEN", "此測試入口僅限 Staging Preview 執行");
  }
}

function requireSmokeOwner(actor: { role: string }) {
  if (actor.role !== "OWNER") throw new AppError("FORBIDDEN", "僅限 OWNER 管理 Staging smoke fixture");
}

/** PR-1 only: creates a 15-minute capture window, never a rebind. */
export async function createLineRebindCaptureRequest(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ requestId?: string; expiresAt?: string; status: "created" | "active_request_exists" }>> {
  try {
    const actor = await requirePermission("customer.identity.rebind");
    requireRebindAdministrator(actor);
    const data = createSchema.parse(input);
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId }, select: { id: true, storeId: true, phone: true, lineUserId: true },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(actor, customer.storeId);
    const phone = normalizePhone(customer.phone);
    if (!/^09\d{8}$/.test(phone)) throw new AppError("VALIDATION", "顧客手機資料格式不正確");
    if (!customer.lineUserId) throw new AppError("VALIDATION", "顧客尚無既有 LINE 綁定，無法建立重新綁定申請");
    const result = await createLineRebindRequest({
      storeId: customer.storeId, customerId: customer.id, createdByUserId: actor.id,
      reason: data.reason, normalizedPhone: phone, oldLineUserId: customer.lineUserId,
    });
    return { success: true, data: result.status === "created"
      ? { status: result.status, requestId: result.requestId, expiresAt: result.expiresAt.toISOString() }
      : { status: result.status } };
  } catch (error) {
    return handleActionError(error);
  }
}

export async function cancelLineRebindCaptureRequest(requestId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("customer.identity.rebind");
    requireRebindAdministrator(actor);
    const request = await prisma.lineRebindRequest.findUnique({ where: { id: requestId }, select: { storeId: true } });
    if (!request) throw new AppError("NOT_FOUND", "重新綁定申請不存在");
    assertStoreAccess(actor, request.storeId);
    const cancelled = await cancelLineRebindRequest({ requestId, storeId: request.storeId, cancelledByUserId: actor.id });
    if (!cancelled) throw new AppError("VALIDATION", "此申請已不可取消");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}

/** PR-2: strictly read-only verification; PR-3 owns every binding write. */
export async function dryRunLineRebind(requestId: string): Promise<ActionResult<LineRebindDryRunResult>> {
  try {
    const actor = await requirePermission("customer.identity.rebind");
    requireRebindAdministrator(actor);
    const request = await prisma.lineRebindRequest.findUnique({ where: { id: requestId }, select: { storeId: true } });
    if (!request) throw new AppError("NOT_FOUND", "重新綁定申請不存在");
    assertStoreAccess(actor, request.storeId);
    return { success: true, data: await runLineRebindDryRun(requestId) };
  } catch (error) {
    return handleActionError(error);
  }
}

/** Temporary PR-2 Preview smoke entry. Remove after browser smoke and cleanup. */
export async function createPr2PreviewSmokeFixture(): Promise<ActionResult<{ customerId: string; requestId: string; expiresAt: string }>> {
  try {
    requirePreviewSmokeRuntime();
    const actor = await requirePermission("customer.identity.rebind");
    requireSmokeOwner(actor);
    assertStoreAccess(actor, "staging-store");
    return { success: true, data: await createPr2SmokeFixture(actor.id) };
  } catch (error) { return handleActionError(error); }
}

export async function cleanupPr2PreviewSmokeFixture(): Promise<ActionResult<{ removed: boolean }>> {
  try {
    requirePreviewSmokeRuntime();
    const actor = await requirePermission("customer.identity.rebind");
    requireSmokeOwner(actor);
    assertStoreAccess(actor, "staging-store");
    return { success: true, data: await cleanupPr2SmokeFixture() };
  } catch (error) { return handleActionError(error); }
}
