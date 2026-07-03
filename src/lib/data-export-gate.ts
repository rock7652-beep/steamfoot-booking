import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature, requireStoreFeature } from "@/lib/feature-gate";

export const DATA_EXPORT_LOCKED_MESSAGE = "資料匯出尚未開通，請聯絡總部加購或升級方案";
export const DATA_EXPORT_SELECT_STORE_MESSAGE = "請先切換到指定分店，再匯出資料";

export function dataExportForbiddenResponse(message = DATA_EXPORT_LOCKED_MESSAGE): NextResponse {
  return new NextResponse(message, { status: 403 });
}

export async function hasDataExportFeature(storeId: string | null | undefined): Promise<boolean> {
  if (!storeId) return false;
  return hasStoreFeature(storeId, FEATURES.DATA_EXPORT);
}

export async function requireDataExportFeature(
  storeId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!storeId) return dataExportForbiddenResponse(DATA_EXPORT_SELECT_STORE_MESSAGE);

  try {
    await requireStoreFeature(storeId, FEATURES.DATA_EXPORT);
    return null;
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") {
      return dataExportForbiddenResponse();
    }
    throw error;
  }
}
