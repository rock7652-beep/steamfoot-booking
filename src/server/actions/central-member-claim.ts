"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { claimExistingCustomersByVerifiedPhone } from "@/server/services/central-member-claim";

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
  const password = String(formData.get("claimPassword") ?? "");
  if (!password) {
    return { error: "請輸入登入密碼完成驗證", success: false, claimedCount: 0 };
  }

  const result = await claimExistingCustomersByVerifiedPhone({
    userId: session.id,
    password,
  });
  if (result.status === "claimed") {
    revalidatePath("/", "layout");
    return { error: null, success: true, claimedCount: result.claimedStoreIds.length };
  }
  if (result.status === "nothing_to_claim") {
    return { error: null, success: true, claimedCount: 0 };
  }

  const messages: Record<string, string> = {
    invalid_credentials: "密碼錯誤，請重新輸入",
    phone_unavailable: "中央帳號尚未設定有效手機，請先更新基本資料",
    multiple_customers_in_store: "同一門市有多筆相同手機資料，請聯繫店家協助確認",
    customer_owned_by_another_user: "此會員資料已屬於另一個登入帳號，請聯繫店家協助確認",
    identity_owned_by_another_user: "此會員身份已連到另一個帳號，請聯繫店家協助確認",
    existing_membership_conflict: "目前帳號在該門市已有其他會員資料，請聯繫店家協助確認",
  };
  return { error: messages[result.reason], success: false, claimedCount: 0 };
}
