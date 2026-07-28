import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { selectCentralMemberStoreAction } from "@/server/actions/central-member-store";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";

export default async function StoreSelectPage() {
  const user = await getCurrentUser();
  const resolved =
    user?.role === "CUSTOMER"
      ? await resolveCentralMembershipsForUser(user.id)
      : { memberships: [], conflicts: [] };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="text-center">
        <p className="text-sm font-semibold text-primary-700">蒸管家中央會員</p>
        <h1 className="mt-2 text-2xl font-bold text-earth-900">
          {resolved.memberships.length > 0 ? "請選擇您的門市" : "無法確認店舖資訊"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-earth-600">
          {resolved.memberships.length > 0
            ? "只會顯示已連結到您帳號的門市，各店方案、堂數與預約分開管理。"
            : "目前找不到可選擇的門市，請由店家提供的專屬連結重新進入。"}
        </p>
      </div>

      {resolved.memberships.length > 0 ? (
        <div className="mt-8 space-y-3">
          {resolved.memberships.map((membership) => (
            <form key={membership.storeId} action={selectCentralMemberStoreAction}>
              <input type="hidden" name="storeSlug" value={membership.storeSlug} />
              <button
                type="submit"
                className="flex min-h-[76px] w-full items-center justify-between gap-4 rounded-2xl border border-earth-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md"
              >
                <span>
                  <span className="block text-lg font-bold text-earth-900">
                    {membership.storeName}
                  </span>
                  <span className="mt-1 block text-xs text-earth-500">
                    進入此門市會員首頁
                  </span>
                </span>
                <span aria-hidden="true" className="text-2xl text-primary-600">
                  →
                </span>
              </button>
            </form>
          ))}
        </div>
      ) : (
        <Link
          href="/"
          className="mx-auto mt-7 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-600 px-6 text-sm font-semibold text-white hover:bg-primary-700"
        >
          回首頁
        </Link>
      )}

      {resolved.conflicts.length > 0 && (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs leading-5 text-amber-800">
          部分門市連結需要店家協助確認，其他已連結門市仍可正常使用。
        </p>
      )}
    </main>
  );
}
