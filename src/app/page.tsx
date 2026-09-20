import { SteamButlerLogo } from "@/components/steam-butler-logo";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { OAuthButtons } from "./oauth-buttons";
import { CustomerLoginForm } from "./customer-login-form";
import { RefCapture } from "@/components/ref-capture";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";
import { resolveStoreBySlug } from "@/lib/store-resolver";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { requiresCourseLiffEntry } from "@/lib/store-line-config";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallbackError: "登入失敗，請重試。若持續失敗請改用手機登入。",
  OAuthAccountNotLinked: "此帳號尚未綁定，請先使用手機登入後再綁定。",
  AccessDenied: "登入被拒絕，請重試。",
  OAuthStoreContextLost: "登入返回時遺失店舖資訊，請回到原店舖專屬連結後重新登入。",
  StaffEmailBlocked:
    "此 Email 為後台帳號，無法用於顧客登入。請使用其他帳號，或從後台登入頁登入。",
  default: "登入時發生錯誤，請重試。",
};

/**
 * 顧客登入頁 — 純 public page，不呼叫 auth()；只讀 store metadata 顯示前台店名。
 *
 * 已登入用戶由 proxy.ts 在 rewrite 前 redirect（CUSTOMER → /book，Staff → /admin），
 * 進到這裡的一定是未登入狀態，不需要再檢查 session。
 *
 * storeSlug 由 proxy 注入 cookie，storeId 在 form submit 時由 server action 解析。
 */
export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;

  // 優先讀 proxy 注入的 header（當次請求準確值），fallback 到 cookie
  const headerList = await headers();
  const cookieStore = await cookies();
  const storeSlug = headerList.get("x-store-slug") ?? cookieStore.get("store-slug")?.value ?? "zhubei";
  const prefix = `/s/${storeSlug}`;
  const store = await resolveStoreBySlug(storeSlug);
  const storeName = getCustomerFacingStoreName(store ?? { slug: storeSlug });
  // Only explicitly selected LIFF stores require the store-validated flow.
  // Legacy web trials keep their existing central OAuth entry.
  const lineEntryHref = store && await getStoreIndustryModule(store.id) === "course" && requiresCourseLiffEntry(storeSlug)
    ? `${prefix}/liff` : undefined;

  const errorMessage = params.error
    ? ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.default
    : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top_left,#e7eee7_0%,#f8f5ee_55%,#f3ebdd_100%)] px-4 py-10">
      <RefCapture />
      <div className="w-full max-w-md rounded-[28px] border border-[#ded8ca] border-t-[3px] border-t-[#bd974e] bg-white p-7 shadow-[0_20px_70px_-30px_rgba(15,59,46,0.22)] sm:p-10">
        {/* Store brand + product brand */}
        <div className="mb-7 border-b border-[#e9e3d7] pb-7 text-center">
          <SteamButlerLogo className="mx-auto mb-6 w-60 max-w-full" />
          <h1 className="text-2xl font-semibold text-[#0F3B2E]">{storeName}</h1>
          <p className="mt-1 text-sm text-earth-500">會員登入與預約</p>
        </div>

        {/* 登入表單 */}
        <div className="">
          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <OAuthButtons storeSlug={storeSlug} lineEntryHref={lineEntryHref} />

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-earth-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-earth-400">
                或使用手機登入
              </span>
            </div>
          </div>

          <CustomerLoginForm storeSlug={storeSlug} storeId={store?.id} />

          <div className="mt-4 text-center">
            <Link
              href={`${prefix}/register`}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              註冊新帳號
            </Link>
          </div>
        </div>

        {/* 後台入口 — 保留 store context */}
        <div className="mt-6 border-t border-[#e9e3d7] pt-5 text-center">
          <Link
            href={storeSlug && storeSlug !== "__hq__" ? `/hq/login?store=${storeSlug}` : "/hq/login"}
            prefetch={false}
            className="text-sm text-[#65776c] hover:text-[#0F3B2E]"
          >
            後台登入
          </Link>
        </div>
      </div>
    </main>
  );
}
