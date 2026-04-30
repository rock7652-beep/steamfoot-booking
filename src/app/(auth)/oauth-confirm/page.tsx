import { getOAuthTempSession } from "@/lib/oauth-temp-session";
import { OAuthConfirmForm } from "./_components/oauth-confirm-form";

/**
 * /oauth-confirm — PR-2 step 2
 *
 * LINE OAuth 找不到既有 Customer 時的身份確認頁。使用者輸入手機後，
 * server action `resolveLineLogin` 依 (lineUserId, phone) 三分支判定。
 *
 * 設計依據：docs/identity-flow.md §2 完整流程 + §4 UI 文案
 *
 * Server component 職責：
 *   - 讀取 OAuth temp session（不可信內容、僅取 displayName 顯示給使用者）
 *   - 拿到 callbackUrl（之後傳遞給 client form 用於 RELOGIN）
 *   - 沒 session → 顯示「流程已過期」提示，不顯示表單
 *
 * 不傳遞給 client：lineUserId / nonce / storeId（敏感欄位，server 持有即可）
 */

interface PageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function OAuthConfirmPage({ searchParams }: PageProps) {
  const session = await getOAuthTempSession();
  const { callbackUrl } = await searchParams;

  // 沒 session 或過期 → 顯示「請重新從 LINE 登入」
  // 設計選擇：不自動 redirect 回 LINE，避免 infinite loop（萬一 LINE 那邊也壞）
  if (!session) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h1 className="mb-2 text-base font-semibold text-amber-900">
            登入流程已過期
          </h1>
          <p className="text-sm text-amber-800">
            此頁面的有效時間已超過，請重新從 LINE 登入。
          </p>
          {/* NextAuth signin 是 API route 不是 Next page，必須用 <a> 觸發完整 page navigation */}
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
          <span aria-hidden>🔒</span>
          <span>驗證身份</span>
        </h1>
        <p className="mb-4 text-sm text-earth-600">
          請輸入手機號碼（用於確認是否已有會員）
        </p>
        {session.displayName && (
          <p className="mb-4 text-xs text-earth-500">
            LINE 帳號：<span className="font-medium text-earth-700">{session.displayName}</span>
          </p>
        )}
        <OAuthConfirmForm callbackUrl={callbackUrl ?? "/"} />
      </div>
    </main>
  );
}
