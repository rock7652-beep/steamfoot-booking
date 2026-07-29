"use server";

import { revalidatePath } from "next/cache";
import {
  createDigitalButlerPublishDiagnosticId,
  logDigitalButlerPublishFailure,
} from "@/lib/digital-butler-publish-diagnostics";
import { digitalButlerPublishErrorMessage } from "@/lib/digital-butler-publish-error";
import { publishedMenuOptions } from "@/lib/digital-butler-published-view";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import { prisma } from "@/lib/db";
import { DigitalButlerService } from "@/server/services/digital-butler";

type ActionResult = { success: true } | { success: false; error: string };
type PublishActionResult =
  | {
    success: true;
    publishedVersion: {
      id: string;
      version: number;
      publishedAt: string | null;
      menuLabels: string[];
    };
  }
  | { success: false; error: string };

async function writableStoreId(): Promise<string> {
  const user = await requirePermission("plans.edit");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) throw new Error("請先切換到特定店舖");
  return storeId;
}

async function leadCollectionUpgradeContext() {
  const user = await requirePermission("plans.edit");
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new Error("DIGITAL_BUTLER_LEAD_COLLECTION_UPGRADE_FORBIDDEN");
  }
  const storeId = await resolveWriteStoreId(user);
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, slug: true } });
  if (!store) throw new Error("DIGITAL_BUTLER_STORE_NOT_FOUND");
  return { store, actor: { userId: user.id, role: user.role } as const };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "操作失敗";
}

export async function createDigitalButlerFlowAction(input: {
  name: string;
  definition: unknown;
}): Promise<ActionResult> {
  try {
    const storeId = await writableStoreId();
    await new DigitalButlerService().createDraftFlow({
      storeId,
      name: input.name.trim(),
      draftDefinition: input.definition as never,
    });
    revalidatePath("/dashboard/settings/digital-butler");
    return { success: true };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function saveDigitalButlerFlowAction(input: {
  flowId: string;
  name: string;
  definition: unknown;
}): Promise<ActionResult> {
  try {
    const storeId = await writableStoreId();
    await new DigitalButlerService().updateDraft(
      storeId,
      input.flowId,
      input.name,
      input.definition as never,
    );
    revalidatePath("/dashboard/settings/digital-butler");
    return { success: true };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export async function publishDigitalButlerFlowAction(flowId: string): Promise<PublishActionResult> {
  let storeId: string | null = null;
  try {
    storeId = await writableStoreId();
    const publishedVersion = await new DigitalButlerService().publishFlow(storeId, flowId);
    revalidatePath("/dashboard/settings/digital-butler");
    return {
      success: true,
      publishedVersion: {
        id: publishedVersion.id,
        version: publishedVersion.version,
        publishedAt: publishedVersion.publishedAt?.toISOString() ?? null,
        menuLabels: publishedMenuOptions(publishedVersion.steps).map((option) => option.label),
      },
    };
  } catch (error) {
    const diagnosticId = createDigitalButlerPublishDiagnosticId();
    logDigitalButlerPublishFailure({ diagnosticId, storeId, flowId, error });
    return {
      success: false,
      error: `${digitalButlerPublishErrorMessage(error)}\n診斷代碼：${diagnosticId}`,
    };
  }
}

export async function setDigitalButlerFlowEnabledAction(
  flowId: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const storeId = await writableStoreId();
    await new DigitalButlerService().setFlowEnabled(storeId, flowId, enabled);
    revalidatePath("/dashboard/settings/digital-butler");
    return { success: true };
  } catch (error) {
    return { success: false, error: message(error) };
  }
}

export type LeadCollectionUpgradePreviewResult =
  | {
    success: true;
    storeSlug: string;
    preview: Awaited<ReturnType<DigitalButlerService["previewLeadCollectionUpgrade"]>>;
  }
  | { success: false; error: string };

export async function previewDigitalButlerLeadCollectionUpgradeAction(): Promise<LeadCollectionUpgradePreviewResult> {
  try {
    const { store, actor } = await leadCollectionUpgradeContext();
    const preview = await new DigitalButlerService().previewLeadCollectionUpgrade(store.id, actor);
    return { success: true, storeSlug: store.slug, preview };
  } catch (error) {
    return { success: false, error: digitalButlerPublishErrorMessage(error) };
  }
}

export type LeadCollectionUpgradePublishResult =
  | { success: true; alreadyUpgraded: boolean; newActiveVersionId: string; newActiveVersion: number }
  | { success: false; error: string };

export async function publishDigitalButlerLeadCollectionUpgradeAction(
  confirmationSlug: string,
): Promise<LeadCollectionUpgradePublishResult> {
  try {
    const { store, actor } = await leadCollectionUpgradeContext();
    if (confirmationSlug.trim() !== store.slug) {
      return { success: false, error: "確認文字與目前店別不符" };
    }
    const result = await new DigitalButlerService().publishLeadCollectionUpgrade(store.id, actor);
    if (!result.publishedVersion) throw new Error("DIGITAL_BUTLER_PUBLISHED_VERSION_NOT_FOUND");
    revalidatePath("/dashboard/settings/digital-butler");
    return {
      success: true,
      alreadyUpgraded: result.alreadyUpgraded,
      newActiveVersionId: result.publishedVersion.id,
      newActiveVersion: result.publishedVersion.version,
    };
  } catch (error) {
    return { success: false, error: digitalButlerPublishErrorMessage(error) };
  }
}
