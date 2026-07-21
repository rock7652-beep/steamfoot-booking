import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { totalAvailableToBook } from "@/lib/wallet-availability";
import { prisma } from "@/lib/db";
import { resolveCentralMembershipsForUser } from "@/server/services/central-member-resolver";
import { selectCentralMemberStoreAction } from "@/server/actions/central-member-store";

export default async function MemberStoresPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER") redirect("/");

  const resolved = await resolveCentralMembershipsForUser(user.id);
  if (resolved.memberships.length === 0) redirect("/store-select");

  const stores = await Promise.all(
    resolved.memberships.map(async (membership) => {
      const [wallets, pendingPeople] = await Promise.all([
        prisma.customerPlanWallet.findMany({
          where: { customerId: membership.customerId, status: "ACTIVE" },
          select: {
            remainingSessions: true,
            bookings: {
              where: { bookingStatus: { in: ["PENDING", "CONFIRMED"] }, isMakeup: false },
              select: { bookingStatus: true, isMakeup: true, people: true },
            },
            sessions: {
              where: { status: { in: ["AVAILABLE", "RESERVED"] } },
              select: { status: true },
            },
          },
        }),
        prisma.booking.aggregate({
          where: {
            customerId: membership.customerId,
            bookingStatus: { in: ["PENDING", "CONFIRMED"] },
            bookingDate: { gte: new Date() },
          },
          _sum: { people: true },
        }),
      ]);
      return {
        ...membership,
        available: totalAvailableToBook(wallets),
        pending: pendingPeople._sum.people ?? 0,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-md py-3 sm:py-8">
      <div className="mb-6 text-center">
        <p className="text-sm font-semibold text-primary-700">蒸管家中央會員</p>
        <h1 className="mt-2 text-2xl font-bold text-earth-900">今天要前往哪間門市？</h1>
        <p className="mt-2 text-sm leading-6 text-earth-600">方案與預約會依門市分開顯示，選擇後仍可隨時切換。</p>
      </div>
      <div className="space-y-3">
        {stores.map((store) => (
          <form key={store.storeId} action={selectCentralMemberStoreAction}>
            <input type="hidden" name="storeSlug" value={store.storeSlug} />
            <button type="submit" className="w-full rounded-2xl border border-earth-200 bg-white p-5 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md">
              <span className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-lg font-bold text-earth-900">{store.storeName}</span>
                  <span className="mt-1 block text-xs text-earth-500">選擇此門市進入首頁</span>
                </span>
                <span aria-hidden="true" className="text-2xl text-primary-600">→</span>
              </span>
              <span className="mt-4 grid grid-cols-2 gap-3 border-t border-earth-100 pt-4">
                <span><span className="block text-xs text-earth-500">可再預約</span><span className="mt-1 block text-xl font-bold text-primary-700">{store.available} 堂</span></span>
                <span><span className="block text-xs text-earth-500">待到店</span><span className="mt-1 block text-xl font-bold text-earth-800">{store.pending} 堂</span></span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
