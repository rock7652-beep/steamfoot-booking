import { cookies, headers } from "next/headers";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { LineEntryActions } from "./actions";
import {
  createLinkClickEvent,
  createLineEntryEvent,
} from "@/server/services/referral-events";
import { isReferralCodeFormat } from "@/lib/referral-code";

/**
 * /s/[slug]/line-entry?ref=xxx — LINE 推薦中繼頁（公開）
 *
 * 用途：
 *   1. 讀取 ?ref=xxx 推薦碼 → 由 LineEntryActions (client) 寫入 pending-ref cookie，
 *      後續 OAuth signIn callback 讀取綁定 sponsorId
 *   2. 顯示品牌/店家資訊 + 兩顆 CTA（使用者自己選；不再自動跳轉）：
 *      - 主：「用 LINE 登入開始」(NextAuth line provider) → /s/{slug}/book
 *      - 次：「先加入官方 LINE」(OA 連結，不建帳)
 *
 * `?ref=` 接受兩種格式（backward compat）：
 *   - 新：6 碼 referralCode（`Customer.referralCode`）
 *   - 舊：customer.id（cuid，Phase 1 之前已在用）
 *   兩者以 OR 查詢，任一命中即視為有效推薦人。無效 ref 完全不擋流程。
 *
 * 不做的事：
 *   - 不強制登入
 *   - 不自動跳轉（這輪移除）
 *   - 不在 Server Component 直接 cookies().set()（Next.js 不允許，改由 client 寫）
 *
 * proxy.ts 已把 /s/[slug]/line-entry 加入 storePublicPrefixes 白名單，
 * 所以 subPath=/line-entry 會 rewrite 到此頁。
 */

const LINE_OFFICIAL_URL = "https://lin.ee/u3DuNiu";

export default async function LineEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; source?: string }>;
}) {
  const params = await searchParams;
  const rawRef = params.ref?.trim() || null;
  const source = params.source?.trim() || null;

  // 讀取店家資訊（proxy.ts 注入 x-store-slug header + store-slug cookie）
  const headerList = await headers();
  const cookieStore = await cookies();
  const storeSlug =
    headerList.get("x-store-slug") ??
    cookieStore.get("store-slug")?.value ??
    "zhubei";

  // 依 slug 查 store（取 id + name；找不到時用 DEFAULT_STORE）
  let storeId: string | null = null;
  let storeName = "蒸足健康站";
  try {
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, name: true },
    });
    if (store) {
      storeId = store.id;
      storeName = store.name;
    }
  } catch {
    // fallback 保留預設
  }

  // 解析 ref → referrerCustomerId
  // 依 ref 格式分派查詢：
  //   - 6 碼 referralCode 格式 → 查 Customer.referralCode
  //   - 其他（通常是 25 碼 cuid / customer.id）→ 查 Customer.id
  // 用 isReferralCodeFormat 擋一層，避免 migration 前去查不存在的欄位造成 log 噪音。
  // 無效 ref = null，不擋流程。
  let referrerCustomerId: string | null = null;
  let inviterName: string | null = null;
  if (rawRef) {
    try {
      const normalized = rawRef.toUpperCase();
      // referralCode 是 nullable，Prisma 的 findUnique 對 named @@unique 的型別組合較挑，
      // 用 findFirst 走同一個 unique index，避免 type 難點；id 分支仍可 findUnique。
      const inviter = isReferralCodeFormat(normalized)
        ? await prisma.customer.findFirst({
            where: { referralCode: normalized },
            select: { id: true, name: true },
          })
        : await prisma.customer.findUnique({
            where: { id: rawRef },
            select: { id: true, name: true },
          });
      if (inviter) {
        referrerCustomerId = inviter.id;
        inviterName = inviter.name;
      }
    } catch {
      // 無效 ref 或查詢失敗 → 不擋流程，降級為一般進站
      referrerCustomerId = null;
      inviterName = null;
    }
  }

  // 事件埋點：進頁即視為 LINK_CLICK + LINE_ENTRY（fire-and-forget）
  // 只有在 storeId 可解析 + ref 命中時才寫 referrerId（FK 到 Customer.id）
  if (storeId) {
    const eventInput = {
      storeId,
      referrerId: referrerCustomerId,
      source: source ?? "line-entry",
    };
    void Promise.allSettled([
      createLinkClickEvent(eventInput),
      createLineEntryEvent(eventInput),
    ]).catch(() => {});
  }

  return (
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
              <p className="text-xs text-primary-700">來自朋友的推薦</p>
              <p className="mt-0.5 text-sm font-semibold text-primary-900">
                {inviterName} 邀請你一起體驗
              </p>
            </div>
          )}
        </section>

        {/* ── CTA 區：兩個按鈕，不自動跳 ── */}
        <section className="mt-5 rounded-3xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <p className="mb-4 text-center text-sm text-earth-600">
            開始你的第一次蒸足體驗
          </p>
          <LineEntryActions
            lineOfficialUrl={LINE_OFFICIAL_URL}
            storeSlug={storeSlug}
            referrerCustomerId={referrerCustomerId}
            storeId={storeId}
            source={source}
          />
        </section>

        {/* ── 已有帳號？ ── */}
        <section className="mt-5 text-center text-xs text-earth-500">
          已經是會員？{" "}
          <Link
            href={`/s/${storeSlug}/`}
            className="font-medium text-primary-600 hover:underline"
          >
            前往登入
          </Link>
        </section>
      </div>
    </div>
  );
}
