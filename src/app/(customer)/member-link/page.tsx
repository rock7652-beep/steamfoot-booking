import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";
import { getCustomerLoginMethods } from "@/server/queries/customer-login-methods";
import { CentralMemberLinkFlow } from "./central-member-link-flow";

interface PageProps {
  searchParams: Promise<{ link?: string; provider?: string }>;
}

export default async function MemberLinkPage({ searchParams }: PageProps) {
  const [user, storeContext, query] = await Promise.all([
    getCurrentUser(),
    getStoreContext(),
    searchParams,
  ]);

  if (!user || !storeContext) return null;

  const [memberships, loginMethods] = await Promise.all([
    resolveCentralMembershipsForUser(user.id),
    getCustomerLoginMethods(user.id),
  ]);
  const prefix = `/s/${storeContext.storeSlug}`;
  // A legacy same-store session can be the first verified membership even
  // before CustomerIdentityLink has been backfilled. The claim service
  // re-reads and verifies Customer.userId / identityLinks in its transaction.
  const hasCurrentMembership =
    Boolean(user.customerId && user.storeId === storeContext.storeId) ||
    memberships.memberships.some(
      (membership) => membership.storeId === storeContext.storeId,
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${prefix}/profile`} className="text-sm font-medium text-earth-600 hover:text-earth-900">
          ← 回我的資料
        </Link>
        <p className="mt-5 text-sm font-semibold text-primary-700">蒸管家中央會員</p>
        <h1 className="mt-1 text-2xl font-bold text-earth-900">連結我的會員資料</h1>
        <p className="mt-2 text-sm leading-relaxed text-earth-600">
          完成後可在同一個帳號查看已連結門市，並透過正確的 LINE 身份接收通知。
        </p>
      </div>

      {query.link === "success" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          LINE 驗證完成，請繼續確認會員手機。
        </div>
      )}
      {query.link === "conflict" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          此 LINE 已屬於其他中央會員，系統未做任何變更，請聯絡門市協助確認。
        </div>
      )}
      {query.link === "expired" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          LINE 驗證已逾時，系統未做任何變更，請重新操作。
        </div>
      )}

      <CentralMemberLinkFlow
        hasLineAccount={loginMethods.line.linked}
        hasCurrentMembership={hasCurrentMembership}
        membershipCount={memberships.memberships.length}
        callbackUrl={`${prefix}/member-link?link=success`}
      />

      <div className="rounded-xl border border-earth-200 bg-earth-50 px-4 py-4 text-sm leading-relaxed text-earth-600">
        <p className="font-semibold text-earth-800">系統不會做的事</p>
        <p className="mt-1">不依姓名猜測、不合併各店顧客、不搬動方案／堂數／預約／交易，也不覆蓋已屬於其他帳號的身份。</p>
      </div>
    </div>
  );
}
