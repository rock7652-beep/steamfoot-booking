"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { createHealthRecord } from "@/lib/health-service";
import { toLocalDateStr } from "@/lib/date-utils";
import {
  healthRecordFormData,
  healthRecordInputSchema,
} from "@/lib/health-record-input";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";

export type SaveCustomerHealthRecordState = {
  error: string | null;
  fieldErrors?: Record<string, string[]>;
};

export const initialSaveCustomerHealthRecordState: SaveCustomerHealthRecordState = {
  error: null,
};

export async function saveCustomerHealthRecord(
  _previous: SaveCustomerHealthRecordState,
  formData: FormData,
): Promise<SaveCustomerHealthRecordState> {
  const user = await getCurrentUser();
  const store = await getStoreContext();
  if (!user || user.role !== "CUSTOMER" || !store?.storeId) {
    return { error: "登入已逾時，請重新登入後再試" };
  }

  if (!(await hasStoreFeature(store.storeId, FEATURES.AI_HEALTH_SUMMARY))) {
    return { error: "此店目前尚未開放健康評估" };
  }

  const parsed = healthRecordInputSchema.safeParse(healthRecordFormData(formData));
  if (!parsed.success) {
    return {
      error: "請檢查量測內容",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (parsed.data.measuredAt > toLocalDateStr()) {
    return { error: "量測日期不可晚於今天", fieldErrors: { measuredAt: ["量測日期不可晚於今天"] } };
  }

  const resolved = await resolveCustomerForUser({
    userId: user.id,
    sessionCustomerId: user.customerId ?? null,
    sessionEmail: user.email ?? null,
    storeId: store.storeId,
    storeSlug: store.storeSlug,
  });
  if (!resolved.customer) return { error: "無法確認顧客資料，請重新登入" };

  const customer = await prisma.customer.findFirst({
    where: {
      id: resolved.customer.id,
      storeId: store.storeId,
      mergedIntoCustomerId: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      gender: true,
      height: true,
      healthProfileId: true,
    },
  });
  if (!customer) return { error: "無法確認顧客資料，請重新登入" };

  let saved;
  try {
    saved = await createHealthRecord({
      requestId: parsed.data.requestId,
      steamfootCustomerId: customer.id,
      profileId: customer.healthProfileId,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        gender: customer.gender,
        height: customer.height,
      },
      record: parsed.data,
    });
  } catch (error) {
    console.error("[saveCustomerHealthRecord] HealthFlow write failed", {
      customerId: customer.id,
      storeId: store.storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "健康資料暫時無法儲存，請稍後再試；本次未寫入任何紀錄" };
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      healthProfileId: saved.profileId,
      healthLinkStatus: "linked",
      healthSyncedAt: new Date(),
    },
  });

  const path = `/s/${store.storeSlug}/health`;
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
