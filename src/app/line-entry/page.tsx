import { cookies, headers } from "next/headers";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { LineEntryAutoRedirect } from "./auto-redirect";

/**
 * /s/[slug]/line-entry?ref=xxx — LINE 推薦中繼頁（公開）
 *
 * 用途：
 *   1. 讀取 ?ref=xxx 推薦碼 → 由 LineEntryAutoRedirect (client) 寫入 cookie，
 *      後續註冊/LINE login 流程可讀取綁定 sponsorId
 *   2. 顯示品牌/店家資訊 + 「加入官方 LINE」CTA（不直接 redirect）
 *   3. Fallback：即便沒有 ref 也能正常顯示並提供 LINE 入口
 *
 * 不做的事：
 *   - 不寫 DB 的 Referral 事件表（目前 schema 無 ReferralEvent；待有 migration 再擴充）
 *   - 不強制登入
 *   - 不在 Server Component 直接 cookies().set()（Next.js 不允許，改由 client 寫）
 *
 * proxy.ts 已把 /s/[slug]/line-entry 加入 storePublicPrefixes 白名單，
 * 所以 subPath=/line-entry 會 rewrite 到此頁。
 */

const LINE_OFFICIAL_URL = "https://lin.ee/u3DuNiu";

export default async function LineEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const ref = params.ref?.trim() || null;

  // 讀取店家資訊（從 proxy 注入的 x-active-store-id 或 cookie）
  const headerList = await headers();
  const cookieStore = await cookies();
  const storeId =
    headerList.get("x-active-store-id") ??
    cookieStore.get("domain-store-id")?.value ??
    null;

  // 嘗試找出推薦人姓名（給中繼頁做信任感，若查不到也沒關係）
  let inviterName: string | null = null;
  if (ref) {
    try {
      const inviter = await prisma.customer.findUnique({
        where: { id: ref },
        select: { name: true },
      });
      inviterName = inviter?.name ?? null;
    } catch {
      inviterName = null;
    }
  }

  // 嘗試找出店家名稱
  let storeName = "蒸足健康站";
  if (storeId) {
    try {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      });
      if (store?.name) storeName = store.name;
    } catch {
      // fallback 保留預設
    }
  }

  return (
    <>
      <LineEntryAutoRedirect lineUrl={LINE_OFFICIAL_URL} delayMs={2500} refCode={ref} />
      <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
        <div className="mx-auto max-w-md px-5 py-10">
          {/* ── 品牌區 ── */}
          <section className="rounded-3xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-2xl bg-primary-100 flex items-center justify-center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-primary-600"
                >
                  <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </div>
            </div>
            <h1 className="mt-4 text-center text-xl font-bold text-earth-900">
              {storeName}
            </h1>
            <p className="mt-1 text-center text-sm text-earth-500">
              溫和的蒸足體驗，幫你重新認識身體
            </p>

            {/* ── 推薦人標記 ── */}
            {inviterName && (
              <div className="mt-5 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-center">
                <p className="text-xs text-primary-700">
                  來自朋友的推薦
                </p>
                <p className="mt-0.5 text-sm font-semibold text-primary-900">
                  {inviterName} 邀請你一起體驗
                </p>
              </div>
            )}
          </section>

          {/* ── CTA：加入官方 LINE ── */}
          <section className="mt-5 rounded-3xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
            <p className="text-center text-sm text-earth-600">
              加入官方 LINE，預約或諮詢都更方便
            </p>
            <a
              href={LINE_OFFICIAL_URL}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#05b54d] active:scale-[0.98]"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              加入官方 LINE
            </a>
            <p className="mt-3 text-center text-[11px] text-earth-400">
              {ref ? "系統已記錄推薦人，下次註冊時自動綁定" : "將自動為您導向 LINE"}
            </p>
          </section>

          {/* ── 已有帳號？ ── */}
          <section className="mt-5 text-center text-xs text-earth-500">
            已經是會員？{" "}
            <Link href="/" className="font-medium text-primary-600 hover:underline">
              前往預約
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
