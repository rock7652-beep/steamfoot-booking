import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ProfileForm } from "./profile-form";
import { missingRequiredFields } from "@/lib/customer-completion";
import { getStoreContext } from "@/lib/store-context";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";

interface PageProps {
  searchParams: Promise<{ complete?: string; next?: string }>;
}

/**
 * 我的資料
 *
 * 兼任「完成註冊」入口：
 *   - ?complete=1 → 顯示 onboarding 提示，按鈕文案改「完成註冊」
 *   - ?next=/s/... → 儲存成功後自動跳回原路徑
 *
 * Hardening:
 *   - 不做 role 檢查（由 (customer)/layout.tsx 處理）
 *   - 不對 !customer 做 redirect("/")（會被 proxy 導回 /book → 看起來像「跳回首頁」）
 *   - 找不到 Customer 時顯示 onboarding 提示並提供空表單，讓顧客完成資料
 */
export default async function ProfilePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const onboardingMode = sp?.complete === "1";
  const nextPath = sp?.next ?? null;

  const user = await getCurrentUser();
  const profileStoreCtx = await getStoreContext();
  const prefix = `/s/${profileStoreCtx?.storeSlug ?? "zhubei"}`;

  // ── 以統一 resolver 找出本 session 對應的 customer ──────
  // 同一份邏輯也用於 updateProfileAction，確保「顯示看到的人」= 「儲存更新的人」
  type ProfileCustomer = {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    gender: string | null;
    birthday: Date | null;
    address: string | null;
    notes: string | null;
  };
  let customer: ProfileCustomer | null = null;
  let resolvedReason: string | null = null;
  // 表單需要知道 User 是否已有 passwordHash —— 控制密碼欄位是必填還是「留空＝不變更」
  let hasPassword = false;
  if (user) {
    try {
      const storeId = user.storeId ?? profileStoreCtx?.storeId ?? null;
      const [resolved, userPwRow] = await Promise.all([
        resolveCustomerForUser({
          userId: user.id,
          sessionCustomerId: user.customerId ?? null,
          sessionEmail: user.email ?? null,
          storeId,
          storeSlug: profileStoreCtx?.storeSlug ?? null,
        }),
        prisma.user.findUnique({
          where: { id: user.id },
          select: { passwordHash: true },
        }),
      ]);
      resolvedReason = resolved.reason;
      hasPassword = !!userPwRow?.passwordHash;
      console.info("[profile.page] resolved", {
        userId: user.id,
        sessionCustomerId: user.customerId ?? null,
        sessionEmail: user.email ?? null,
        storeId,
        resolvedCustomerId: resolved.customer?.id ?? null,
        reason: resolved.reason,
        hasPassword,
      });
      if (resolved.customer) {
        // 取完整欄位（resolver 只回必要欄位）
        const full = await prisma.customer.findUnique({
          where: { id: resolved.customer.id },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            gender: true,
            birthday: true,
            address: true,
            notes: true,
          },
        });
        if (full) customer = full;
      }
    } catch (err) {
      console.error("[profile.page] resolve failed", err);
    }
  }

  const birthdayStr = customer?.birthday
    ? customer.birthday.toISOString().slice(0, 10)
    : null;

  // 年齡計算
  let age: number | null = null;
  if (customer?.birthday) {
    const today = new Date();
    const birth = new Date(customer.birthday);
    age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
  }

  const customerForForm = customer
    ? {
        name: customer.name ?? "",
        // OAuth 佔位 phone（_oauth_xxx）不顯示給使用者，讓他們自己填
        phone:
          customer.phone && !customer.phone.startsWith("_oauth_")
            ? customer.phone
            : "",
        email: customer.email,
        gender: customer.gender,
        birthday: birthdayStr,
        address: customer.address,
        notes: customer.notes,
      }
    : {
        name: user?.name ?? "",
        phone: "",
        email: user?.email ?? null,
        gender: null,
        birthday: null,
        address: null,
        notes: null,
      };

  const missing = missingRequiredFields({
    name: customerForForm.name,
    phone: customerForForm.phone,
    email: customerForForm.email,
    birthday: customer?.birthday ?? null,
    gender: customerForForm.gender,
  });
  const needsCompletion = missing.length > 0;
  const showOnboardingBanner = onboardingMode || needsCompletion;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        {/* 補件模式：不顯示返回連結，避免顧客繞過 */}
        {!showOnboardingBanner && (
          <Link href={`${prefix}/book`} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">
            &larr;
          </Link>
        )}
        <h1 className="text-2xl font-bold text-earth-900">我的資料</h1>
      </div>

      <div className="space-y-6">
        {/* 完成註冊 / 補件 onboarding 提示 */}
        {showOnboardingBanner && (
          <div className="rounded-2xl border border-primary-200 bg-primary-50/60 px-5 py-5 text-base">
            {!customer ? (
              <>
                <p className="text-lg font-bold text-primary-800">
                  歡迎使用暖暖蒸足
                </p>
                <p className="mt-2 text-base text-primary-800">
                  請先完成基本資料，才能開始預約與使用服務。
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-primary-800">
                  首次使用請完成基本資料
                </p>
                <p className="mt-2 text-base text-primary-800">
                  為了方便預約與聯繫，請先補齊基本資料後再繼續。
                </p>
              </>
            )}
          </div>
        )}

        {/* 基本資料 */}
        <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-earth-900">基本資料</h2>
          <ProfileForm
            customer={customerForForm}
            age={age}
            hasPassword={hasPassword}
            onboardingMode={showOnboardingBanner}
            nextPath={nextPath}
          />
        </div>

      </div>
    </div>
  );
}
