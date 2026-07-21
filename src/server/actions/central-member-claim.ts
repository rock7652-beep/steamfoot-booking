"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/session";
import { claimExistingCustomersByLineAndPhone } from "@/server/services/central-member-claim";
import { CENTRAL_MEMBER_STORE_COOKIE } from "@/lib/central-member-store";

export type CentralMemberClaimState = {
  error: string | null;
  success: boolean;
  claimedCount: number;
};

export async function claimCentralMembershipsAction(
  _previous: CentralMemberClaimState,
  formData: FormData,
): Promise<CentralMemberClaimState> {
  const session = await requireSession();
  if (session.role !== "CUSTOMER") {
    return { error: "只有顧客帳號可以認領會員資料", success: false, claimedCount: 0 };
  }
  if (!session.customerId) {
    return { error: "目前門市會員身份尚未完成連結，請聯繫店家協助確認", success: false, claimedCount: 0 };
  }
  const phone = String(formData.get("claimPhone") ?? "");

  const result = await claimExistingCustomersByLineAndPhone({
    userId: session.id,
    currentCustomerId: session.customerId,
    enteredPhone: phone,
  });
  if (result.status === "claimed") {
    (await cookies()).delete(CENTRAL_MEMBER_STORE_COOKIE);
    revalidatePath("/", "layout");
    return { error: null, success: true, claimedCount: result.claimedStoreIds.length };
  }
  if (result.status === "nothing_to_claim") {
    return { error: null, success: true, claimedCount: 0 };
  }

  const messages: Record<string, string> = {
    line_identity_required: "此功能需從已綁定的 LINE 會員帳號使用；原門市預約不受影響",
    phone_mismatch: "手機號碼與目前會員資料不一致，請重新確認或聯繫店家",
    current_membership_unverified: "目前門市會員身份尚未完成連結，請聯繫店家協助確認",
    phone_unavailable: "目前門市尚未設定有效手機，請聯繫店家協助確認",
    multiple_customers_in_store: "同一門市有多筆相同手機資料，請聯繫店家協助確認",
    customer_owned_by_another_user: "此會員資料已屬於另一個登入帳號，請聯繫店家協助確認",
    identity_owned_by_another_user: "此會員身份已連到另一個帳號，請聯繫店家協助確認",
    existing_membership_conflict: "目前帳號在該門市已有其他會員資料，請聯繫店家協助確認",
  };
  return { error: messages[result.reason], success: false, claimedCount: 0 };
}
