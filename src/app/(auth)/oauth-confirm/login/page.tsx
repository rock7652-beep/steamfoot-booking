import { getOAuthTempSession } from "@/lib/oauth-temp-session";
import { OAuthConfirmLoginForm } from "./_components/login-form";

/**
 * /oauth-confirm/login — PR-2 step 4c
 *
 * NEED_LOGIN 流程的密碼登入頁：使用者在 /oauth-confirm 輸入手機後，若該 phone 對應
 * 已啟用 Customer，被導到這裡輸入密碼。submit → oauthConfirmLoginAction → signIn
 * customer-phone → redirect /oauth-confirm/finalize → finalizeLineBind 寫 lineUserId。
 *
 * 設計依據：docs/identity-flow.md §2 流程圖 NEED_LOGIN 分支
 *
 * 訪問前提：
 *   - URL 帶 phone, customerId, callbackUrl
 *   - OAuth temp session 仍有效（NEED_LOGIN 路徑刻意不 clear）
 */

interface PageProps {
  searchParams: Promise<{
    phone?: string;
    customerId?: string;
    callbackUrl?: string;
  }>;
}

export default async function OAuthConfirmLoginPage({ searchParams }: PageProps) {
  const session = await getOAuthTempSession();
  const { phone, customerId, callbackUrl } = await searchParams;

  // session 已過期或必要參數遺失 → 顯示錯誤
  if (!session || !phone || !customerId) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h1 className="mb-2 text-base font-semibold text-amber-900">
            登入流程已過期
          </h1>
          <p className="text-sm text-amber-800">
            此頁面的有效時間已超過，請重新從 LINE 登入。
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/auth/signin/line"
            className="mt-4 inline-block rounded-md bg-[#06C755] px-4 py-2 text-sm font-medium text-white hover:bg-[#05b04c]"
          >
            重新登入
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="rounded-lg border border-earth-200 bg-white p-5 shadow-sm">
        <h1 className="mb-1 flex items-center gap-1.5 text-base font-semibold text-earth-900">
          <span aria-hidden>🔐</span>
          <span>請輸入密碼</span>
        </h1>
        <p className="mb-4 text-sm text-earth-600">
          此手機已有會員資料，請先登入以完成 LINE 綁定
        </p>
        <div className="mb-4 rounded-md bg-earth-50 px-3 py-2">
          <p className="text-xs text-earth-500">手機號碼</p>
          <p className="font-medium text-earth-800">{phone}</p>
        </div>
        <OAuthConfirmLoginForm
          customerId={customerId}
          callbackUrl={callbackUrl ?? "/"}
        />
      </div>
    </main>
  );
}
