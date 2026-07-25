"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { DigitalButlerService } from "@/server/services/digital-butler";

type ActionResult = { success: true } | { success: false; error: string };

async function writableStoreId(): Promise<string> {
  const user = await requirePermission("plans.edit");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) throw new Error("請先切換到特定店舖");
  return storeId;
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

export async function publishDigitalButlerFlowAction(flowId: string): Promise<ActionResult> {
  try {
    const storeId = await writableStoreId();
    await new DigitalButlerService().publishFlow(storeId, flowId);
    revalidatePath("/dashboard/settings/digital-butler");
    return { success: true };
  } catch (error) {
    return { success: false, error: message(error) };
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
