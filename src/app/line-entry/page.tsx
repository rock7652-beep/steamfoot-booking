import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveLineReferralEntry } from "@/server/queries/line-referral-entry";

export const dynamic = "force-dynamic";

/**
 * 公開推薦入口。驗證必須全部在 server 完成，client 不接觸 LINE 目的地。
 */
export default async function LineEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; source?: string }>;
}) {
  const params = await searchParams;
  const headerList = await headers();
  const cookieStore = await cookies();
  const storeSlug =
    headerList.get("x-store-slug") ?? cookieStore.get("store-slug")?.value ?? null;

  const result = await resolveLineReferralEntry(storeSlug, params.ref ?? null);

  if (result.status === "READY") {
    const source = params.source?.trim().slice(0, 100) || "line-entry";
    await prisma.referralEvent.createMany({
      data: [
        {
          storeId: result.storeId,
          referrerId: result.referrerId,
          type: "LINK_CLICK",
          source,
        },
        {
          storeId: result.storeId,
          referrerId: result.referrerId,
          type: "LINE_ENTRY",
          source,
        },
      ],
    });
    redirect(result.lineOfficialUrl);
  }

  const message =
    result.status === "LINE_NOT_CONFIGURED"
      ? "此店家尚未完成 LINE 設定，暫時無法使用推薦分享。"
      : result.status === "STORE_UNAVAILABLE"
        ? "此店家目前未開放推薦分享。"
        : "這個推薦連結無效，請向分享者索取新的連結。";

  return (
    <main className="min-h-screen bg-earth-50 px-5 py-16">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-7 text-center shadow-sm">
        <h1 className="text-xl font-bold text-earth-900">無法開啟推薦連結</h1>
        <p className="mt-3 text-sm leading-relaxed text-earth-700">{message}</p>
      </section>
    </main>
  );
}
