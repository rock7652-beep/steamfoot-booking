import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ProfileForm } from "./profile-form";
import { missingRequiredFields } from "@/lib/customer-completion";
import { getStoreContext } from "@/lib/store-context";
import { resolveCustomerForUser } from "@/server/queries/customer-completion";
import { customerWelcomeTitle } from "@/lib/customer-welcome";
import { CentralMemberClaimForm } from "./central-member-claim-form";
import { CentralMemberLinkReviewForm } from "./central-member-link-review-form";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";

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
  // Customer-facing brand text must come from the same resolved Store record
  // as the page context. Do not map a slug to a brand or silently default to
  // another store's name.
  const profileStore = profileStoreCtx?.storeId
    ? await prisma.store.findUnique({
        where: { id: profileStoreCtx.storeId },
        select: { name: true },
      })
    : null;
  const welcomeTitle = customerWelcomeTitle(profileStore);
  const centralMember = user
    ? await resolveCentralMembershipsForUser(user.id)
    : { memberships: [], conflicts: [] };
  const pendingLinkReviews = user
    ? await prisma.centralMemberLinkReviewRequest.findMany({
        where: { userId: user.id, status: "PENDING" },
        select: { storeId: true, type: true, createdAt: true },
      })
    : [];
  const pendingReviewByStore = new Map(pendingLinkReviews.map((request) => [request.storeId, request]));

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
                  {welcomeTitle}
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

        {!showOnboardingBanner && (
          <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-earth-900">我的門市會員</h2>
            <p className="mt-2 text-sm leading-6 text-earth-700">
              這裡只顯示已安全認領的門市。各店方案、堂數、預約與交易仍分開計算。
            </p>
            <div className="mt-5 space-y-4">
              {centralMember.memberships.map((membership) => {
                const pendingReview = pendingReviewByStore.get(membership.storeId);
                return (
                  <section key={membership.storeId} className="rounded-xl border border-earth-200 bg-earth-50/50 p-4" aria-labelledby={`membership-${membership.storeId}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 id={`membership-${membership.storeId}`} className="font-bold text-earth-900">{membership.storeName}</h3>
                        <p className="mt-1 text-sm text-earth-700">會員姓名：{membership.customerName}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">已連結</span>
                    </div>
                    {pendingReview ? (
                      <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {pendingReview.type === "NOT_MY_MEMBERSHIP" ? "非本人資料回報" : "解除連結申請"}待門市確認中；目前連結仍保留。
                      </p>
                    ) : (
                      <CentralMemberLinkReviewForm storeId={membership.storeId} />
                    )}
                  </section>
                );
              })}
              {centralMember.memberships.length === 0 && (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">目前尚未找到可管理的門市會員連結，原門市預約不受影響。</p>
              )}
              {centralMember.conflicts.length > 0 && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">部分門市連結狀態異常，系統已停止顯示，請聯繫店家協助確認。</p>
              )}
            </div>
          </div>
        )}

        {!showOnboardingBanner && (
          <div className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-earth-900">認領其他門市會員資料</h2>
            <p className="mb-5 mt-2 text-sm leading-6 text-earth-700">
              若你曾用相同手機在其他門市留下資料，可透過已綁定的 LINE 身份與目前會員手機完成確認，不需要設定密碼。無法確認時仍可照常使用目前門市。
            </p>
            <CentralMemberClaimForm />
          </div>
        )}

      </div>
    </div>
  );
}
