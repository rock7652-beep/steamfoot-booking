import { auth } from "@/lib/auth";
import { FinalizeTrigger } from "./_components/finalize-trigger";

/**
 * /oauth-confirm/finalize — PR-2 step 4d
 *
 * NEED_LOGIN 流程完成密碼登入後的綁定執行頁。流程：
 *   1. 從 customer-phone signIn redirect 過來，現在 NextAuth session 已建立
 *   2. 此頁讀 auth() 確認登入 + 帶 customerId / callbackUrl 給 client
 *   3. client 元件 onMount 自動 call finalizeLineBind 寫 lineUserId + 清 temp
 *   4. 寫完 → window.location.href = /api/auth/signin?callbackUrl=...（RELOGIN）
 *
 * 為什麼是「auto-call on mount」而非按鈕？
 *   到這頁的使用者已經完成意圖確認（輸入手機 + 密碼），bind 是流程的最後一步，
 *   不需要再點一次。失敗時 client 會切到錯誤畫面。
 */

interface PageProps {
  searchParams: Promise<{
    customerId?: string;
    callbackUrl?: string;
  }>;
}

export default async function OAuthConfirmFinalizePage({
  searchParams,
}: PageProps) {
  const session = await auth();
  const { customerId, callbackUrl } = await searchParams;

  // 必須有 NextAuth session（從 customer-phone 登入過來）
  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h1 className="mb-2 text-base font-semibold text-amber-900">
            需要先登入
          </h1>
          <p className="text-sm text-amber-800">
            此頁面需先完成手機+密碼登入才能進入。請重新從 LINE 登入流程開始。
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

  if (!customerId) {
    return (
      <main className="mx-auto max-w-sm px-4 py-12">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            缺少必要參數，無法完成綁定。請重新從 LINE 登入流程開始。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="rounded-lg border border-earth-200 bg-white p-5 shadow-sm">
        <FinalizeTrigger
          customerId={customerId}
          callbackUrl={callbackUrl ?? "/"}
        />
      </div>
    </main>
  );
}
